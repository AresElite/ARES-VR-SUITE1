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

// ================= 3. USEFUL FIELD OF VIEW (monocular) =================
// MONOCULAR protocol. One eye is fully occluded (true per-eye render layer);
// the other is tested. LEFT eye is covered first (RIGHT eye tested), then they
// swap. 15 trials per eye = 30 total.
//
// Within each eye the demand ramps two ways at once:
//   - the flash moves progressively OUTWARD (central -> far periphery)
//   - the flash gets progressively FASTER (long exposure -> very brief)
// Sector order is fully randomized from a balanced deck so every one of the 8
// field sectors is probed at least once and most are probed twice per eye.
const UFOV_TRIALS_PER_EYE = 15;
const UFOV_SECTORS = 8; // N, NE, E, SE, S, SW, W, NW
const UFOV_Z = -1.1;    // viewing plane (1.1 m) — eccentricity computed from this
const UFOV_R_NEAR = 0.20; // ~10 deg
const UFOV_R_FAR = 0.78;  // ~35 deg
const UFOV_EXP_SLOW = 380;
const UFOV_EXP_FAST = 60;

interface UfovRec { eye: "right" | "left"; sector: number; eccDeg: number; expMs: number }
const ufovPlan: UfovRec[] = [];
const degOf = (r: number) => Math.round((Math.atan(r / Math.abs(UFOV_Z)) * 180) / Math.PI);

export const UsefulFieldOfView: DrillDefinition = {
  id: "assess-ufov",
  name: "Useful Field of View (Monocular)",
  shortName: "Useful Field",
  phase: "Assess",
  description:
    "MONOCULAR field test. One eye is blacked out while the other is tested — left eye covered first (right eye tested), then swapped. Hold central fixation; a target flashes somewhere in the periphery, then point + trigger where it was. The flashes move further out and get faster as you go. 15 trials per eye; every field sector is probed.",
  purpose: "Monocular useful field of view — how far out, and how fast, each eye can localize.",
  interaction: "ray",
  responseMode: "pointer",
  environment: "arena",
  mvp: true,
  assessment: true,
  monocular: true,
  instructions: [
    "1. ONE EYE IS COVERED. A banner tells you which eye is being tested.",
    "2. Keep your eyes locked on the CENTER cue - do not look around the field.",
    "3. A target FLASHES briefly out in your periphery, then vanishes.",
    "4. POINT at the ring where it flashed and pull the TRIGGER.",
    "5. It moves further out and flashes faster as you go. 15 trials per eye, then eyes swap.",
  ],
  controlsHint: "HOLD CENTER - POINT + TRIGGER WHERE IT FLASHED",
  levels: STANDARD({ trialsPerEye: UFOV_TRIALS_PER_EYE }),
  buildTrials: (params, rng) => {
    const p = params as { trialsPerEye: number };
    ufovPlan.length = 0;
    const trials: TrialSpec[] = [];
    let t = 2600;
    // LEFT eye covered first => RIGHT eye tested first
    const blocks: { tested: "right" | "left"; blocked: "left" | "right" }[] = [
      { tested: "right", blocked: "left" },
      { tested: "left", blocked: "right" },
    ];
    let g = 0;
    for (const blk of blocks) {
      // balanced sector deck: 2x each of 8 sectors -> take trialsPerEye
      const deck: number[] = [];
      for (let rep = 0; rep < 2; rep++) for (let sct = 0; sct < UFOV_SECTORS; sct++) deck.push(sct);
      for (let k = deck.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [deck[k], deck[j]] = [deck[j], deck[k]];
      }
      const sectors = deck.slice(0, p.trialsPerEye);

      // eye-change banner
      trials.push({
        id: `ufov-banner-${blk.tested}`, spawnAt: t, duration: 2400, kind: "distractor",
        zone: "center", position: [0, 1.72, UFOV_Z], color: TEAL, emissive: TEAL, shape: "diamond", scale: 0.001,
        label: `${blk.tested.toUpperCase()} EYE — ${blk.blocked.toUpperCase()} COVERED`,
        meta: { decor: true, blockEye: blk.blocked, labelInside: true, labelSize: 0.055, labelColor: "#7FD3DE" },
      });
      t += 2600;

      for (let n = 0; n < p.trialsPerEye; n++) {
        const f = n / Math.max(1, p.trialsPerEye - 1); // 0 -> 1 across the block
        const r = UFOV_R_NEAR + (UFOV_R_FAR - UFOV_R_NEAR) * f;   // central -> peripheral
        const expMs = Math.round(UFOV_EXP_SLOW + (UFOV_EXP_FAST - UFOV_EXP_SLOW) * f); // slow -> fast
        const sector = sectors[n];
        const ang = (sector / UFOV_SECTORS) * Math.PI * 2 + rng() * 0.12; // slight jitter, same sector
        const groupId = `ufov-${blk.tested}-${g++}`;
        ufovPlan.push({ eye: blk.tested, sector, eccDeg: degOf(r), expMs });

        // central fixation cue — holds through the whole trial (the attention load)
        trials.push({
          id: `${groupId}-fix`, spawnAt: t, duration: expMs + 2600, kind: "distractor", decor: true,
          zone: "center", position: [0, 1.45, UFOV_Z], color: GOLD, emissive: GOLD, shape: "sphere", scale: 0.016,
          meta: { blockEye: blk.blocked },
        });
        // the peripheral FLASH — brief, then gone
        trials.push({
          id: `${groupId}-flash`, spawnAt: t + 260, duration: expMs, kind: "distractor", decor: true,
          zone: "center",
          position: [Math.cos(ang) * r, 1.45 + Math.sin(ang) * r * 0.78, UFOV_Z],
          color: WHITE, emissive: WHITE, shape: "sphere", scale: 0.035,
          groupId, meta: { blockEye: blk.blocked },
        });
        // response rings at every sector on THIS trial's eccentricity
        for (let k = 0; k < UFOV_SECTORS; k++) {
          const a = (k / UFOV_SECTORS) * Math.PI * 2;
          trials.push({
            id: `${groupId}-r${k}`, spawnAt: t + 260 + expMs + 60, duration: 2400,
            kind: k === sector ? "go" : "distractor",
            zone: "center",
            position: [Math.cos(a) * r, 1.45 + Math.sin(a) * r * 0.78, UFOV_Z],
            color: "#38406B", emissive: PURPLE, shape: "ring", scale: 0.05,
            groupId, meta: { blockEye: blk.blocked },
          });
        }
        t += 260 + expMs + 2400 + 700;
      }
    }
    return trials;
  },
  analyze: (events) => {
    const notes: string[] = [];
    for (const eye of ["right", "left"] as const) {
      const evts = events.filter((e) => e.trialId.startsWith(`ufov-${eye}-`) && e.errorType !== "correctRejection");
      if (!evts.length) continue;
      const correct = evts.filter((e) => e.correct).length;
      const acc = Math.round((correct / evts.length) * 1000) / 10;
      // deepest eccentricity + fastest flash still localized correctly
      const plan = ufovPlan.filter((r) => r.eye === eye);
      let deepest = 0;
      let fastest = 9999;
      evts.forEach((e, i) => {
        if (!e.correct) return;
        const rec = plan[i];
        if (!rec) return;
        deepest = Math.max(deepest, rec.eccDeg);
        fastest = Math.min(fastest, rec.expMs);
      });
      notes.push(
        `${eye.toUpperCase()} eye: ${acc}% localization over ${evts.length} trials — furthest correct ${deepest} deg eccentricity, briefest correct flash ${fastest === 9999 ? "—" : fastest + "ms"}.`,
      );
    }
    notes.push("Monocular protocol — 15 trials per eye, all 8 field sectors probed. PROTOTYPE (design validation) — non-validating.");
    return notes;
  },
  durationMs: (params) => {
    const p = params as { trialsPerEye: number };
    // 2 eyes x (banner + trials)
    return 2600 + 2 * (2600 + p.trialsPerEye * (260 + UFOV_EXP_SLOW + 2400 + 700)) + 3000;
  },
};

export const TIER_ONE_BASELINES = [
  CoincidenceAnticipation,
  DynamicVisualAcuity,
  UsefulFieldOfView,
];
