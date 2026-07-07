import type { DrillDefinition, RawEvent, TrialSpec } from "@/ares/drillTypes";
import { pick } from "@/utils/rng";

/**
 * ASSESS — the clinical baseline suite (v2).
 * Standardized protocols with adaptive ladders and threshold staircases.
 */

const PURPLE = "#8B5CF6";
const TEAL = "#2998AA";
const GOLD = "#F5B648";
const WHITE = "#EAF0FF";
const GRAY = "#38406B";
const LAUNCH_Z = -6;

const STANDARD = (parameters: Record<string, unknown> = {}) => [
  { level: 1, label: "Standard Protocol", parameters },
];

const shuffle = <T,>(arr: T[], rng: () => number): T[] => {
  for (let k = arr.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [arr[k], arr[j]] = [arr[j], arr[k]];
  }
  return arr;
};

// ==================== 1. FINE MOTOR RAW REACTION TIME ====================
// Dominant hand selected before the protocol; only that trigger counts.
// Release delays are fully randomized (uniform 500–3500 ms — no rhythm).
export const FineMotorRawRT: DrillDefinition = {
  id: "assess-fm-raw-rt",
  name: "Fine Motor Raw Reaction Time",
  shortName: "FM Raw RT",
  phase: "Assess",
  description: "25 trials. A PURPLE sphere fires from the central hole after a FULLY RANDOMIZED delay — click the trigger of your DOMINANT hand the instant it launches.",
  purpose: "Simple visuomotor reaction time (dominant-hand trigger).",
  interaction: "touch",
  responseMode: "trigger",
  launcher: true,
  environment: "arena",
  mvp: true,
  assessment: true,
  options: [
    { id: "dominantHand", label: "Dominant hand", defaultValue: "right",
      values: [ { id: "right", label: "Right" }, { id: "left", label: "Left" } ] },
  ],
  instructions: [
    "1. Select your DOMINANT hand on the setup panel - that trigger is the only one that counts.",
    "2. Watch the launcher hole. The delay before each launch is completely random - no rhythm to ride.",
    "3. The instant the PURPLE sphere fires, CLICK your dominant-hand trigger.",
    "4. Do NOT anticipate. Early clicks and wrong-hand clicks are scored against you. 25 trials.",
  ],
  controlsHint: "DOMINANT TRIGGER ONLY - RANDOM DELAYS - 25 TRIALS",
  levels: STANDARD({ trials: 25, speed: 8, size: 0.08 }),
  buildTrials: (params, rng) => {
    const p = params as { trials: number; speed: number; size: number; dominantHand?: string };
    const dom = p.dominantHand === "left" ? "left" : "right";
    const travelMs = (Math.abs(LAUNCH_Z) / p.speed) * 1000;
    const trials: TrialSpec[] = [];
    let t = 1500;
    for (let i = 0; i < p.trials; i++) {
      t += 500 + rng() * 3000; // 100% randomized release delay
      trials.push({
        id: `fmr-${i}`, spawnAt: t, duration: travelMs + 250, kind: "go", zone: "center",
        position: [0, 1.45, LAUNCH_Z], velocity: [(rng() - 0.5) * 0.2, (rng() - 0.5) * 0.15, p.speed],
        requiredHand: dom as "left" | "right",
        color: PURPLE, emissive: PURPLE, shape: "sphere", scale: p.size,
      });
      t += travelMs + 300 + rng() * 300;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; speed: number };
    return 1500 + p.trials * (3500 + (Math.abs(LAUNCH_Z) / p.speed) * 1000 + 600) + 1500;
  },
};

// ==================== 2. FINE MOTOR CHOICE REACTION TIME ====================
// Fully randomized delays; results split RIGHT vs LEFT reaction time and
// accuracy, plus post-error slowing (see the results dashboard).
export const FineMotorChoiceRT: DrillDefinition = {
  id: "assess-fm-choice-rt",
  name: "Fine Motor Choice Reaction Time",
  shortName: "FM Choice RT",
  phase: "Assess",
  description: "25 randomized trials, fully randomized release delays. PURPLE = RIGHT trigger, TEAL = LEFT trigger. Results split right vs left reaction time and accuracy, with post-error slowing.",
  purpose: "Two-choice reaction time with per-hand analytics.",
  interaction: "touch",
  responseMode: "trigger",
  launcher: true,
  environment: "arena",
  mvp: true,
  assessment: true,
  instructions: [
    "1. Balls fire from the central hole after COMPLETELY RANDOM delays - some fast, some slow.",
    "2. PURPLE ball - click the RIGHT top trigger. TEAL ball - click the LEFT top trigger.",
    "3. Click the instant it fires. Wrong-hand and early clicks are scored.",
    "4. 25 trials. Your right-hand and left-hand reaction times and accuracy are reported separately.",
  ],
  controlsHint: "PURPLE = RIGHT - TEAL = LEFT - RANDOM DELAYS - 25 TRIALS",
  levels: STANDARD({ trials: 25, speed: 7.5, size: 0.08 }),
  buildTrials: (params, rng) => {
    const p = params as { trials: number; speed: number; size: number };
    const travelMs = (Math.abs(LAUNCH_Z) / p.speed) * 1000;
    const deck = shuffle(Array.from({ length: p.trials }, (_, k) => k % 2 === 0), rng);
    const trials: TrialSpec[] = [];
    let t = 1500;
    for (let i = 0; i < p.trials; i++) {
      t += 500 + rng() * 3000; // 100% randomized release delay
      const isPurple = deck[i];
      trials.push({
        id: `fmc-${i}`, spawnAt: t, duration: travelMs + 250, kind: "go",
        zone: isPurple ? "right" : "left",
        position: [0, 1.45, LAUNCH_Z], velocity: [(rng() - 0.5) * 0.2, (rng() - 0.5) * 0.15, p.speed],
        requiredHand: isPurple ? "right" : "left",
        color: isPurple ? PURPLE : TEAL, emissive: isPurple ? PURPLE : TEAL,
        shape: "sphere", scale: p.size,
      });
      t += travelMs + 300 + rng() * 300;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; speed: number };
    return 1500 + p.trials * (3500 + (Math.abs(LAUNCH_Z) / p.speed) * 1000 + 600) + 1500;
  },
};

// ============ 3/4. GROSS MOTOR (adaptive 120-second hexagon ladder) ============
// Balls fire faster as the streak grows and ease off after misses — the
// ladder finds the fastest speed the athlete can still coordinate. 120 s on
// the clock; each interception spawns the next launch.
function buildGrossTrials(
  p: { speed: number; size: number; choice: boolean; dominantHand?: string },
  rng: () => number,
  idp: string,
): TrialSpec[] {
  const trials: TrialSpec[] = [];
  const travelDist = Math.abs(LAUNCH_Z) + 0.35;
  const dom = p.dominantHand === "left" ? "left" : "right";
  const members = 110; // ladder never runs dry inside 120s
  const colors = shuffle(Array.from({ length: members }, (_, k) => k % 2 === 0), rng);
  for (let i = 0; i < members; i++) {
    const hole = Math.floor(rng() * 6);
    const a = (hole / 6) * Math.PI * 2 + Math.PI / 6;
    const hx = Math.cos(a) * 0.95;
    const hy = 1.45 + Math.sin(a) * 0.62;
    const px = Math.cos(a) * (0.32 + rng() * 0.14);
    const py = 1.45 + Math.sin(a) * (0.24 + rng() * 0.1);
    const dx = px - hx;
    const dy = py - hy;
    const dz = travelDist;
    const len = Math.hypot(dx, dy, dz);
    const isPurple = p.choice ? (colors[i] as boolean) : true;
    const travelMs = (travelDist / p.speed) * 1000;
    trials.push({
      id: `${idp}-${i}`,
      spawnAt: i === 0 ? 1500 : -1,
      chainId: idp,
      chainGapMs: 500 + Math.floor(rng() * 900),
      seq: i,
      duration: travelMs + 120,
      kind: "go",
      zone: px < -0.12 ? "left" : px > 0.12 ? "right" : "center",
      position: [hx, hy, LAUNCH_Z],
      velocity: [(dx / len) * p.speed * (len / travelDist), (dy / len) * p.speed * (len / travelDist), p.speed],
      requiredHand: p.choice ? (isPurple ? "right" : "left") : (dom as "left" | "right"),
      color: isPurple ? PURPLE : TEAL,
      emissive: isPurple ? PURPLE : TEAL,
      shape: "sphere",
      scale: p.size,
      meta: { baseVx: dx / len, baseVy: dy / len, baseSpeed: p.speed, travelDist, lenRatio: len / travelDist },
    });
  }
  return trials;
}

/** speed ladder: +7% per streak step, capped at 2.4×; misses reset streak. */
function grossAdapt(spec: TrialSpec, snapshot: { streak: number }): void {
  const base = spec.meta?.baseSpeed as number;
  if (!base) return;
  const factor = Math.min(2.4, 1 + snapshot.streak * 0.07);
  const speed = base * factor;
  const ratio = spec.meta?.lenRatio as number;
  const ux = spec.meta?.baseVx as number;
  const uy = spec.meta?.baseVy as number;
  spec.velocity = [ux * speed * ratio, uy * speed * ratio, speed];
  spec.duration = ((spec.meta?.travelDist as number) / speed) * 1000 + 120;
}

export const GrossMotorRawRT: DrillDefinition = {
  id: "assess-gm-raw-rt",
  name: "Gross Motor Raw Reaction Time",
  shortName: "GM Raw RT",
  phase: "Assess",
  description: "120 seconds. PURPLE balls fire from the hexagon — intercept with your DOMINANT hand. Every catch speeds the next launch up (+7% per streak step); misses ease it back. Finds your fastest coordinated interception speed.",
  purpose: "Adaptive whole-arm interception speed ceiling.",
  interaction: "touch",
  responseMode: "strike",
  hexWall: true,
  environment: "arena",
  mvp: true,
  assessment: true,
  hardStop: true,
  options: [
    { id: "dominantHand", label: "Dominant hand", defaultValue: "right",
      values: [ { id: "right", label: "Right" }, { id: "left", label: "Left" } ] },
  ],
  instructions: [
    "1. 120 seconds. Six visible portholes form a hexagon ahead of you.",
    "2. A PURPLE ball fires from a random hole - intercept it with your DOMINANT hand before it passes.",
    "3. Every catch makes the next launch FASTER. A miss slows the ladder back down.",
    "4. Scored: total hits, best streak, average and fastest reaction, misses, contact precision.",
  ],
  controlsHint: "120s - DOMINANT HAND - EVERY CATCH SPEEDS IT UP",
  levels: STANDARD({ speed: 4.2, size: 0.09, choice: false }),
  buildTrials: (params, rng) => buildGrossTrials(params as never, rng, "gmr"),
  onSpawnAdapt: (spec, snapshot) => grossAdapt(spec, snapshot),
  durationMs: () => 122000,
};

export const GrossMotorChoiceRT: DrillDefinition = {
  id: "assess-gm-choice-rt",
  name: "Gross Motor Choice Reaction Time",
  shortName: "GM Choice RT",
  phase: "Assess",
  description: "120 seconds from the hexagon: PURPLE = RIGHT hand, TEAL = LEFT hand. The launch speed climbs with your streak and eases after misses. Results split right vs left reaction time and accuracy.",
  purpose: "Adaptive whole-arm choice interception ceiling.",
  interaction: "touch",
  responseMode: "strike",
  hexWall: true,
  environment: "arena",
  mvp: true,
  assessment: true,
  hardStop: true,
  instructions: [
    "1. 120 seconds. Balls fire from random hexagon portholes.",
    "2. PURPLE ball - RIGHT hand. TEAL ball - LEFT hand. Intercept before it passes.",
    "3. Every catch makes the next launch FASTER; misses ease it back down.",
    "4. Scored: hits, best streak, right vs left reaction time and accuracy, fastest catch, precision.",
  ],
  controlsHint: "120s - PURPLE=RIGHT TEAL=LEFT - SPEED CLIMBS WITH YOUR STREAK",
  levels: STANDARD({ speed: 4.0, size: 0.09, choice: true }),
  buildTrials: (params, rng) => buildGrossTrials(params as never, rng, "gmc"),
  onSpawnAdapt: (spec, snapshot) => grossAdapt(spec, snapshot),
  durationMs: () => 122000,
};

// ==================== 5. COLOR VISION (Ishihara Interactive) ====================
const CV_AXES: ("control" | "rg" | "by")[] = [
  "control", "rg", "rg", "by", "rg", "rg", "control", "by", "rg", "rg", "by", "rg", "by", "rg",
];

export const ColorVisionAssessment: DrillDefinition = {
  id: "assess-color-vision",
  name: "Color Vision (Ishihara Interactive)",
  shortName: "Color Vision",
  phase: "Assess",
  description: "14 pseudo-isochromatic plates fly through your view — left, right, up, down, diagonal, even straight at you. Answer and the plate clears for the next. Axis-specific errors classify the deficit pattern.",
  purpose: "Color-discrimination screening with axis classification.",
  interaction: "touch",
  responseMode: "strike",
  environment: "arena",
  mvp: true,
  assessment: true,
  instructions: [
    "1. A dotted plate flies through your view - direction changes every time. Somewhere in the dots is a NUMBER.",
    "2. Read it and strike the matching answer pad. The plate clears instantly and the next appears.",
    "3. If you truly cannot see a number, strike the '?' pad - never guess.",
    "4. 14 plates. Reaction time, accuracy, and the deficit axis pattern are reported.",
  ],
  controlsHint: "READ THE FLYING NUMBER - STRIKE THE PAD - NEXT ONE COMES",
  levels: STANDARD({ plates: 14, exposureMs: 6000 }),
  buildTrials: (params, rng) => {
    const p = params as { plates: number; exposureMs: number };
    const trials: TrialSpec[] = [];
    let t = 2000;
    for (let i = 0; i < p.plates; i++) {
      const digit = 1 + Math.floor(rng() * 9);
      const axis = CV_AXES[i % CV_AXES.length];
      const groupId = `cv-${axis}-${i}`;
      // flight path variety: L->R, R->L, up, down, diagonals, in/out
      const paths: { pos: [number, number, number]; vel: [number, number, number] }[] = [
        { pos: [-0.35, 1.5, -1.1], vel: [0.1, 0, 0] },
        { pos: [0.35, 1.5, -1.1], vel: [-0.1, 0, 0] },
        { pos: [0, 1.3, -1.1], vel: [0, 0.07, 0] },
        { pos: [0, 1.72, -1.1], vel: [0, -0.07, 0] },
        { pos: [-0.3, 1.32, -1.1], vel: [0.09, 0.055, 0] },
        { pos: [0.3, 1.68, -1.1], vel: [-0.09, -0.055, 0] },
        { pos: [0, 1.5, -1.7], vel: [0, 0, 0.13] },
        { pos: [0, 1.5, -0.95], vel: [0, 0, -0.11] },
      ];
      const path = paths[Math.floor(rng() * paths.length)];
      trials.push({
        id: `${groupId}-plate`, spawnAt: t, duration: p.exposureMs, kind: "distractor", decor: true,
        zone: "center", position: path.pos, velocity: path.vel,
        color: WHITE, shape: "plate", scale: 0.24,
        plate: { digit, axis, seed: 1000 + i * 77 + digit },
        groupId, // clears with the answer
      });
      const wrong1 = ((digit + 2 + Math.floor(rng() * 5)) % 9) + 1;
      let wrong2 = ((digit + 5 + Math.floor(rng() * 3)) % 9) + 1;
      if (wrong2 === wrong1 || wrong2 === digit) wrong2 = (wrong2 % 9) + 1;
      const answers = shuffle([String(digit), String(wrong1), String(wrong2), "?"], rng);
      answers.forEach((label, k) => {
        trials.push({
          id: `${groupId}-p${k}`, spawnAt: t + 500, duration: p.exposureMs - 500,
          kind: label === String(digit) ? "go" : "distractor",
          zone: "center", position: [-0.51 + k * 0.34, 1.02, -0.62],
          color: GRAY, emissive: TEAL, shape: "pad", scale: 0.06, label, groupId,
        });
      });
      t += p.exposureMs + 800;
    }
    return trials;
  },
  analyze: (events: RawEvent[]) => {
    const axisErr = (ax: string) => {
      const evts = events.filter((e) => e.trialId.startsWith(`cv-${ax}-`) && e.errorType !== "correctRejection");
      const wrong = evts.filter((e) => !e.correct).length;
      return { wrong, total: evts.length };
    };
    const ctl = axisErr("control");
    const rg = axisErr("rg");
    const by = axisErr("by");
    const notes: string[] = [];
    if (ctl.wrong > 0) {
      notes.push(`Control plates missed (${ctl.wrong}/${ctl.total}) - verify comprehension before interpreting axes.`);
    }
    if (rg.total && rg.wrong / rg.total >= 0.375) {
      notes.push(`Red-green axis: ${rg.wrong}/${rg.total} missed - protan/deutan pattern. Refer for formal anomaloscope or printed plate testing.`);
    } else if (rg.wrong > 0) {
      notes.push(`Red-green axis: ${rg.wrong}/${rg.total} missed - borderline; consider retest.`);
    }
    if (by.total && by.wrong / by.total >= 0.5) {
      notes.push(`Blue-yellow axis: ${by.wrong}/${by.total} missed - tritan pattern (rare; consider acquired etiology).`);
    }
    if (notes.length === 0) notes.push("Color discrimination within normal limits on both confusion axes.");
    return notes;
  },
  durationMs: (params) => {
    const p = params as { plates: number; exposureMs: number };
    return 2000 + p.plates * (p.exposureMs + 800) + 1500;
  },
};

// ==================== 6. STEREOPSIS (staircase to threshold) ====================
// Starts blatantly obvious (800") and steps finer after every correct pick.
// A wrong pick steps back up; THREE consecutive wrong answers terminate the
// staircase. The finest disparity answered correctly is the threshold.
const STEREO_LADDER = [800, 600, 450, 340, 260, 200, 150, 110, 80, 60, 45, 35, 25, 20, 15];

interface StairState { idx: number; wrongRun: number; applied: number; best: number | null; done: boolean }
const stereoState: StairState = { idx: 0, wrongRun: 0, applied: STEREO_LADDER[0], best: null, done: false };

export const StereopsisAssessment: DrillDefinition = {
  id: "assess-stereopsis",
  name: "Stereopsis (Dichoptic Randot)",
  shortName: "Stereopsis",
  phase: "Assess",
  description: "Adaptive staircase: begins with unmistakable depth (800 arcsec) and steps finer after every correct pick. Three consecutive misses end the test — the finest disparity you resolved is your threshold.",
  purpose: "Global stereopsis threshold via adaptive staircase.",
  interaction: "touch",
  responseMode: "strike",
  environment: "arena",
  mvp: true,
  assessment: true,
  instructions: [
    "1. Four dotted discs appear. ONE floats in depth - at first it is obvious.",
    "2. Strike the floating disc. Every correct pick makes the depth subtler.",
    "3. A wrong pick steps back to an easier level. Three misses in a row ends the test.",
    "4. Your threshold - the finest disparity you resolved - is recorded in arcseconds.",
    "5. Headset required: the depth physically cannot appear on a flat screen.",
  ],
  controlsHint: "STRIKE THE FLOATING DISC - IT GETS SUBTLER EVERY TIME",
  levels: STANDARD({ maxTrials: 24, exposureMs: 6500 }),
  buildTrials: (params, rng) => {
    // reset the staircase for this session
    stereoState.idx = 0;
    stereoState.wrongRun = 0;
    stereoState.applied = STEREO_LADDER[0];
    stereoState.best = null;
    stereoState.done = false;
    const p = params as { maxTrials: number; exposureMs: number };
    const trials: TrialSpec[] = [];
    let t = 2000;
    for (let n = 0; n < p.maxTrials; n++) {
      const groupId = `st-${n}`;
      const targetIdx = Math.floor(rng() * 4);
      for (let k = 0; k < 4; k++) {
        trials.push({
          id: `${groupId}-d${k}`, spawnAt: t, duration: p.exposureMs,
          kind: k === targetIdx ? "go" : "distractor",
          zone: "center", position: [-0.45 + k * 0.3, 1.45, -1.0],
          color: WHITE, shape: "stereo", scale: 0.105,
          stereoShiftM: 0, // applied by the staircase at spawn
          groupId,
          meta: { rdsSeed: 500 + n * 13 + k, stairFirst: k === 0, isTarget: k === targetIdx },
        });
      }
      t += p.exposureMs + 700;
    }
    return trials;
  },
  onSpawnAdapt: (spec, snapshot, api) => {
    if (stereoState.done) {
      api.finishEarly();
      spec.meta = { ...spec.meta, decor: true };
      spec.duration = 10;
      return;
    }
    if (spec.meta?.stairFirst) {
      // fold in the previous trial's outcome
      if (snapshot.hits + snapshot.errors > 0 && snapshot.lastEventCorrect !== undefined) {
        if (snapshot.lastEventCorrect) {
          stereoState.best = stereoState.best === null ? stereoState.applied : Math.min(stereoState.best, stereoState.applied);
          stereoState.wrongRun = 0;
          stereoState.idx = Math.min(STEREO_LADDER.length - 1, stereoState.idx + 1);
        } else {
          stereoState.wrongRun += 1;
          stereoState.idx = Math.max(0, stereoState.idx - 1);
          if (stereoState.wrongRun >= 3) {
            stereoState.done = true;
            api.finishEarly();
            spec.meta = { ...spec.meta, decor: true };
            spec.duration = 10;
            return;
          }
        }
      }
      stereoState.applied = STEREO_LADDER[stereoState.idx];
    }
    if (spec.meta?.isTarget) {
      spec.stereoShiftM = 1.0 * stereoState.applied * 4.848e-6; // 1 m test distance
    }
  },
  analyze: () => {
    // fold in the final trial's outcome via best already tracked at spawns;
    // report the finest disparity that was answered correctly
    if (stereoState.best === null) {
      return ["No disparity level was reliably resolved - gross stereopsis deficit pattern; refer for full binocular workup."];
    }
    return [
      `Stereoacuity threshold achieved: ${stereoState.best} arcsec (staircase ${stereoState.done ? "terminated on 3 consecutive misses" : "completed"}).`,
      stereoState.best <= 40
        ? "Fine global stereopsis - within elite athletic norms."
        : stereoState.best <= 100
          ? "Moderate stereoacuity - trainable range."
          : "Reduced stereoacuity - consider binocular vision evaluation.",
    ];
  },
  durationMs: (params) => {
    const p = params as { maxTrials: number; exposureMs: number };
    return 2000 + p.maxTrials * (p.exposureMs + 700) + 1500;
  },
};

// ==================== 7. CONTRAST SENSITIVITY (staircase) ====================
// Grating-disc 4-AFC in the Pelli-Robson / CSV-1000 lineage: one disc holds
// a sinusoidal grating, three are statistically identical uniform discs.
// Contrast descends on a log ladder after each correct pick; three
// consecutive misses terminate. Threshold reported as logCS.
const CS_LADDER = [40, 25, 16, 10, 6.3, 4, 2.5, 1.6, 1.0, 0.63, 0.4];
const csState: StairState = { idx: 0, wrongRun: 0, applied: CS_LADDER[0], best: null, done: false };

export const ContrastSensitivityAssessment: DrillDefinition = {
  id: "assess-contrast-sensitivity",
  name: "Contrast Sensitivity (Grating Staircase)",
  shortName: "Contrast Sensitivity",
  phase: "Assess",
  description: "Four discs — one hides a faint striped grating, three are blank. Strike the striped one (or '?' if you truly cannot see it). Contrast falls on a log ladder until three straight misses. Threshold reported as logCS, the metric elite athletes are benchmarked on.",
  purpose: "Contrast sensitivity threshold (logCS) via 4-AFC staircase.",
  interaction: "touch",
  responseMode: "strike",
  environment: "arena",
  mvp: true,
  assessment: true,
  instructions: [
    "1. Four gray discs appear. Exactly ONE contains faint stripes.",
    "2. Strike the striped disc. Every correct pick makes the stripes fainter.",
    "3. If you truly cannot see any stripes, strike the '?' pad - never guess.",
    "4. Three misses in a row ends the test. Your contrast threshold (logCS) is recorded.",
  ],
  controlsHint: "FIND THE STRIPED DISC - IT FADES EVERY ROUND",
  levels: STANDARD({ maxTrials: 22, exposureMs: 6500 }),
  buildTrials: (params, rng) => {
    csState.idx = 0;
    csState.wrongRun = 0;
    csState.applied = CS_LADDER[0];
    csState.best = null;
    csState.done = false;
    const p = params as { maxTrials: number; exposureMs: number };
    const trials: TrialSpec[] = [];
    let t = 2000;
    for (let n = 0; n < p.maxTrials; n++) {
      const groupId = `cs-${n}`;
      const targetIdx = Math.floor(rng() * 4);
      const angle = pick(rng, [0, 45, 90, 135]);
      for (let k = 0; k < 4; k++) {
        trials.push({
          id: `${groupId}-d${k}`, spawnAt: t, duration: p.exposureMs,
          kind: k === targetIdx ? "go" : "distractor",
          zone: "center", position: [-0.45 + k * 0.3, 1.5, -0.95],
          color: WHITE, shape: "grating", scale: 0.1,
          grating: { contrastPct: 0, cycles: 7, angleDeg: angle, seed: 40 + n * 7 + k },
          groupId,
          meta: { stairFirst: k === 0, isTarget: k === targetIdx },
        });
      }
      // honest escape hatch
      trials.push({
        id: `${groupId}-q`, spawnAt: t, duration: p.exposureMs, kind: "distractor",
        zone: "center", position: [0, 1.12, -0.62],
        color: GRAY, emissive: GOLD, shape: "pad", scale: 0.055, label: "?", groupId,
      });
      t += p.exposureMs + 700;
    }
    return trials;
  },
  onSpawnAdapt: (spec, snapshot, api) => {
    if (csState.done) {
      api.finishEarly();
      spec.meta = { ...spec.meta, decor: true };
      spec.duration = 10;
      return;
    }
    if (spec.meta?.stairFirst) {
      if (snapshot.hits + snapshot.errors > 0 && snapshot.lastEventCorrect !== undefined) {
        if (snapshot.lastEventCorrect) {
          csState.best = csState.best === null ? csState.applied : Math.min(csState.best, csState.applied);
          csState.wrongRun = 0;
          csState.idx = Math.min(CS_LADDER.length - 1, csState.idx + 1);
        } else {
          csState.wrongRun += 1;
          csState.idx = Math.max(0, csState.idx - 1);
          if (csState.wrongRun >= 3) {
            csState.done = true;
            api.finishEarly();
            spec.meta = { ...spec.meta, decor: true };
            spec.duration = 10;
            return;
          }
        }
      }
      csState.applied = CS_LADDER[csState.idx];
    }
    if (spec.meta?.isTarget && spec.grating) {
      spec.grating = { ...spec.grating, contrastPct: csState.applied };
    }
  },
  analyze: () => {
    if (csState.best === null) {
      return ["Highest-contrast grating not detected - screen for media opacity or refractive blur before interpreting."];
    }
    const logCS = Math.round(Math.log10(100 / csState.best) * 100) / 100;
    return [
      `Contrast threshold: ${csState.best}% Michelson (logCS ${logCS}).`,
      logCS >= 1.8
        ? "Excellent contrast sensitivity - elite athletic range."
        : logCS >= 1.4
          ? "Normal contrast sensitivity."
          : "Reduced contrast sensitivity - consider ocular-health and refractive evaluation.",
    ];
  },
  durationMs: (params) => {
    const p = params as { maxTrials: number; exposureMs: number };
    return 2000 + p.maxTrials * (p.exposureMs + 700) + 1500;
  },
};

// ==================== 8. DEM (ARROWS) ====================
const DEM_DIRS = ["up", "down", "left", "right"] as const;

function demArrows(count: number, layout: "vertical" | "horizontal" | "dem100", budgetMs: number, rng: () => number): TrialSpec[] {
  const trials: TrialSpec[] = [];
  const positions: [number, number][] = [];
  if (layout === "vertical") {
    const rows = count / 2;
    for (let c = 0; c < 2; c++) for (let r2 = 0; r2 < rows; r2++) positions.push([c === 0 ? -0.3 : 0.3, 1.82 - r2 * (0.78 / (rows - 1))]);
  } else if (layout === "horizontal") {
    const cols = count / 5;
    for (let r2 = 0; r2 < 5; r2++) {
      let x = -0.62;
      for (let c = 0; c < cols; c++) {
        x += 0.06 + rng() * 0.09;
        positions.push([Math.min(0.66, x), 1.74 - r2 * 0.15]);
      }
    }
  } else {
    for (let r2 = 0; r2 < 10; r2++) {
      let x = -0.64;
      for (let c = 0; c < 10; c++) {
        x += 0.05 + rng() * 0.085;
        positions.push([Math.min(0.68, x), 1.86 - r2 * 0.088 + (rng() - 0.5) * 0.02]);
      }
    }
  }
  for (let i = 0; i < count; i++) {
    const dir = pick(rng, DEM_DIRS);
    trials.push({
      id: `dem-${i}`, spawnAt: 1500, duration: budgetMs, kind: "go",
      zone: "center", position: [positions[i][0], positions[i][1], -0.95],
      requiredDirection: dir,
      color: WHITE, emissive: GOLD, shape: "cone", scale: 0.028,
      groupId: "dem", groupMode: "ordered", seq: i,
      meta: { pointDir: dir, dem: true },
    });
  }
  return trials;
}

export const DEMArrows: DrillDefinition = {
  id: "assess-dem-arrows",
  name: "DEM (Arrows)",
  shortName: "DEM Arrows",
  phase: "Assess",
  description: "Developmental Eye Movement test, arrow form. Flick the dominant-hand joystick to match each glowing arrow in reading order. Vertical A/B, horizontal C, and the 100-arrow protocol. Time, accuracy, and post-error slowing recorded.",
  purpose: "Oculomotor function: saccadic accuracy, automaticity, V/H ratio.",
  interaction: "touch",
  responseMode: "joystick",
  environment: "arena",
  mvp: true,
  assessment: true,
  options: [
    { id: "subtest", label: "Subtest", defaultValue: "vertical-a",
      values: [
        { id: "vertical-a", label: "Vertical A (2×25)" },
        { id: "vertical-b", label: "Vertical B (2×25)" },
        { id: "horizontal-c", label: "Horizontal C (50)" },
        { id: "dem-100", label: "DEM 100 (10×10)" },
      ] },
    { id: "dominantHand", label: "Joystick hand", defaultValue: "right",
      values: [ { id: "right", label: "Right" }, { id: "left", label: "Left" } ] },
  ],
  instructions: [
    "1. A board of small arrows appears. The GLOWING arrow is your current target.",
    "2. Flick your dominant-hand JOYSTICK in the direction that arrow points.",
    "3. The highlight advances arrow by arrow in reading order - keep a steady rhythm.",
    "4. Let the stick return to center between flicks. Wrong flicks are scored and the test continues.",
    "5. Completion time, accuracy, and post-error slowing are recorded.",
  ],
  controlsHint: "FLICK THE JOYSTICK TO MATCH EACH GLOWING ARROW",
  levels: STANDARD({}),
  buildTrials: (params, rng) => {
    const sub = (params as { subtest?: string }).subtest ?? "vertical-a";
    if (sub === "vertical-a" || sub === "vertical-b") return demArrows(50, "vertical", 90000, rng);
    if (sub === "horizontal-c") return demArrows(50, "horizontal", 100000, rng);
    return demArrows(100, "dem100", 200000, rng);
  },
  durationMs: (params) => {
    const sub = (params as { subtest?: string }).subtest ?? "vertical-a";
    return sub === "dem-100" ? 203000 : sub === "horizontal-c" ? 103000 : 93000;
  },
};

export const ASSESS_DRILLS = [
  FineMotorRawRT,
  FineMotorChoiceRT,
  GrossMotorRawRT,
  GrossMotorChoiceRT,
  ColorVisionAssessment,
  StereopsisAssessment,
  ContrastSensitivityAssessment,
  DEMArrows,
];
