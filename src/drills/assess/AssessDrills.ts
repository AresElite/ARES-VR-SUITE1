import type { DrillDefinition, TrialSpec } from "@/ares/drillTypes";
import { pick } from "@/utils/rng";

/**
 * ASSESS — the clinical baseline suite.
 * Fixed, standardized protocols (single level each) producing EMR-ready
 * measurements: fine/gross motor reaction, color vision screening,
 * dichoptic stereopsis, and oculomotor (DEM) function.
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

// ==================== 1. FINE MOTOR RAW REACTION TIME ====================
export const FineMotorRawRT: DrillDefinition = {
  id: "assess-fm-raw-rt",
  name: "Fine Motor Raw Reaction Time",
  shortName: "FM Raw RT",
  phase: "Assess",
  description: "25 trials. A PURPLE sphere fires from the central hole after a random delay — CLICK the trigger (either hand) the instant it launches. Average simple reaction time is recorded.",
  purpose: "Simple visuomotor reaction time (finger trigger).",
  interaction: "touch",
  responseMode: "trigger",
  launcher: true,
  environment: "arena",
  mvp: true,
  assessment: true,
  instructions: [
    "1. Watch the launcher hole dead ahead. Nothing happens for a random delay.",
    "2. The instant the PURPLE sphere fires, CLICK the top trigger - either hand.",
    "3. Do NOT anticipate - early clicks count as false starts.",
    "4. 25 trials. Your overall average reaction time is the score.",
  ],
  controlsHint: "PURPLE FIRES - CLICK THE TRIGGER INSTANTLY - 25 TRIALS",
  levels: STANDARD({ trials: 25, speed: 8, minDelay: 800, maxDelay: 2400, size: 0.08 }),
  buildTrials: (params, rng) => {
    const p = params as { trials: number; speed: number; minDelay: number; maxDelay: number; size: number };
    const travelMs = (Math.abs(LAUNCH_Z) / p.speed) * 1000;
    const trials: TrialSpec[] = [];
    let t = 1500;
    for (let i = 0; i < p.trials; i++) {
      t += p.minDelay + rng() * (p.maxDelay - p.minDelay);
      trials.push({
        id: `fmr-${i}`, spawnAt: t, duration: travelMs + 250, kind: "go", zone: "center",
        position: [0, 1.45, LAUNCH_Z], velocity: [(rng() - 0.5) * 0.2, (rng() - 0.5) * 0.15, p.speed],
        color: PURPLE, emissive: PURPLE, shape: "sphere", scale: p.size,
      });
      t += travelMs + 400;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; speed: number; maxDelay: number };
    return 1500 + p.trials * (p.maxDelay + (Math.abs(LAUNCH_Z) / p.speed) * 1000 + 650) + 1500;
  },
};

// ==================== 2. FINE MOTOR CHOICE REACTION TIME ====================
export const FineMotorChoiceRT: DrillDefinition = {
  id: "assess-fm-choice-rt",
  name: "Fine Motor Choice Reaction Time",
  shortName: "FM Choice RT",
  phase: "Assess",
  description: "25 randomized trials. PURPLE ball = RIGHT top trigger. TEAL ball = LEFT top trigger. Choice reaction time and wrong-hand errors are recorded.",
  purpose: "Two-choice visuomotor reaction time (finger trigger).",
  interaction: "touch",
  responseMode: "trigger",
  launcher: true,
  environment: "arena",
  mvp: true,
  assessment: true,
  instructions: [
    "1. Balls fire from the central hole after random delays.",
    "2. PURPLE ball - click the RIGHT top trigger.",
    "3. TEAL ball - click the LEFT top trigger.",
    "4. Click the instant it fires. Wrong-hand and early clicks are scored.",
    "5. 25 trials. Average choice reaction time is the score.",
  ],
  controlsHint: "PURPLE = RIGHT TRIGGER - TEAL = LEFT TRIGGER - 25 TRIALS",
  levels: STANDARD({ trials: 25, speed: 7.5, minDelay: 800, maxDelay: 2400, size: 0.08 }),
  buildTrials: (params, rng) => {
    const p = params as { trials: number; speed: number; minDelay: number; maxDelay: number; size: number };
    const travelMs = (Math.abs(LAUNCH_Z) / p.speed) * 1000;
    // balanced deck: exactly half purple / half teal, shuffled
    const deck = Array.from({ length: p.trials }, (_, k) => k % 2 === 0);
    for (let k = deck.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [deck[k], deck[j]] = [deck[j], deck[k]];
    }
    const trials: TrialSpec[] = [];
    let t = 1500;
    for (let i = 0; i < p.trials; i++) {
      t += p.minDelay + rng() * (p.maxDelay - p.minDelay);
      const isPurple = deck[i];
      trials.push({
        id: `fmc-${i}`, spawnAt: t, duration: travelMs + 250, kind: "go",
        zone: isPurple ? "right" : "left",
        position: [0, 1.45, LAUNCH_Z], velocity: [(rng() - 0.5) * 0.2, (rng() - 0.5) * 0.15, p.speed],
        requiredHand: isPurple ? "right" : "left",
        color: isPurple ? PURPLE : TEAL, emissive: isPurple ? PURPLE : TEAL,
        shape: "sphere", scale: p.size,
      });
      t += travelMs + 400;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; speed: number; maxDelay: number };
    return 1500 + p.trials * (p.maxDelay + (Math.abs(LAUNCH_Z) / p.speed) * 1000 + 650) + 1500;
  },
};

// ==================== 3/4. GROSS MOTOR (hexagon interception) ====================
// Six launcher holes in a hexagon; the ball flies past the athlete on a
// trajectory offset toward its hole's direction — the athlete must MOVE the
// hand to intercept before it passes. Contact distance from target center is
// recorded as eye-hand precision.
function buildGrossTrials(
  p: { trials: number; speed: number; minDelay: number; maxDelay: number; size: number; choice: boolean; dominantHand?: string },
  rng: () => number,
  idp: string,
): TrialSpec[] {
  const trials: TrialSpec[] = [];
  const travelDist = Math.abs(LAUNCH_Z) + 0.35;
  const travelMs = (travelDist / p.speed) * 1000;
  const dom = p.dominantHand === "left" ? "left" : "right";
  // balanced hole + color decks
  const holes = Array.from({ length: p.trials }, (_, k) => k % 6);
  const colors = Array.from({ length: p.trials }, (_, k) => k % 2 === 0);
  for (const arr of [holes, colors] as const) {
    for (let k = arr.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [(arr as number[] | boolean[])[k], (arr as number[] | boolean[])[j]] = [(arr as number[] | boolean[])[j], (arr as number[] | boolean[])[k]];
    }
  }
  let t = 2000;
  for (let i = 0; i < p.trials; i++) {
    t += p.minDelay + rng() * (p.maxDelay - p.minDelay);
    const a = (holes[i] / 6) * Math.PI * 2 + Math.PI / 6;
    const hx = Math.cos(a) * 0.95;
    const hy = 1.45 + Math.sin(a) * 0.62;
    // pass point: same direction as the hole, compressed to the reach shell
    const px = Math.cos(a) * (0.32 + rng() * 0.14);
    const py = 1.45 + Math.sin(a) * (0.24 + rng() * 0.1);
    const vx = (px - hx) / (travelMs / 1000);
    const vy = (py - hy) / (travelMs / 1000);
    const isPurple = p.choice ? (colors[i] as boolean) : true;
    trials.push({
      id: `${idp}-${i}`, spawnAt: t, duration: travelMs + 120, kind: "go",
      zone: px < -0.12 ? "left" : px > 0.12 ? "right" : "center",
      position: [hx, hy, LAUNCH_Z],
      velocity: [vx, vy, p.speed],
      requiredHand: p.choice ? (isPurple ? "right" : "left") : (dom as "left" | "right"),
      color: isPurple ? PURPLE : TEAL, emissive: isPurple ? PURPLE : TEAL,
      shape: "sphere", scale: p.size,
    });
    t += travelMs + 500;
  }
  return trials;
}
const grossDuration = (params: Record<string, unknown>) => {
  const p = params as { trials: number; speed: number; maxDelay: number };
  return 2000 + p.trials * (p.maxDelay + ((Math.abs(LAUNCH_Z) + 0.35) / p.speed) * 1000 + 620) + 1500;
};

export const GrossMotorRawRT: DrillDefinition = {
  id: "assess-gm-raw-rt",
  name: "Gross Motor Raw Reaction Time",
  shortName: "GM Raw RT",
  phase: "Assess",
  description: "25 trials. A PURPLE ball fires from one of six hexagon holes — intercept it with your DOMINANT hand before it flies past. Reaction time, hit accuracy, and eye-hand precision (contact distance from center) are recorded.",
  purpose: "Whole-arm interception: reaction, accuracy, precision.",
  interaction: "touch",
  responseMode: "strike",
  hexWall: true,
  environment: "arena",
  mvp: true,
  assessment: true,
  options: [
    { id: "dominantHand", label: "Dominant hand", defaultValue: "right",
      values: [ { id: "right", label: "Right" }, { id: "left", label: "Left" } ] },
  ],
  instructions: [
    "1. Six holes form a hexagon ahead of you. A PURPLE ball fires from a random hole.",
    "2. Move your DOMINANT hand - side to side, up or down - and make contact before it passes you.",
    "3. The ball travels toward your side of the hexagon; read the hole, move early, intercept cleanly.",
    "4. 25 trials. Average reaction time, hits vs stimuli, and contact precision are recorded.",
  ],
  controlsHint: "DOMINANT HAND ONLY - INTERCEPT BEFORE IT PASSES - 25 TRIALS",
  levels: STANDARD({ trials: 25, speed: 5.2, minDelay: 900, maxDelay: 2200, size: 0.09, choice: false }),
  buildTrials: (params, rng) => buildGrossTrials(params as never, rng, "gmr"),
  durationMs: grossDuration,
};

export const GrossMotorChoiceRT: DrillDefinition = {
  id: "assess-gm-choice-rt",
  name: "Gross Motor Choice Reaction Time",
  shortName: "GM Choice RT",
  phase: "Assess",
  description: "25 trials from the hexagon: PURPLE ball = intercept with the RIGHT hand, TEAL = LEFT hand. Right/left reaction times, hit accuracy, and eye-hand precision are recorded (side split shown as L/R asymmetry).",
  purpose: "Whole-arm choice interception with hand mapping.",
  interaction: "touch",
  responseMode: "strike",
  hexWall: true,
  environment: "arena",
  mvp: true,
  assessment: true,
  instructions: [
    "1. Balls fire from random hexagon holes.",
    "2. PURPLE ball - intercept with your RIGHT hand.",
    "3. TEAL ball - intercept with your LEFT hand.",
    "4. Move the correct hand into the flight path and make contact before it passes.",
    "5. 25 trials. Right/left reaction times, accuracy, and contact precision are recorded.",
  ],
  controlsHint: "PURPLE = RIGHT HAND - TEAL = LEFT HAND - 25 TRIALS",
  levels: STANDARD({ trials: 25, speed: 5.0, minDelay: 900, maxDelay: 2200, size: 0.09, choice: true }),
  buildTrials: (params, rng) => buildGrossTrials(params as never, rng, "gmc"),
  durationMs: grossDuration,
};

// ==================== 5. COLOR VISION (Ishihara Interactive) ====================
// Pseudo-isochromatic dot plates on drifting discs. 14 plates: 2 luminance
// control plates (comprehension check), 8 red-green confusion-axis plates
// (protan/deutan screening), 4 blue-yellow plates (tritan). The athlete
// answers by striking one of four numbered pads. Screening instrument:
// display-calibrated inks differ from print — flags candidates for formal
// plate testing rather than diagnosing type/severity.
export const ColorVisionAssessment: DrillDefinition = {
  id: "assess-color-vision",
  name: "Color Vision (Ishihara Interactive)",
  shortName: "Color Vision",
  phase: "Assess",
  description: "14 pseudo-isochromatic plates drift across your view — read the hidden number and strike the matching answer pad. Control, red-green, and blue-yellow confusion-axis plates. Clinical screening for color-discrimination deficits.",
  purpose: "Color-discrimination screening on dichromatic confusion axes.",
  interaction: "touch",
  responseMode: "strike",
  environment: "arena",
  mvp: true,
  assessment: true,
  instructions: [
    "1. A dotted plate appears ahead and drifts slowly - somewhere in the dots is a NUMBER.",
    "2. Read the number, then strike the matching answer pad below.",
    "3. If you truly cannot see a number, strike the '?' pad - do not guess.",
    "4. 14 plates. Some are visible to everyone; others test specific color axes.",
  ],
  controlsHint: "READ THE HIDDEN NUMBER - STRIKE THE MATCHING PAD",
  levels: STANDARD({ plates: 14, exposureMs: 7000 }),
  buildTrials: (params, rng) => {
    const p = params as { plates: number; exposureMs: number };
    const axes: ("control" | "rg" | "by")[] = [
      "control", "rg", "rg", "by", "rg", "rg", "control", "by", "rg", "rg", "by", "rg", "by", "rg",
    ].slice(0, p.plates) as never;
    const trials: TrialSpec[] = [];
    let t = 2000;
    for (let i = 0; i < p.plates; i++) {
      const digit = 1 + Math.floor(rng() * 9);
      const groupId = `cv-${axes[i]}-${i}`;
      // the drifting plate (decorative — the ANSWER is the pad strike)
      trials.push({
        id: `${groupId}-plate`, spawnAt: t, duration: p.exposureMs, kind: "distractor", decor: true,
        zone: "center", position: [-0.22, 1.52, -1.1],
        velocity: [0.06 + rng() * 0.04, (rng() - 0.5) * 0.02, 0],
        color: WHITE, shape: "plate", scale: 0.24,
        plate: { digit, axis: axes[i], seed: 1000 + i * 77 + digit },
      });
      // four answer pads: correct digit + 2 confusables + "?" (cannot see)
      const wrong1 = ((digit + 2 + Math.floor(rng() * 5)) % 9) + 1;
      let wrong2 = ((digit + 5 + Math.floor(rng() * 3)) % 9) + 1;
      if (wrong2 === wrong1 || wrong2 === digit) wrong2 = (wrong2 % 9) + 1;
      const answers = [String(digit), String(wrong1), String(wrong2), "?"];
      // shuffle pad order
      for (let k = answers.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [answers[k], answers[j]] = [answers[j], answers[k]];
      }
      answers.forEach((label, k) => {
        trials.push({
          id: `${groupId}-p${k}`, spawnAt: t + 600, duration: p.exposureMs - 600,
          kind: label === String(digit) ? "go" : "distractor",
          zone: "center", position: [-0.51 + k * 0.34, 1.05, -0.62],
          color: GRAY, emissive: TEAL, shape: "pad", scale: 0.06, label, groupId,
        });
      });
      t += p.exposureMs + 900;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { plates: number; exposureMs: number };
    return 2000 + p.plates * (p.exposureMs + 900) + 1500;
  },
};

// ==================== 6. STEREOPSIS (Dichoptic Randot) ====================
// Four random-dot discs per trial; one carries true retinal disparity (the
// left-eye and right-eye renderings are horizontally offset — the VR
// displays present each eye its own image, replacing Randot polarization
// with direct dichoptic control). Disparity descends 400" -> 20" arcsec at a
// 1.0 m test distance. Zero monocular cues: identical dot statistics on all
// four discs. Score = finest disparity reliably detected.
const ARCSEC_SERIES = [400, 280, 200, 140, 100, 70, 50, 40, 30, 20];

export const StereopsisAssessment: DrillDefinition = {
  id: "assess-stereopsis",
  name: "Stereopsis (Dichoptic Randot)",
  shortName: "Stereopsis",
  phase: "Assess",
  description: "Four random-dot discs — one floats in depth via true per-eye retinal disparity (400 down to 20 arcsec at 1 m). Strike the floating disc. Headset presentation replaces polarized Randot glasses with direct dichoptic control.",
  purpose: "Global stereopsis threshold (arcseconds of disparity).",
  interaction: "touch",
  responseMode: "strike",
  environment: "arena",
  mvp: true,
  assessment: true,
  instructions: [
    "1. Four dotted discs appear in a row, one meter ahead.",
    "2. ONE disc floats in depth - it is invisible without two-eyed depth perception.",
    "3. Strike the floating disc. If none floats, the level may be beyond your threshold - pick your best read.",
    "4. Depth gets subtler every round: 400 down to 20 arcseconds. 20 rounds.",
    "5. Requires the headset - the effect cannot appear on a flat screen.",
  ],
  controlsHint: "STRIKE THE DISC THAT FLOATS - DEPTH GETS SUBTLER",
  levels: STANDARD({ perDisparity: 2, exposureMs: 8000 }),
  buildTrials: (params, rng) => {
    const p = params as { perDisparity: number; exposureMs: number };
    const D = 1.0; // meters — viewing distance for arcsec conversion
    const trials: TrialSpec[] = [];
    let t = 2000;
    let n = 0;
    for (const arcsec of ARCSEC_SERIES) {
      for (let rep = 0; rep < p.perDisparity; rep++) {
        const groupId = `st-${arcsec}-${rep}`;
        const shift = D * arcsec * 4.848e-6; // meters of horizontal offset
        const targetIdx = Math.floor(rng() * 4);
        for (let k = 0; k < 4; k++) {
          trials.push({
            id: `${groupId}-d${k}`, spawnAt: t, duration: p.exposureMs,
            kind: k === targetIdx ? "go" : "distractor",
            zone: "center", position: [-0.45 + k * 0.3, 1.45, -D],
            color: WHITE, shape: "stereo", scale: 0.105,
            stereoShiftM: k === targetIdx ? shift : 0,
            groupId,
            meta: { rdsSeed: 500 + n * 13 + k },
          });
        }
        t += p.exposureMs + 800;
        n++;
      }
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { perDisparity: number; exposureMs: number };
    return 2000 + ARCSEC_SERIES.length * p.perDisparity * (p.exposureMs + 800) + 1500;
  },
};

// ==================== 7. DEM (ARROWS) ====================
// Developmental Eye Movement test, arrow form. Vertical subtests A and B
// (two columns of 25) isolate visual-verbal automaticity from oculomotor
// demand; the horizontal subtest imposes DEM-style left-to-right saccadic
// scanning with irregular spacing; DEM-100 extends to 100 arrows with
// variable spacing and vertical jitter loading microsaccadic precision.
// Response: dominant-hand thumbstick flick matching each arrow's direction.
// Recorded: total time, accuracy, post-error slowing, and (A/B vs C) the
// vertical/horizontal ratio analog.
const DEM_DIRS = ["up", "down", "left", "right"] as const;

function demArrows(
  count: number,
  layout: "vertical" | "horizontal" | "dem100",
  budgetMs: number,
  rng: () => number,
): TrialSpec[] {
  const trials: TrialSpec[] = [];
  const positions: [number, number][] = [];
  if (layout === "vertical") {
    // two columns, count/2 rows each — read col 1 top->bottom, then col 2
    const rows = count / 2;
    for (let c = 0; c < 2; c++) {
      for (let rIdx = 0; rIdx < rows; rIdx++) {
        positions.push([c === 0 ? -0.3 : 0.3, 1.82 - rIdx * (0.78 / (rows - 1))]);
      }
    }
  } else if (layout === "horizontal") {
    // 5 rows x (count/5), DEM-C style irregular horizontal spacing
    const cols = count / 5;
    for (let rIdx = 0; rIdx < 5; rIdx++) {
      let x = -0.62;
      for (let c = 0; c < cols; c++) {
        x += 0.06 + rng() * 0.09;
        positions.push([Math.min(0.66, x), 1.74 - rIdx * 0.15]);
      }
    }
  } else {
    // 10 rows x 10, irregular spacing + vertical micro-jitter
    for (let rIdx = 0; rIdx < 10; rIdx++) {
      let x = -0.64;
      for (let c = 0; c < 10; c++) {
        x += 0.05 + rng() * 0.085;
        positions.push([Math.min(0.68, x), 1.86 - rIdx * 0.088 + (rng() - 0.5) * 0.02]);
      }
    }
  }
  for (let i = 0; i < count; i++) {
    const dir = pick(rng, DEM_DIRS);
    trials.push({
      id: `dem-${i}`, spawnAt: 1500, duration: budgetMs, kind: "go",
      zone: "center", position: [positions[i][0], positions[i][1], -0.95],
      requiredDirection: dir,
      color: WHITE, emissive: GOLD, shape: "cone", scale: 0.022,
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
  description: "Developmental Eye Movement test, arrow form. Flick the dominant-hand joystick to match each arrow in reading order. Vertical A/B (2×25), horizontal C, and the 100-arrow DEM protocol with irregular spacing. Time, accuracy, and post-error slowing are recorded.",
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
  DEMArrows,
];
