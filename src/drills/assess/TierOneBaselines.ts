import type { DrillDefinition, TrialSpec } from "@/ares/drillTypes";
import { pick } from "@/utils/rng";

/**
 * TIER-1 PERFORMANCE BASELINES.
 * The perception-action and divided-attention layer the sensory battery
 * doesn't reach. All three resolve to a threshold or an error distribution
 * (not a raw latency), which is what makes them repeatable.
 *
 * PHASE 1 PROTOTYPE: experience/design validation only. Values here are NOT
 * validated measurements; validated thresholds come from the native build.
 */

const WHITE = "#EAF0FF";
const TEAL = "#2998AA";
const PURPLE = "#8B5CF6";
const GOLD = "#C4B5FD";
const Z = -0.9;
const DIRS = ["up", "down", "left", "right"] as const;

const STANDARD = (parameters: Record<string, unknown> = {}) => [
  { level: 1, label: "Standard Protocol", parameters },
];

// ================= 1. COINCIDENCE-ANTICIPATION TIMING (CAT) =================
// A marker travels a fixed path toward a contact line at constant speed and
// arrives at a KNOWN time. The athlete clicks the trigger at the exact moment
// of arrival. Score = signed timing error (early/late bias) and its SD. The
// single most sport-transferable construct, and robust to timing jitter
// because the athlete is scored against a known arrival, not absolute latency.
const CAT_ARRIVE_MS = 1600; // fixed flight time to the contact line

export const CoincidenceAnticipation: DrillDefinition = {
  id: "assess-cat",
  name: "Coincidence-Anticipation Timing",
  shortName: "Anticipation Timing",
  phase: "Assess",
  description:
    "A marker slides toward the gold contact line and arrives at a fixed, predictable time. Click either trigger the INSTANT it reaches the line — not before, not after. Scored on early/late bias and consistency, not raw speed.",
  purpose: "Coincidence-anticipation timing — perception-action synchronization.",
  interaction: "touch",
  responseMode: "trigger",
  environment: "arena",
  mvp: true,
  assessment: true,
  anticipation: { arriveMs: CAT_ARRIVE_MS },
  instructions: [
    "1. A glowing marker slides steadily toward the GOLD contact line.",
    "2. Its speed is constant and predictable - read the approach.",
    "3. Click EITHER top trigger at the exact moment the marker meets the line.",
    "4. Early clicks score negative, late clicks positive - aim for zero.",
    "5. 20 contacts. Your timing bias and consistency are the score.",
  ],
  controlsHint: "CLICK THE TRIGGER AS THE MARKER MEETS THE GOLD LINE",
  levels: STANDARD({ trials: 20 }),
  buildTrials: (params, rng) => {
    const p = params as { trials: number };
    const trials: TrialSpec[] = [];
    let t = 1500;
    const startX = -0.62;
    const lineX = 0.42;
    const speed = (lineX - startX) / (CAT_ARRIVE_MS / 1000); // constant, m/s
    for (let i = 0; i < p.trials; i++) {
      const y = 1.3 + rng() * 0.32;
      // fixed gold contact line
      trials.push({
        id: `cat-${i}-line`, spawnAt: t, duration: CAT_ARRIVE_MS + 900, kind: "distractor", decor: true,
        zone: "center", position: [lineX, y, Z], color: GOLD, emissive: GOLD, shape: "pad", scale: 0.05,
      });
      // the traveling marker — a GO target, live from spawn through a window
      // past arrival so both early and late clicks register and are scored
      trials.push({
        id: `cat-${i}`, spawnAt: t, duration: CAT_ARRIVE_MS + 700, kind: "go",
        zone: "center", position: [startX, y, Z], velocity: [speed, 0, 0],
        color: TEAL, emissive: TEAL, shape: "sphere", scale: 0.05,
        meta: { arriveMs: CAT_ARRIVE_MS },
      });
      t += CAT_ARRIVE_MS + 1200 + rng() * 400;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number };
    return 1500 + p.trials * (CAT_ARRIVE_MS + 1500) + 1500;
  },
};

// ============ 2. DYNAMIC VISUAL ACUITY — target motion (staircase) ============
// A direction optotype sweeps horizontally at increasing angular velocity.
// Identify its pointing direction by joystick flick. Velocity climbs on a
// correct answer, eases on a wrong one, terminates after 3 consecutive
// misses. Threshold = the highest velocity still identified.
const DVA_LADDER = [20, 30, 45, 65, 90, 120, 155, 195, 240, 290, 345];
interface Stair { idx: number; wrongRun: number; applied: number; best: number | null; done: boolean }
const dvaState: Stair = { idx: 0, wrongRun: 0, applied: DVA_LADDER[0], best: null, done: false };

export const DynamicVisualAcuity: DrillDefinition = {
  id: "assess-dva-motion",
  name: "Dynamic Visual Acuity (Target Motion)",
  shortName: "Dynamic Acuity",
  phase: "Assess",
  description:
    "A pointing arrow sweeps across your view, faster each time you read it correctly. Flick the joystick in the direction it points. Three misses in a row ends the test — the fastest sweep you still identified is your threshold.",
  purpose: "Dynamic visual acuity for moving targets (velocity threshold).",
  interaction: "touch",
  responseMode: "joystick",
  environment: "arena",
  mvp: true,
  assessment: true,
  instructions: [
    "1. An arrow sweeps left-to-right or right-to-left across your view.",
    "2. Read which way it points and FLICK the joystick that direction.",
    "3. Every correct read makes the next sweep FASTER.",
    "4. A miss slows it back down; three misses in a row ends the test.",
    "5. Your threshold - the fastest sweep you resolved - is recorded in deg/s.",
  ],
  controlsHint: "READ THE SWEEPING ARROW - FLICK THE JOYSTICK TO MATCH",
  levels: STANDARD({ maxTrials: 26 }),
  buildTrials: (params, rng) => {
    dvaState.idx = 0; dvaState.wrongRun = 0; dvaState.applied = DVA_LADDER[0];
    dvaState.best = null; dvaState.done = false;
    const p = params as { maxTrials: number };
    const trials: TrialSpec[] = [];
    let t = 2000;
    for (let n = 0; n < p.maxTrials; n++) {
      const dir = pick(rng, DIRS);
      const leftToRight = rng() < 0.5;
      trials.push({
        id: `dva-${n}`, spawnAt: t, duration: 2600, kind: "go",
        zone: "center",
        position: [leftToRight ? -0.7 : 0.7, 1.42 + (rng() - 0.5) * 0.12, Z],
        requiredDirection: dir,
        color: WHITE, emissive: TEAL, shape: "arrow", scale: 0.05,
        meta: { pointDir: dir, dvaFirst: true, leftToRight, stepIdx: n },
      });
      t += 2900;
    }
    return trials;
  },
  onSpawnAdapt: (spec, snapshot, api) => {
    if (dvaState.done) { api.finishEarly(); spec.meta = { ...spec.meta, decor: true }; spec.duration = 10; return; }
    // fold in previous outcome, set this sweep's velocity
    if (snapshot.hits + snapshot.errors > 0 && snapshot.lastEventCorrect !== undefined) {
      if (snapshot.lastEventCorrect) {
        dvaState.best = dvaState.best === null ? dvaState.applied : Math.max(dvaState.best, dvaState.applied);
        dvaState.wrongRun = 0;
        dvaState.idx = Math.min(DVA_LADDER.length - 1, dvaState.idx + 1);
      } else {
        dvaState.wrongRun += 1;
        dvaState.idx = Math.max(0, dvaState.idx - 1);
        if (dvaState.wrongRun >= 3) { dvaState.done = true; api.finishEarly(); spec.meta = { ...spec.meta, decor: true }; spec.duration = 10; return; }
      }
    }
    dvaState.applied = DVA_LADDER[dvaState.idx];
    // deg/s -> lateral m/s at ~0.9 m viewing distance
    const vms = (dvaState.applied * Math.PI / 180) * Math.abs(Z);
    const sign = spec.meta?.leftToRight ? 1 : -1;
    spec.velocity = [sign * vms, 0, 0];
    spec.duration = (1.4 / vms) * 1000 + 200;
  },
  analyze: () => {
    if (dvaState.best === null) return ["No sweep resolved even at the slowest speed - retest; verify headset fit."];
    return [
      `Dynamic visual acuity threshold: ${dvaState.best} deg/s (target-motion).`,
      dvaState.best >= 195 ? "Elite dynamic acuity range." : dvaState.best >= 90 ? "Solid dynamic acuity - trainable upward." : "Dynamic acuity a development target - drills prescribed.",
      "PROTOTYPE (design validation) — non-validating threshold.",
    ];
  },
  durationMs: (params) => 2000 + (params as { maxTrials: number }).maxTrials * 2900 + 1500,
};

// ================= 3. USEFUL FIELD OF VIEW (UFOV, staircase) =================
// Central identification load + a simultaneous peripheral target, both flashed
// for a shrinking exposure. Strike the peripheral location. Exposure descends
// on a correct localization, rises on a miss, terminates after 3 consecutive
// misses. Threshold = shortest exposure with correct peripheral localization —
// the processing-speed-under-load index.
const UFOV_LADDER = [500, 400, 320, 250, 200, 160, 120, 90, 70, 50, 35];
const ufovState: Stair = { idx: 0, wrongRun: 0, applied: UFOV_LADDER[0], best: null, done: false };
const UFOV_ECC: [number, number][] = [
  [0, 0.42], [0, -0.42], [0.5, 0], [-0.5, 0],
  [0.4, 0.32], [-0.4, 0.32], [0.4, -0.32], [-0.4, -0.32],
];

export const UsefulFieldOfView: DrillDefinition = {
  id: "assess-ufov",
  name: "Useful Field of View",
  shortName: "Useful Field",
  phase: "Assess",
  description:
    "Hold central fixation on the flashing center cue while a peripheral target flashes at one of eight positions — then strike where the peripheral target was. Exposure shrinks each time you get it, until three misses. The shortest flash you can still localize is your threshold.",
  purpose: "Divided-attention processing speed across the field (exposure threshold).",
  interaction: "touch",
  responseMode: "strike",
  environment: "arena",
  mvp: true,
  assessment: true,
  instructions: [
    "1. Keep your eyes on the CENTER cue - it flashes each trial.",
    "2. At the same instant, a target flashes briefly somewhere in your PERIPHERY.",
    "3. When they vanish, STRIKE the position where the peripheral target flashed.",
    "4. Every correct localization shortens the next flash.",
    "5. Three misses in a row ends the test; your shortest flash is the threshold.",
  ],
  controlsHint: "HOLD CENTER - STRIKE WHERE THE PERIPHERAL FLASH WAS",
  levels: STANDARD({ maxTrials: 26 }),
  buildTrials: (params, rng) => {
    ufovState.idx = 0; ufovState.wrongRun = 0; ufovState.applied = UFOV_LADDER[0];
    ufovState.best = null; ufovState.done = false;
    const p = params as { maxTrials: number };
    const trials: TrialSpec[] = [];
    let t = 2200;
    for (let n = 0; n < p.maxTrials; n++) {
      const target = UFOV_ECC[Math.floor(rng() * UFOV_ECC.length)];
      const groupId = `ufov-${n}`;
      // central fixation/identification cue (attention load) — flashes then clears
      trials.push({
        id: `${groupId}-c`, spawnAt: t, duration: 500, kind: "distractor", decor: true,
        zone: "center", position: [0, 1.45, Z], color: GOLD, emissive: GOLD, shape: "diamond", scale: 0.03,
        meta: { ufovFirst: true, stepIdx: n },
      });
      // peripheral flash — decor cue that marks WHERE, clears with the group
      trials.push({
        id: `${groupId}-flash`, spawnAt: t, duration: 500, kind: "distractor", decor: true,
        zone: "center", position: [target[0], 1.45 + target[1], Z], color: WHITE, emissive: WHITE, shape: "sphere", scale: 0.04,
        groupId, meta: { ufovFlash: true },
      });
      // eight strikeable response pads appear AFTER the flash — one correct
      UFOV_ECC.forEach((pos, k) => {
        const correct = pos[0] === target[0] && pos[1] === target[1];
        trials.push({
          id: `${groupId}-p${k}`, spawnAt: t + 520, duration: 2600,
          kind: correct ? "go" : "distractor",
          zone: "center", position: [pos[0], 1.45 + pos[1], Z],
          color: "#38406B", emissive: PURPLE, shape: "ring", scale: 0.055, groupId,
        });
      });
      t += 3400;
    }
    return trials;
  },
  onSpawnAdapt: (spec, snapshot, api) => {
    if (spec.meta?.ufovFlash) { spec.duration = ufovState.applied; return; } // flash follows exposure
    if (!spec.meta?.ufovFirst) return;
    if (ufovState.done) { api.finishEarly(); return; }
    if (snapshot.hits + snapshot.errors > 0 && snapshot.lastEventCorrect !== undefined) {
      if (snapshot.lastEventCorrect) {
        ufovState.best = ufovState.best === null ? ufovState.applied : Math.min(ufovState.best, ufovState.applied);
        ufovState.wrongRun = 0;
        ufovState.idx = Math.min(UFOV_LADDER.length - 1, ufovState.idx + 1);
      } else {
        ufovState.wrongRun += 1;
        ufovState.idx = Math.max(0, ufovState.idx - 1);
        if (ufovState.wrongRun >= 3) { ufovState.done = true; api.finishEarly(); return; }
      }
    }
    ufovState.applied = UFOV_LADDER[ufovState.idx];
    // apply the exposure to the central + peripheral flash of THIS trial
    spec.duration = ufovState.applied;
  },
  analyze: () => {
    if (ufovState.best === null) return ["No exposure reliably localized - start peripheral drills at foundation."];
    return [
      `Useful field of view threshold: ${ufovState.best}ms exposure (8-position, divided attention).`,
      ufovState.best <= 90 ? "Fast processing under load - elite range." : ufovState.best <= 200 ? "Solid divided-attention speed." : "Divided-attention speed a development target.",
      "PROTOTYPE (design validation) — non-validating threshold.",
    ];
  },
  durationMs: (params) => 2200 + (params as { maxTrials: number }).maxTrials * 3400 + 1500,
};

export const TIER_ONE_BASELINES = [
  CoincidenceAnticipation,
  DynamicVisualAcuity,
  UsefulFieldOfView,
];
