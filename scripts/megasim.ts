/**
 * MEGASIM — high-throughput full-session Monte-Carlo across the WHOLE drill
 * library. Each iteration builds a real drill session, drives it to completion
 * with an idealized athlete, and asserts it terminates cleanly with sane
 * metrics. Accumulates a cumulative session count across invocations so we can
 * reach 1,000,000+ real sessions. Flags: throws, non-termination, NaN metrics.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { ALL_DRILLS } from "../src/drills/registry";
import { createDrillSession } from "../src/drills/shared/DrillSession";
import { buildSessionResult } from "../src/drills/shared/DrillResult";
import { makeRng } from "../src/utils/rng";
type TrialSpecLite = { decor?: boolean; meta?: { decor?: boolean }; groupMode?: string; groupId?: string; seq?: number };

const BUDGET_MS = Number(process.env.BUDGET_MS ?? 40000);
const COUNT_FILE = "/tmp/megacount.txt";
const prior = existsSync(COUNT_FILE) ? Number(readFileSync(COUNT_FILE, "utf8").trim()) || 0 : 0;

const PROFILES = [
  { name: "novice", lat: 640, sd: 190, hitP: 0.7 },
  { name: "average", lat: 430, sd: 110, hitP: 0.86 },
  { name: "elite", lat: 285, sd: 55, hitP: 0.97 },
];
function gauss(rng: () => number, m: number, s: number) {
  return m + s * Math.sqrt(-2 * Math.log(rng() + 1e-9)) * Math.cos(2 * Math.PI * rng());
}

const issues = new Map<string, number>();
const flag = (k: string) => issues.set(k, (issues.get(k) ?? 0) + 1);

let sessions = 0;
const t0 = Date.now();
let seed = (prior + 1) * 2654435761 % 2147483647;

outer: while (Date.now() - t0 < BUDGET_MS) {
  for (const def of ALL_DRILLS) {
    if (Date.now() - t0 >= BUDGET_MS) break outer;
    const level = 1 + Math.floor((seed % def.levels.length));
    const prof = PROFILES[seed % 3];
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    try {
      const engine = createDrillSession(def, level, 112, seed, {});
      const rng = makeRng(seed);
      const eng = engine as unknown as {
        active: Map<string, { spec: TrialSpecLite; resolved: boolean; kind: string }>;
        timing: { now: number };
      };
      engine.start();
      const bound = def.durationMs(def.levels[level - 1].parameters) * 1.9 + 20000;
      const scheduled = new Map<string, number>(); // targetId -> hit time
      let simTime = 0;
      while (engine.getState() !== "complete" && engine.getState() !== "aborted" && simTime < bound) {
        engine.update(50); simTime += 50;
        const now = eng.timing.now;
        // reactive responder — handles ordered sequences, grouped recall, singles
        const orderedNext = new Map<string, { id: string; seq: number }>();
        for (const [id, t] of eng.active) {
          if (t.resolved || t.spec.decor || t.spec.meta?.decor || t.kind !== "go") continue;
          if (t.spec.groupMode === "ordered" && t.spec.groupId) {
            const cur = orderedNext.get(t.spec.groupId);
            const seq = t.spec.seq ?? 0;
            if (!cur || seq < cur.seq) orderedNext.set(t.spec.groupId, { id, seq });
            continue;
          }
          if (!scheduled.has(id)) scheduled.set(id, now + Math.max(150, gauss(rng, prof.lat, prof.sd)));
        }
        // ordered: hit the current expected cell as soon as it is due
        for (const { id } of orderedNext.values()) {
          if (!scheduled.has(id)) scheduled.set(id, now + Math.max(300, gauss(rng, prof.lat * 1.1, prof.sd)));
        }
        for (const [id, at] of scheduled) {
          if (at > now) continue;
          scheduled.delete(id);
          if (rng() > prof.hitP) continue; // occasional miss
          try {
            if (engine.definition.responseMode === "trigger") engine.registerTriggerResponse("right");
            else engine.registerHit(id, "right");
          } catch { /* already resolved */ }
        }
      }
      if (engine.getState() !== "complete" && engine.getState() !== "aborted") flag(`${def.id}|NO_TERMINATION`);
      const r = buildSessionResult(engine, { athleteId: "x", athleteName: "x", level, levelLabel: "", device: {} as never });
      const m = r.result.metrics;
      if (!Number.isFinite(m.accuracyPct) || m.accuracyPct < 0 || m.accuracyPct > 100) flag(`${def.id}|BAD_ACCURACY`);
      if (m.avgReactionMs !== undefined && !Number.isFinite(m.avgReactionMs)) flag(`${def.id}|NAN_RT`);
      if (r.result.aq.overall !== undefined && !Number.isFinite(r.result.aq.overall)) flag(`${def.id}|NAN_AQ`);
      sessions++;
    } catch (err) {
      flag(`${def.id}|THREW:${String((err as Error).message).slice(0, 40)}`);
    }
  }
}

const total = prior + sessions;
writeFileSync(COUNT_FILE, String(total));
console.log(JSON.stringify({
  batchSessions: sessions,
  cumulativeSessions: total,
  sessionsPerSec: Math.round(sessions / ((Date.now() - t0) / 1000)),
  issueClasses: issues.size,
  issues: Object.fromEntries(issues),
}));
