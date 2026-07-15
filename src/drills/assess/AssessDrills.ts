import type { DrillDefinition, RawEvent, TrialSpec } from "@/ares/drillTypes";
import { pick } from "@/utils/rng";

/**
 * ASSESS — the performance baseline suite (v2).
 * Standardized protocols with adaptive ladders and threshold staircases.
 * PHASE 1 PROTOTYPE: design validation only — outputs are not validated
 * measurements and are never treatment, screening, or diagnosis.
 */

const PURPLE = "#8B5CF6";
const TEAL = "#2998AA";
const GOLD = "#C4B5FD";
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
  handIdentity: true,
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
  handIdentity: true,
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
  handIdentity: true,
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
  purpose: "Color-discrimination performance baseline with axis pattern.",
  interaction: "ray",
  responseMode: "pointer",
  environment: "arena",
  mvp: true,
  assessment: true,
  trialPaced: true,
  instructions: [
    "1. A dotted plate flies through your view - direction changes every time. Somewhere in the dots is a NUMBER.",
    "2. Read it, POINT your controller at the matching answer pad and pull the TRIGGER. The next plate appears instantly.",
    "3. If you truly cannot see a number, point + trigger the '?' pad - never guess.",
    "4. 14 plates. Accuracy and the deficit-axis pattern are reported.",
  ],
  controlsHint: "READ THE NUMBER - POINT + TRIGGER THE PAD - NEXT COMES FAST",
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
        id: `${groupId}-plate`, spawnAt: i === 0 ? t : -1, gridSeq: i, duration: p.exposureMs, kind: "distractor", decor: true,
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
          // answer pads: closer (arm's reach) and raised for comfortable striking
          id: `${groupId}-p${k}`, spawnAt: i === 0 ? t + 500 : -1, gridSeq: i, duration: p.exposureMs, kind: label === String(digit) ? "go" : "distractor",
          zone: "center", position: [-0.45 + k * 0.3, 1.22, -0.5],
          color: GRAY, emissive: TEAL, shape: "pad", scale: 0.06, label, groupId,
        });
      });
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
      notes.push(`Red-green axis: ${rg.wrong}/${rg.total} missed - reduced red-green discrimination pattern (training-design input only).`);
    } else if (rg.wrong > 0) {
      notes.push(`Red-green axis: ${rg.wrong}/${rg.total} missed - borderline; consider retest.`);
    }
    if (by.total && by.wrong / by.total >= 0.5) {
      notes.push(`Blue-yellow axis: ${by.wrong}/${by.total} missed - reduced blue-yellow discrimination pattern (training-design input only).`);
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
// Clinical range: Randot near stereo runs 400" down to 20". Fine rungs where
// it matters. The headset's ~144"/pixel floor is beaten by hyperacuity (soft
// dots + sub-pixel UV disparity) — see makeRDSTexture / StereoEyeMaterial.
const STEREO_LADDER = [600, 400, 300, 200, 140, 100, 80, 60, 50, 40, 30, 25, 20, 16];

interface StairState { idx: number; wrongRun: number; applied: number; best: number | null; done: boolean; fine?: boolean }
const stereoState: StairState = { idx: 0, wrongRun: 0, applied: STEREO_LADDER[0], best: null, done: false, fine: false };

export const StereopsisAssessment: DrillDefinition = {
  id: "assess-stereopsis",
  name: "Stereopsis (Dichoptic Randot)",
  shortName: "Stereopsis",
  phase: "Assess",
  description: "Adaptive staircase: begins with unmistakable depth (800 arcsec) and steps finer after every correct pick. Three consecutive misses end the test — the finest disparity you resolved is your threshold.",
  purpose: "Global stereopsis threshold via adaptive staircase.",
  interaction: "ray",
  responseMode: "pointer",
  environment: "arena",
  mvp: true,
  assessment: true,
  instructions: [
    "1. Four dotted discs appear. ONE floats in depth - at first it is obvious.",
    "2. POINT at the floating disc and pull the TRIGGER. Every correct pick makes the depth subtler.",
    "3. A wrong pick steps back to an easier level. Three misses in a row ends the test.",
    "4. Your threshold - the finest disparity you resolved - is recorded in arcseconds.",
    "5. Headset required: the depth physically cannot appear on a flat screen.",
  ],
  controlsHint: "POINT + TRIGGER THE FLOATING DISC - IT GETS SUBTLER",
  trialPaced: true,
  levels: STANDARD({ maxTrials: 30, exposureMs: 8000 }),
  buildTrials: (params, rng) => {
    // reset the staircase for this session
    stereoState.idx = 0;
    stereoState.wrongRun = 0;
    stereoState.applied = STEREO_LADDER[0];
    stereoState.best = null;
    stereoState.done = false;
    stereoState.fine = false;
    const p = params as { maxTrials: number; exposureMs: number };
    const trials: TrialSpec[] = [];
    let t = 2000;
    for (let n = 0; n < p.maxTrials; n++) {
      const groupId = `st-${n}`;
      const targetIdx = Math.floor(rng() * 4);
      for (let k = 0; k < 4; k++) {
        trials.push({
          id: `${groupId}-d${k}`, spawnAt: n === 0 ? t : -1, gridSeq: n, duration: p.exposureMs,
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
          // coarse phase: drop 2 rungs per correct until the first miss, then
          // switch to fine 1-rung steps. Converges on threshold far faster.
          stereoState.idx = Math.min(STEREO_LADDER.length - 1, stereoState.idx + (stereoState.fine ? 1 : 2));
        } else {
          stereoState.fine = true;
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
      return ["No disparity level was reliably resolved - depth-cue drills will start at the easiest rung."];
    }
    return [
      `Stereoacuity threshold achieved: ${stereoState.best} arcsec (staircase ${stereoState.done ? "terminated on 3 consecutive misses" : "completed"}).`,
      stereoState.best <= 40
        ? "Fine global stereopsis - within elite athletic norms."
        : stereoState.best <= 100
          ? "Moderate stereoacuity - trainable range."
          : "Reduced depth discrimination - depth-focused drills prescribed at foundation levels.",
    ];
  },
  durationMs: (params) => {
    const p = params as { maxTrials: number; exposureMs: number };
    return 2000 + p.maxTrials * (p.exposureMs + 700) + 1500; // ceiling; trial-paced
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
  interaction: "ray",
  responseMode: "pointer",
  environment: "arena",
  mvp: true,
  assessment: true,
  instructions: [
    "1. Four gray discs appear. Exactly ONE contains faint stripes.",
    "2. POINT at the striped disc and pull the TRIGGER. Every correct pick makes the stripes fainter.",
    "3. If you truly cannot see any stripes, point + trigger the '?' pad - never guess.",
    "4. Three misses in a row ends the test. Your contrast threshold (logCS) is recorded.",
  ],
  controlsHint: "POINT + TRIGGER THE STRIPED DISC - IT FADES EVERY ROUND",
  trialPaced: true,
  levels: STANDARD({ maxTrials: 26, exposureMs: 8000 }),
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
          id: `${groupId}-d${k}`, spawnAt: n === 0 ? t : -1, gridSeq: n, duration: p.exposureMs,
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
        id: `${groupId}-q`, spawnAt: n === 0 ? t : -1, gridSeq: n, duration: p.exposureMs, kind: "distractor",
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
      return ["Highest-contrast grating not detected - retest recommended; verify headset fit and lens cleanliness first."];
    }
    const logCS = Math.round(Math.log10(100 / csState.best) * 100) / 100;
    return [
      `Contrast threshold: ${csState.best}% Michelson (logCS ${logCS}).`,
      logCS >= 1.8
        ? "Excellent contrast sensitivity - elite athletic range."
        : logCS >= 1.4
          ? "Normal contrast sensitivity."
          : "Reduced contrast performance - low-contrast pickup drills prescribed at foundation levels.",
    ];
  },
  durationMs: (params) => {
    const p = params as { maxTrials: number; exposureMs: number };
    return 2000 + p.maxTrials * (p.exposureMs + 700) + 1500;
  },
};

// ==================== 8. DEM (ARROWS) ====================
// Timed reading-pattern protocol: after the 3-2-1-GO countdown the stopwatch
// starts. The athlete zigzags the grid in reading order — left to right,
// row by row — flicking the joystick to match each glowing arrow. The clock
// stops THE INSTANT the bottom-right arrow is answered. Total time, errors,
// and accuracy are the score. DEM III is the same protocol with more arrows.
const DEM_DIRS = ["up", "down", "left", "right"] as const;
const DEM_FIRST_SPAWN = 600;

function demArrows(mode: "serpentine" | "grid", rows: number, cols: number, scale: number, salt: number, rng: () => number): TrialSpec[] {
  const trials: TrialSpec[] = [];
  // decorrelate DEM I from DEM II even on an identical session seed
  for (let b = 0; b < salt * 13; b++) rng();

  const highlight = mode !== "serpentine";   // DEM I & II hide the cursor; III keeps it
  const push = (seq: number, x: number, y: number) => {
    const dir = pick(rng, DEM_DIRS);
    trials.push({
      id: `dem-${seq}`, spawnAt: DEM_FIRST_SPAWN, duration: 600000, kind: "go",
      zone: "center", position: [x, y, -1.6],
      requiredDirection: dir,
      color: "#9FA8D6", emissive: "#9FA8D6", shape: "arrow", scale,
      groupId: "dem", groupMode: "ordered", seq,
      meta: { pointDir: dir, dem: true, demHighlight: highlight },
    });
  };

  if (mode === "serpentine") {
    /**
     * DEM I & II: a ZIG-ZAG (boustrophedon) grid. The athlete reads row 0 LEFT to RIGHT, row 1
     * RIGHT to LEFT, row 2 left to right again — snaking down the whole board. Nothing is
     * highlighted, so the athlete must FIND the next arrow by holding the zig-zag path, make the
     * saccade to it, read which way it points, and only then flick. Losing the thread costs you
     * — which is exactly the oculomotor tracking this measures.
     */
    const top = 2.04;
    const bottom = 0.90;
    const rowStep = (top - bottom) / (rows - 1);
    const xL = -0.62, xR = 0.62;
    const colStep = (xR - xL) / (cols - 1);
    let seq = 0;
    for (let r = 0; r < rows; r++) {
      const leftToRight = r % 2 === 0;
      for (let k = 0; k < cols; k++) {
        const c = leftToRight ? k : cols - 1 - k;   // snake direction alternates each row
        push(seq++, xL + c * colStep, top - r * rowStep);
      }
    }
    return trials;
  }

  // DEM III: the dense grid — irregular horizontal spacing is the oculomotor stressor
  const top = 2.06;
  const rowGap = 0.088;
  const width = 1.7;
  let seq = 0;
  for (let r = 0; r < rows; r++) {
    const gaps = Array.from({ length: cols }, () => 0.55 + rng());
    const gsum = gaps.reduce((a, b) => a + b, 0);
    let x = -width / 2;
    for (let c = 0; c < cols; c++) {
      x += (gaps[c] / gsum) * width;
      push(seq++, x - width / (cols * 2), top - r * rowGap);
    }
  }
  return trials;
}

export const DEMArrows: DrillDefinition = {
  id: "assess-dem-arrows",
  name: "DEM (Arrows)",
  shortName: "DEM Arrows",
  phase: "Assess",
  description: "Timed oculomotor protocol. DEM I & II present a ZIG-ZAG grid of 40 arrows — read row by row, LEFT to RIGHT, then RIGHT to LEFT, snaking all the way down. Nothing is highlighted: you must find the next arrow yourself, make the saccade, read its direction, and flick. DEM III is the dense 80-arrow grid. The clock stops the instant the last arrow is answered. Every run is freshly randomized, and DEM II is always a different set from DEM I. Records total time, accuracy, average / fastest / slowest per-arrow time, and post-error slowing.",
  purpose: "Oculomotor function: saccadic accuracy, automaticity, completion speed.",
  interaction: "touch",
  responseMode: "joystick",
  environment: "arena",
  mvp: true,
  assessment: true,
  stopwatch: true,
  options: [
    { id: "subtest", label: "Subtest", defaultValue: "dem-1",
      values: [
        { id: "dem-1", label: "DEM I (40 arrows)" },
        { id: "dem-2", label: "DEM II (40 arrows)" },
        { id: "dem-3", label: "DEM III (80 arrows)" },
      ] },
    { id: "dominantHand", label: "Joystick hand", defaultValue: "right",
      values: [ { id: "right", label: "Right" }, { id: "left", label: "Left" } ] },
  ],
  instructions: [
    "1. DEM I & II: NOTHING is highlighted. Read the grid in a ZIG-ZAG - row 1 left to right, row 2 right to left, and so on down.",
    "2. FIND the next arrow yourself, jump your eyes to it, read which way it POINTS, then FLICK the joystick that way.",
    "3. Answered arrows dim behind you so you can see how far you have come - the next one is never marked.",
    "4. DEM III: the dense grid, and the current arrow DOES glow gold to guide you.",
    "5. Let the stick return to centre between flicks. On GO the clock starts; it stops on the final arrow.",
  ],
  controlsHint: "ZIG-ZAG THE GRID - FIND EACH ARROW, THEN FLICK THE WAY IT POINTS",
  levels: STANDARD({}),
  buildTrials: (params, rng) => {
    const sub = (params as { subtest?: string }).subtest ?? "dem-1";
    // DEM III: 80-arrow grid. DEM I & II: two columns of 20 (= 40), and DEM II
    // is salted differently so it is never the same set as DEM I.
    if (sub === "dem-3") return demArrows("grid", 10, 8, 0.042, 3, rng);
    return demArrows("serpentine", 8, 5, 0.05, sub === "dem-2" ? 2 : 1, rng);
  },
  analyze: (events: RawEvent[]) => {
    const scored = events.filter((e) => e.errorType !== "correctRejection");
    if (scored.length === 0) return [];
    const last = Math.max(...scored.map((e) => e.timestamp));
    const totalS = Math.round((last - DEM_FIRST_SPAWN) / 100) / 10;
    const errors = scored.filter((e) => !e.correct).length;
    const acc = Math.round((scored.filter((e) => e.correct).length / scored.length) * 1000) / 10;
    // per-arrow times (engine now measures each arrow from the previous one)
    const rts = scored.filter((e) => e.reactionMs !== undefined).map((e) => e.reactionMs!);
    const avg = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;
    const fastest = rts.length ? Math.round(Math.min(...rts)) : 0;
    const slowest = rts.length ? Math.round(Math.max(...rts)) : 0;
    // post-error slowing across the board
    const seq = [...scored].sort((a, b) => a.timestamp - b.timestamp);
    const pe: number[] = [];
    const pc: number[] = [];
    for (let i = 1; i < seq.length; i++) {
      const rt = seq[i].reactionMs;
      if (rt === undefined) continue;
      (seq[i - 1].correct ? pc : pe).push(rt);
    }
    const pes = pe.length && pc.length
      ? Math.round(pe.reduce((a, b) => a + b, 0) / pe.length - pc.reduce((a, b) => a + b, 0) / pc.length)
      : undefined;
    return [
      `DEM total time ${totalS}s over ${scored.length} arrows — ${acc}% accuracy (${errors} error(s)).`,
      `Per-arrow: average ${avg}ms · fastest ${fastest}ms · slowest ${slowest}ms.`,
      `Post-error slowing: ${pes === undefined ? "n/a (no errors)" : (pes > 0 ? "+" : "") + pes + "ms"}.`,
    ];
  },
  durationMs: (params) => {
    const sub = (params as { subtest?: string }).subtest ?? "dem-1";
    return sub === "dem-3" ? 302000 : 301000;
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
