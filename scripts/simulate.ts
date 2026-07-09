/**
 * A.R.E.S. mass simulation harness.
 * Synthetic athletes (novice / average / elite) run every drill × every
 * level × multiple seeds through the REAL DrillEngine, headless.
 * Flags: stuck runs, pool exhaustion, impossible go-windows, unreachable
 * target positions, zero-trial sessions, broken group/chain logic.
 */
import { ALL_DRILLS } from "../src/drills/registry";
import { createDrillSession } from "../src/drills/shared/DrillSession";
import type { TrialSpec } from "../src/ares/drillTypes";

interface Profile { name: string; lat: number; latSd: number; hitP: number; noGoStrikeP: number; orderErrP: number; }
const PROFILES: Profile[] = [
  { name: "novice", lat: 620, latSd: 180, hitP: 0.72, noGoStrikeP: 0.3, orderErrP: 0.2 },
  { name: "average", lat: 430, latSd: 110, hitP: 0.86, noGoStrikeP: 0.15, orderErrP: 0.1 },
  { name: "elite", lat: 290, latSd: 60, hitP: 0.96, noGoStrikeP: 0.06, orderErrP: 0.04 },
];
const SEEDS = [11, 23, 47, 89, 131, 197, 269, 331];
const DT = 40; // ms per step

let issueMap = new Map<string, number>();
const flag = (k: string) => issueMap.set(k, (issueMap.get(k) ?? 0) + 1);
let totalInteractions = 0;
let totalRuns = 0;

function gauss(rng: () => number, mu: number, sd: number) {
  const u = Math.max(1e-9, rng()); const v = Math.max(1e-9, rng());
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
let seedCtr = 1;
function mkRng(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const phaseArg = process.argv[2]; // optional phase filter

for (const def of ALL_DRILLS) {
  if (phaseArg && def.phase !== phaseArg) continue;
  if (def.levels.length !== 25) flag(`${def.id}|LEVELS_NOT_25(${def.levels.length})`);
  for (let level = 1; level <= def.levels.length; level++) {
    for (const profile of PROFILES) {
      for (const seed of SEEDS) {
        totalRuns++;
        const rng = mkRng(seed * 7919 + level * 131 + seedCtr++);
        const engine = createDrillSession(def, level, 60, seed * 101 + level);
        const key = `${def.id}|L${level}`;
        // static feasibility checks on the trial plan
        const pending: { id: string; at: number; spec: TrialSpec }[] = [];
        engine.subscribe((e) => {
          if (e.type === "spawn") {
            const s = e.spec;
            const isMoving = Boolean(s.velocity || s.lane);
            if (!s.decor && !s.meta?.decor && !isMoving) {
              if (Math.abs(s.position[0]) > 0.88) flag(`${key}|X_OUT_OF_REACH`);
              if (s.position[1] < 0.88 || s.position[1] > 1.98) flag(`${key}|Y_OUT_OF_REACH`);
              if (s.position[2] < -1.05) flag(`${key}|Z_TOO_FAR`);
            }
            if (s.kind === "go" && !s.decor && !s.meta?.decor) {
              const goWindow = s.switchKindAt !== undefined ? s.duration : s.duration;
              if (goWindow < 380 && !s.chainId) flag(`${key}|GO_WINDOW_LT_380`);
              // schedule athlete response
              const lat = Math.max(150, gauss(rng, profile.lat, profile.latSd));
              if (rng() < profile.hitP && lat < s.duration) {
                pending.push({ id: s.id, at: engine.timing.now + (s.switchKindAt !== undefined ? (s.switchKindAt - s.spawnAt) + lat * 0.6 : lat), spec: s });
              }
            }
            if (s.kind === "noGo" && rng() < profile.noGoStrikeP) {
              pending.push({ id: s.id, at: engine.timing.now + Math.max(150, gauss(rng, profile.lat, profile.latSd)), spec: s });
            }
            // ordered groups: schedule regardless (engine validates order)
            if (s.groupMode === "ordered" && s.kind === "go" && rng() < profile.hitP) {
              const base = 600 + (s.seq ?? 0) * Math.max(350, profile.lat * 0.9);
              pending.push({ id: s.id, at: engine.timing.now + base + (rng() < profile.orderErrP ? -300 : 0), spec: s });
            }
            // targets switching to go later (stop-signal go->noGo handled above; distractor->go):
            if (s.kind === "distractor" && s.switchKindAt !== undefined && s.switchKindTo === "go" && !s.decor) {
              const lat = Math.max(140, gauss(rng, profile.lat * 0.55, profile.latSd * 0.5));
              if (rng() < profile.hitP) pending.push({ id: s.id, at: s.switchKindAt + lat * 0.4, spec: s });
            }
          }
        });
        engine.start();
        const bound = def.durationMs(def.levels[level - 1].parameters) * 1.6 + 12000;
        let simTime = 0;
        while (engine.getState() !== "complete" && engine.getState() !== "aborted" && simTime < bound) {
          engine.update(DT);
          simTime += DT;
          const now = engine.timing.now;
          for (let i = pending.length - 1; i >= 0; i--) {
            if (pending[i].at <= now) {
              const hand = rng() < 0.5 ? "left" : "right";
              const wanted = pending[i].spec.requiredHand;
              const useHand = wanted && wanted !== "either" && wanted !== "both" && rng() < 0.9 ? wanted : hand;
              engine.registerHit(pending[i].id, useHand as never, pending[i].spec.requiredDirection);
              pending.splice(i, 1);
            }
          }
        }
        if (engine.getState() !== "complete" && engine.getState() !== "aborted") flag(`${key}|STUCK`);
        if (engine.pool.overflowCount > 0) flag(`${key}|POOL_OVERFLOW(${engine.pool.overflowCount})`);
        const evts = engine.getEvents();
        totalInteractions += evts.length;
        if (evts.length === 0) flag(`${key}|ZERO_EVENTS`);
        const scoreable = evts.filter((e) => e.errorType !== "correctRejection").length;
        if (scoreable === 0) flag(`${key}|ZERO_SCOREABLE`);
      }
    }
  }
}

const grouped = new Map<string, string[]>();
for (const [k, count] of issueMap) {
  const [drill, issue] = [k.split("|")[0], k.split("|").slice(1).join("|")];
  const gk = `${drill}::${issue.replace(/\(\d+\)/, "")}`;
  grouped.set(gk, [...(grouped.get(gk) ?? []), `${k}×${count}`]);
}
console.log(JSON.stringify({ totalRuns, totalInteractions, distinctIssues: grouped.size }, null, 1));
for (const [gk, items] of [...grouped].sort()) console.log("ISSUE:", gk, "instances:", items.length);
