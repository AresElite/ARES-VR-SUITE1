/**
 * A.R.E.S. Simulation Harness v2 — the ATHLETE-EXPERIENCE battery.
 *
 * Two layers:
 *  STATIC PLAN ANALYSIS (every drill × 25 levels × seeds × option combos):
 *   - standardization: exactly 25 levels; difficulty monotonicity
 *   - fairness: simultaneous-target overlap, unfair double-spawn ISI,
 *     hand-rule L/R balance, go-window feasibility (strike vs trigger)
 *   - athlete comfort: reach envelope, session length, trial-count floor,
 *     dead-air gaps in fixed-duration formats, label collision spacing
 *  DYNAMIC RUNS (novice / average / elite virtual athletes):
 *   - stuck sessions, pool overflow, zero-metric sessions
 *   - Goldilocks calibration: elite floor at L1, novice ceiling at L25
 */
import { writeFileSync } from "node:fs";
import { ALL_DRILLS } from "../src/drills/registry";
import { createDrillSession } from "../src/drills/shared/DrillSession";
import { computeMetrics } from "../src/ares/scoring";
import { makeRng } from "../src/utils/rng";
import type { DrillDefinition, TrialSpec } from "../src/ares/drillTypes";

const SEED_BASE = Number(process.env.SEED_BASE ?? 1);
const PHASE = process.env.PHASE;
const OUT = process.env.OUT ?? "/tmp/simout/out.json";

interface Profile { name: string; lat: number; latSd: number; hitP: number; noGoStrikeP: number }
const PROFILES: Profile[] = [
  { name: "novice", lat: 640, latSd: 190, hitP: 0.7, noGoStrikeP: 0.32 },
  { name: "average", lat: 430, latSd: 110, hitP: 0.86, noGoStrikeP: 0.15 },
  { name: "elite", lat: 285, latSd: 55, hitP: 0.97, noGoStrikeP: 0.05 },
];

const issues = new Map<string, number>();
const flag = (k: string) => issues.set(k, (issues.get(k) ?? 0) + 1);
let staticTrials = 0;
let dynamicEvents = 0;
let runs = 0;

const gauss = (rng: () => number, mu: number, sd: number) => {
  const u = Math.max(1e-9, rng()); const v = Math.max(1e-9, rng());
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/** All trainer option combinations for a drill (bounded). */
function optionCombos(def: DrillDefinition): Record<string, string>[] {
  const opts = def.options ?? [];
  if (opts.length === 0) return [{}];
  let combos: Record<string, string>[] = [{}];
  for (const o of opts) {
    const next: Record<string, string>[] = [];
    for (const c of combos) for (const v of o.values) next.push({ ...c, [o.id]: v.id });
    combos = next;
  }
  // cap the matrix (EHC = 3*7*5 = 105 -> sample every 3rd)
  return combos.length > 36 ? combos.filter((_, i) => i % 3 === 0) : combos;
}

function buildPlan(def: DrillDefinition, level: number, seed: number, opts: Record<string, string>): { trials: TrialSpec[]; params: Record<string, unknown> } {
  const lvl = def.levels[level - 1];
  const merged: Record<string, unknown> = { ...lvl.parameters };
  for (const o of def.options ?? []) merged[o.id] = opts[o.id] ?? o.defaultValue;
  return { trials: def.buildTrials(merged, makeRng(seed)), params: merged };
}

const isScoreable = (t: TrialSpec) => !t.decor && !t.meta?.decor;
const isStatic = (t: TrialSpec) => !t.velocity && !t.lane;
const goWindow = (t: TrialSpec) => t.duration;

/** difficulty index for monotonicity: bigger = easier */
function easeIndex(trials: TrialSpec[]): number {
  const score = trials.filter(isScoreable);
  const gos = score.filter((t) => t.kind === "go" || t.switchKindTo === "go");
  // ordered/all groups: the athlete's real budget is window / group size
  const bySize = new Map<string, number>();
  for (const t of score) if (t.groupId) bySize.set(t.groupId, (bySize.get(t.groupId) ?? 0) + 1);
  const win = gos.map((t) => (t.groupId ? goWindow(t) / Math.max(1, bySize.get(t.groupId) ?? 1) : goWindow(t)));
  const avgWin = win.length ? win.reduce((a, b) => a + b, 0) / win.length : 0;
  const avgScale = score.reduce((a, t) => a + t.scale, 0) / Math.max(1, score.length);
  return avgWin * (0.5 + avgScale * 8);
}

function staticChecks(def: DrillDefinition, level: number, trials: TrialSpec[], comboKey: string) {
  const key = `${def.id}|L${level}${comboKey}`;
  const scoreable = trials.filter(isScoreable);
  staticTrials += scoreable.length;

  // trial-count floor (metrics need volume) — fixed-duration formats exempt
  const goLike = scoreable.filter((t) => t.kind === "go" || t.switchKindTo === "go");
  const singleModeGroups = new Set(
    goLike.filter((t) => t.groupId && (t.groupMode ?? "single") === "single").map((t) => t.groupId),
  );
  const memberReps = goLike.filter((t) => t.groupId && (t.groupMode ?? "single") !== "single").length;
  const decisions = goLike.filter((t) => !t.groupId).length + singleModeGroups.size + memberReps;
  const floor = memberReps > 0 && memberReps >= decisions * 0.8 ? 5 : 8;
  if (!def.hardStop && decisions < floor) flag(`${key}|TRIALS_UNDER_${floor}`);

  // session length sanity
  const dur = def.durationMs(def.levels[level - 1].parameters);
  if (dur < 15000) flag(`${key}|SESSION_UNDER_15S`);
  if (dur > 250000) flag(`${key}|SESSION_OVER_4MIN`);

  // reach envelope for static strike targets
  if (def.responseMode !== "trigger") {
    for (const t of scoreable) {
      if (!isStatic(t)) continue;
      if (Math.abs(t.position[0]) > 0.92) flag(`${key}|X_OUT_OF_REACH`);
      if (t.position[1] < 0.85 || t.position[1] > 2.0) flag(`${key}|Y_OUT_OF_REACH`);
      if (t.position[2] < -1.1) flag(`${key}|Z_TOO_FAR`);
      if (goWindow(t) < 380 && t.kind === "go" && !t.chainId && !t.groupId) flag(`${key}|GO_WINDOW_LT_380`);
    }
  } else {
    for (const t of scoreable) if (t.kind === "go" && goWindow(t) < 280) flag(`${key}|TRIGGER_WINDOW_LT_280`);
  }

  // designed-set spacing: grouped grids/pads must be laid out clash-free
  // (the engine's runtime avoidance intentionally never moves these)
  const live = scoreable.filter((t) => t.spawnAt >= 0 && t.groupId);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]; const b = live[j];
      const overlapT = Math.min(a.spawnAt + a.duration, b.spawnAt + b.duration) - Math.max(a.spawnAt, b.spawnAt);
      if (overlapT <= 0 || !isStatic(a) || !isStatic(b)) continue;
      const d = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2]);
      if (a.groupId === b.groupId) {
        if (d < (a.scale + b.scale) * 1.05) flag(`${key}|GRID_CELLS_TOUCH`);
      } else if (d < (a.scale + b.scale) * 1.35) {
        flag(`${key}|TARGETS_OVERLAP`);
      }
    }
  }

  // unfair double-spawn bursts in single-focus strike drills
  const singleFocus = !def.hardStop && !["chaos-arena", "cognitive-crossfire", "sport-transfer"].some((x) => def.id.startsWith(x));
  if (singleFocus && def.responseMode !== "trigger") {
    const goTimes = scoreable.filter((t) => t.kind === "go" && !t.groupId && !t.chainId).map((t) => t.spawnAt).sort((x, y) => x - y);
    for (let i = 1; i < goTimes.length; i++) {
      if (goTimes[i] - goTimes[i - 1] < 250) flag(`${key}|GO_BURST_LT_250MS`);
    }
  }

  // hand-rule balance
  const handed = scoreable.filter((t) => t.requiredHand === "left" || t.requiredHand === "right");
  if (handed.length >= 10) {
    const left = handed.filter((t) => t.requiredHand === "left").length;
    const ratio = left / handed.length;
    if (ratio < 0.32 || ratio > 0.68) flag(`${key}|HAND_IMBALANCE`);
  }

  // dead air in fixed-duration formats (>5s with nothing live)
  if (def.hardStop) {
    // approximation: non-chained scheduled gaps only
    const sched = scoreable.filter((t) => t.spawnAt >= 0).sort((a, b) => a.spawnAt - b.spawnAt);
    for (let i = 1; i < sched.length; i++) {
      const gap = sched[i].spawnAt - (sched[i - 1].spawnAt + sched[i - 1].duration);
      if (gap > 5000) flag(`${key}|DEAD_AIR_GT_5S`);
    }
  }
}

function dynamicRun(def: DrillDefinition, level: number, profile: Profile, seed: number, opts: Record<string, string>): number | null {
  runs++;
  const key = `${def.id}|L${level}`;
  const rng = makeRng(seed * 31 + level * 7);
  const engine = createDrillSession(def, level, 60, seed, opts);
  const pending: { id: string; at: number; spec: TrialSpec }[] = [];
  const liveNow = new Map<string, TrialSpec>();
  engine.subscribe((e) => {
    if (e.type === "despawn") {
      liveNow.delete(e.targetId);
      return;
    }
    if (e.type !== "spawn") return;
    const s = e.spec;
    if (s.decor || s.meta?.decor) return;
    // RUNTIME overlap check — positions after the engine's spawn avoidance
    if (!s.velocity && !s.lane && !s.groupId) {
      for (const o of liveNow.values()) {
        if (o.velocity || o.lane || o.groupId) continue;
        const d = Math.hypot(s.position[0] - o.position[0], s.position[1] - o.position[1]);
        if (d < (s.scale + o.scale) * 1.3) flag(`${key}|RUNTIME_OVERLAP`);
      }
      liveNow.set(s.id, s);
    }
    if (s.kind === "go" && s.groupMode !== "ordered") {
      const lat = Math.max(150, gauss(rng, profile.lat, profile.latSd));
      // stop-signal awareness: athletes cancel when the stop cue lands first
      const hitAt = engine.timing.now + lat;
      const stops = s.switchKindTo === "noGo" && s.switchKindAt !== undefined && s.switchKindAt < hitAt;
      const cancelP = profile.name === "elite" ? 0.85 : profile.name === "average" ? 0.65 : 0.45;
      if (rng() < profile.hitP && lat < s.duration && !(stops && rng() < cancelP)) {
        pending.push({ id: s.id, at: hitAt, spec: s });
      }
    } else if (s.kind === "noGo" && rng() < profile.noGoStrikeP) {
      pending.push({ id: s.id, at: engine.timing.now + Math.max(150, gauss(rng, profile.lat, profile.latSd)), spec: s });
    } else if (s.kind === "distractor" && s.switchKindAt !== undefined && s.switchKindTo === "go") {
      const lat = Math.max(130, gauss(rng, profile.lat * 0.55, profile.latSd * 0.5));
      if (rng() < profile.hitP) pending.push({ id: s.id, at: s.switchKindAt + lat * 0.4, spec: s });
    }
    if (s.groupMode === "ordered" && s.kind === "go") {
      // ordered hunting: real athletes find every number in sequence, with
      // per-cell search-time jitter and an occasional genuine mistap
      const step = Math.max(360, profile.lat * 1.15);
      const jitter = Math.abs(gauss(rng, 0, step * 0.25));
      pending.push({ id: s.id, at: engine.timing.now + 500 + (s.seq ?? 0) * step + jitter, spec: s });
      if (rng() > profile.hitP) {
        // one early wrong-order tap (athlete mistakes 8 for 3) — a single error
        pending.push({ id: s.id, at: engine.timing.now + 500 + Math.max(0, ((s.seq ?? 0) - 2)) * step, spec: s });
      }
    }
  });
  engine.start();
  const bound = def.durationMs(def.levels[level - 1].parameters) * 1.6 + 12000;
  let simTime = 0;
  while (engine.getState() !== "complete" && engine.getState() !== "aborted" && simTime < bound) {
    engine.update(50);
    simTime += 50;
    const now = engine.timing.now;
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].at <= now) {
        const wanted = pending[i].spec.requiredHand;
        const hand = wanted && wanted !== "either" && wanted !== "both" && rng() < 0.92 ? wanted : rng() < 0.5 ? "left" : "right";
        engine.registerHit(pending[i].id, hand as never, pending[i].spec.requiredDirection);
        pending.splice(i, 1);
      }
    }
  }
  if (engine.getState() !== "complete" && engine.getState() !== "aborted") { flag(`${key}|STUCK`); return null; }
  if (engine.pool.overflowCount > 0) flag(`${key}|POOL_OVERFLOW`);
  const evts = engine.getEvents();
  dynamicEvents += evts.length;
  const m = computeMetrics(evts);
  if (m.trials === 0) flag(`${key}|ZERO_SCOREABLE`);
  const hasGo = evts.some((e) => e.reactionMs !== undefined && e.correct);
  if (!hasGo && m.trials > 5) flag(`${key}|NO_RT_METRICS`);
  return m.accuracyPct;
}

// ============================== SWEEP ==============================
for (const def of ALL_DRILLS) {
  if (PHASE && def.phase !== PHASE) continue;
  if (def.levels.length !== 25) flag(`${def.id}|LEVELS_NOT_25(${def.levels.length})`);
  const combos = optionCombos(def);

  // static: all levels × combos × 3 seeds
  for (let level = 1; level <= def.levels.length; level++) {
    for (let ci = 0; ci < combos.length; ci++) {
      for (const s of [SEED_BASE, SEED_BASE + 17, SEED_BASE + 61]) {
        const { trials } = buildPlan(def, level, s * 101 + level, combos[ci]);
        staticChecks(def, level, trials, combos.length > 1 ? `|opt${ci}` : "");
      }
    }
  }

  // monotonicity across levels — composite multi-stream drills exempt
  const composite = ["chaos-arena", "cognitive-crossfire", "sport-transfer"].some((x) => def.id.startsWith(x));
  const ease: number[] = [];
  for (let level = 1; level <= 25; level++) {
    let e = 0;
    for (const s of [SEED_BASE, SEED_BASE + 17, SEED_BASE + 43]) e += easeIndex(buildPlan(def, level, s * 101 + level, {}).trials);
    ease.push(e / 3);
  }
  if (!composite) {
    for (let i = 1; i < 25; i++) {
      if (ease[i] > ease[i - 1] * 1.18) flag(`${def.id}|DIFFICULTY_INVERSION_L${i}toL${i + 1}`);
    }
  }

  // dynamic: all levels × profiles × 2 seeds (default options)
  const accByProfile: Record<string, Record<number, number[]>> = { novice: {}, average: {}, elite: {} };
  for (let level = 1; level <= 25; level++) {
    for (const p of PROFILES) {
      for (const s of [SEED_BASE + 3, SEED_BASE + 29]) {
        const acc = dynamicRun(def, level, p, s * 977 + level * 13, {});
        if (acc !== null) {
          (accByProfile[p.name][level] ??= []).push(acc);
        }
      }
    }
  }
  // Goldilocks calibration
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const eliteL1 = avg(accByProfile.elite[1] ?? []);
  const noviceL25 = avg(accByProfile.novice[25] ?? []);
  if ((accByProfile.elite[1] ?? []).length && eliteL1 < 70) flag(`${def.id}|L1_TOO_HARD_FOR_ELITE(${Math.round(eliteL1)}%)`);
  if ((accByProfile.novice[25] ?? []).length && noviceL25 > 96) flag(`${def.id}|L25_TOO_EASY_FOR_NOVICE(${Math.round(noviceL25)}%)`);
}

const grouped: Record<string, { instances: number; total: number }> = {};
for (const [k, count] of issues) {
  const drill = k.split("|")[0];
  const cls = k.split("|").slice(1).join("|").replace(/L\d+(toL\d+)?/g, "Lx").replace(/\(\d+%?\)/g, "").replace(/\|opt\d+/g, "");
  const gk = `${drill}::${cls}`;
  grouped[gk] = { instances: (grouped[gk]?.instances ?? 0) + 1, total: (grouped[gk]?.total ?? 0) + count };
}
writeFileSync(OUT, JSON.stringify({ runs, staticTrials, dynamicEvents, grouped }, null, 1));
console.log(JSON.stringify({ runs, staticTrials, dynamicEvents, issueClasses: Object.keys(grouped).length }));
for (const k of Object.keys(grouped).sort()) console.log("ISSUE:", k, JSON.stringify(grouped[k]));
