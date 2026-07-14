import type { DrillDefinition, TrialSpec, SliceDirection, TargetZone, HandRule } from "@/ares/drillTypes";
import { ARES_COLORS } from "@/ares/colors";
import { pick } from "@/utils/rng";
import { strikePosition, PERIPHERAL_ZONES, STRIKE_REACH } from "../shared/zones";
import { levels25, lerp25, ilerp25, levels50, lerp50, ilerp50 } from "../shared/levels";

/**
 * EXECUTE — direct ports of the A.R.E.S. Performance Suite drills.
 * Names, progression tables, colors, and rules follow the touchscreen
 * suite's source (drill_logic_export + drill components); "tap" becomes a
 * physical strike with hand/controller in VR.
 */

const TEAL = "#2998AA";
const BLUE = "#7FD3DE";
const ORANGE = "#007A8A";
const PURPLE = "#8B5CF6";
const CYAN = "#7FD3DE";
const WHITE = "#EAF0FF";
const RED = "#4C1D95";

const Z = -0.62;
const px2scale = (px: number) => Math.max(0.035, Math.min(0.13, px * 0.00085));

// ============================== REACTION GRID ==============================
// 60-second format. 6 locations; the active target lights and moves the
// instant it is struck. Spacing widens from central cluster to full board
// as levels rise. Color/hand modes and sphere zones are trainer dropdowns.
function rgPositions(level: number, zoneMode: string): [number, number, number][] {
  const f = (level - 1) / 24;
  const zoneMul = zoneMode === "inner" ? 0.55 : zoneMode === "outer" ? 1.35 : 1.0;
  const dx = Math.min(0.88, (0.08 + (0.42 - 0.08) * f) * 1.5 * zoneMul);
  const dy = (0.15 + (0.42 - 0.15) * f) * 1.1 * zoneMul;
  const hi = Math.min(1.9, 1.45 + dy);
  const lo = Math.max(0.98, 1.45 - dy);
  return [
    [-dx, hi, Z],
    [dx, hi, Z],
    [-dx, 1.45, Z],
    [dx, 1.45, Z],
    [-dx, lo, Z],
    [dx, lo, Z],
  ];
}

type RGColorMode = "purple-only" | "purple-teal" | "purple-teal-blue";

/**
 * Balanced color deck: exact per-color counts, shuffled. Coin flips can run
 * streaky inside a 60s window and skew the left/right demand — decks can't.
 */
function colorDeck(mode: string, count: number, rng: () => number): { color: string; hand?: "left" | "right" }[] {
  const variants: { color: string; hand?: "left" | "right" }[] =
    mode === "purple-teal"
      ? [ { color: PURPLE, hand: "right" }, { color: TEAL, hand: "left" } ]
      : mode === "purple-teal-blue"
        ? [ { color: PURPLE, hand: "right" }, { color: TEAL, hand: "left" }, { color: BLUE } ]
        : [ { color: PURPLE } ];
  const deck = Array.from({ length: count }, (_, k) => variants[k % variants.length]);
  for (let k = deck.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [deck[k], deck[j]] = [deck[j], deck[k]];
  }
  return deck;
}

export const ReactionGrid: DrillDefinition = {
  id: "reaction-grid",
  name: "Reaction Grid",
  shortName: "Reaction Grid",
  phase: "Execute",
  description: "60 seconds. 6 target locations — strike the ACTIVE target; it moves the instant you touch it. Color modes rule which hand strikes: PURPLE = right, TEAL = left, BLUE = either.",
  purpose: "Rapid foveation, peripheral detection, motor output speed.",
  interaction: "touch",
  responseMode: "strike",
  environment: "arena",
  mvp: true,
  hardStop: true,
  handIdentity: true,
  options: [
    {
      id: "colorMode",
      label: "Colors",
      defaultValue: "purple-only",
      values: [
        { id: "purple-only", label: "Purple only (any hand)" },
        { id: "purple-teal", label: "Purple=R / Teal=L" },
        { id: "purple-teal-blue", label: "Purple=R / Teal=L / Blue=Any" },
      ],
    },
    {
      id: "zoneMode",
      label: "Zone",
      defaultValue: "full",
      values: [
        { id: "full", label: "Full Sphere" },
        { id: "inner", label: "Inner Sphere Only" },
        { id: "outer", label: "Outer Sphere Only" },
      ],
    },
  ],
  instructions: [
    "1. 60 seconds on the clock. 6 possible target locations.",
    "2. STRIKE the lit target - it instantly moves to a new spot.",
    "3. Color rules: PURPLE = RIGHT hand. TEAL = LEFT hand. BLUE = either hand.",
    "4. Purple-only mode: any hand, pure speed.",
    "5. Spacing pushes outward and taller as levels climb - stay centered, let the eyes lead.",
  ],
  controlsHint: "60s - STRIKE THE LIT TARGET - PURPLE=R TEAL=L BLUE=ANY",
  levels: levels50((i) => ({
    label: i < 10 ? "Central Cluster" : i < 20 ? "Moderate Spread" : i < 30 ? "Wide Horizontal" : i < 40 ? "Wide H + V" : "Full Board",
    parameters: { level: Math.min(25, Math.ceil((i + 1) / 2)), timeoutMs: ilerp50(1700, 850, i), scale: lerp50(0.062, 0.042, i) },
  })),
  buildTrials: (params, rng) => {
    const p = params as { level: number; timeoutMs: number; scale: number; colorMode?: string; zoneMode?: string };
    const spots = rgPositions(p.level, p.zoneMode ?? "full");
    const trials: TrialSpec[] = [];
    let last = -1;
    const members = Math.ceil(62000 / Math.max(500, p.timeoutMs * 0.45));
    const deck = colorDeck(p.colorMode ?? "purple-only", members, rng);
    for (let i = 0; i < members; i++) {
      let idx = Math.floor(rng() * 6);
      if (idx === last) idx = (idx + 1 + Math.floor(rng() * 4)) % 6;
      last = idx;
      const c = deck[i];
      trials.push({
        id: `rg-${i}`,
        spawnAt: i === 0 ? 800 : -1,
        chainId: "rg",
        chainGapMs: 0,
        seq: i,
        duration: p.timeoutMs,
        kind: "go",
        zone: idx % 2 === 0 ? "left" : "right",
        position: spots[idx],
        requiredHand: c.hand,
        color: c.color,
        emissive: c.color,
        shape: "sphere",
        scale: p.scale,
      });
    }
    return trials;
  },
  durationMs: () => 61500,
};

// =========================== EYE-HAND COORDINATION ===========================
// Central/peripheral distribution, stimulus size, and color/hand modes are
// trainer dropdowns matching the A.R.E.S. Performance Suite formats.
/**
 * The wall used to sit at 0.98 m — 44% beyond the documented 0.55-0.75 m strike
 * shell. That is a full arm extension on every single rep, and it is why the
 * targets had to be so large in the first place: the size was compensating for
 * the distance. Halving the targets without pulling the wall in would have made
 * the drill unplayable, so both move together.
 */
const EHC_REACH = STRIKE_REACH;
/** Every size halved, as requested. Medium is now 3.9 cm radius (was 7.8 cm). */
const EHC_SIZES: Record<string, number> = { xl: 0.0575, l: 0.0475, m: 0.039, s: 0.031, xs: 0.025 };

/**
 * NO MIDLINE EXCLUSION. Cross-body reaching is a FEATURE.
 *
 * An earlier fix banned purple from the left half and teal from the right, to stop
 * the idle hand brushing through an orb it wasn't allowed to take. It worked — and
 * it was the wrong trade. It deleted cross-body reaching from the drill entirely,
 * which is one of the most valuable demands in it: reaching a right-hand target
 * across the midline loads trunk rotation, shoulder mobility, and contralateral
 * motor control, and an athlete who can only work their own side of the body has a
 * hole in exactly the place sport exposes.
 *
 * The false wrong-hand errors are fixed properly instead, in the collider, by two
 * rules that cost the athlete nothing:
 *
 *   CORRECT-HAND PREFERENCE  when both hands are in contact, the required hand
 *                            resolves it. Array order is not a rule.
 *   INTENT GATE              the wrong hand only errs if it STRIKES — moving with
 *                            speed, INTO the target. A hand in transit is not a
 *                            hand committing.
 *
 * The only remaining constraint is physical: a hand-assigned target must be
 * REACHABLE BY THAT HAND (clampToReach is hand-aware). Purple can sit well past
 * the midline — it just cannot sit somewhere the right arm cannot get to.
 */
const EHC_DIST: Record<string, number> = {
  "60-40": 0.6, "50-50": 0.5, "40-60": 0.4, "30-70": 0.3, "20-80": 0.2, "10-90": 0.1, "0-100": 0,
};

export const EyeHandCoordination: DrillDefinition = {
  id: "eye-hand-coordination",
  name: "Eye-Hand Coordination",
  shortName: "Eye-Hand Coordination",
  phase: "Execute",
  description: "60 seconds. THREE targets always live across the strike wall — clear them as they appear; each strike spawns the next. Central/peripheral distribution, stimulus size, and color/hand rules are trainer-selectable.",
  purpose: "Continuous eye-hand mapping, bimanual coverage, scan-and-strike speed.",
  interaction: "touch",
  responseMode: "strike",
  environment: "arena",
  mvp: true,
  hardStop: true,
  handIdentity: true,
  options: [
    {
      id: "colorMode",
      label: "Colors",
      defaultValue: "purple-only",
      values: [
        { id: "purple-only", label: "Purple only (any hand)" },
        { id: "purple-teal", label: "Purple=R / Teal=L" },
        { id: "purple-teal-blue", label: "Purple=R / Teal=L / Blue=Any" },
      ],
    },
    {
      id: "distribution",
      label: "Central/Periph",
      defaultValue: "50-50",
      values: [
        { id: "60-40", label: "60/40" },
        { id: "50-50", label: "50/50" },
        { id: "40-60", label: "40/60" },
        { id: "30-70", label: "30/70" },
        { id: "20-80", label: "20/80" },
        { id: "10-90", label: "10/90" },
        { id: "0-100", label: "0/100" },
      ],
    },
    {
      id: "sizeOpt",
      label: "Size",
      defaultValue: "m",
      values: [
        { id: "xl", label: "Extra Large" },
        { id: "l", label: "Large" },
        { id: "m", label: "Medium" },
        { id: "s", label: "Small" },
        { id: "xs", label: "Extra Small" },
      ],
    },
  ],
  instructions: [
    "1. 60 seconds on the clock. THREE targets are always live on the strike wall at full arm's reach.",
    "2. STRIKE any live target - a replacement instantly spawns in a DIFFERENT section of the field.",
    "3. Color rules: PURPLE = RIGHT hand. TEAL = LEFT hand. BLUE = either. Purple-only = any hand.",
    "4. The central/peripheral mix follows the selected distribution.",
    "5. Use BOTH hands - left covers left field, right covers right. Clear as many as you can before time expires.",
  ],
  controlsHint: "60s - CLEAR THE WALL - PURPLE=R TEAL=L BLUE=ANY",
  levels: levels50((i) => ({
    label: `3 live targets — ${(ilerp50(2500, 1150, i) / 1000).toFixed(1)}s windows`,
    parameters: {
      spreadDeg: lerp50(14, 46, i),
      streams: 3, // ALWAYS three concurrent stimuli — strike one, another spawns
      timeoutMs: ilerp50(2500, 1150, i),
    },
  })),
  buildTrials: (params, rng) => {
    const p = params as {
      spreadDeg: number; streams: number; timeoutMs: number;
      colorMode?: string; distribution?: string; sizeOpt?: string;
    };
    const scale = EHC_SIZES[p.sizeOpt ?? "m"] ?? 0.078;
    const centralFrac = EHC_DIST[p.distribution ?? "50-50"] ?? 0.5;
    const perStream = Math.ceil(62000 / 480); // ~130 members/stream: never drains in 60s
    const trials: TrialSpec[] = [];
    for (let sIdx = 0; sIdx < p.streams; sIdx++) {
      const deck = colorDeck(p.colorMode ?? "purple-only", perStream, rng);
      let prevZone: TargetZone | null = null;
      for (let i = 0; i < perStream; i++) {
        const central = rng() < centralFrac;
        // the replacement always populates a NEW section: never repeat the
        // zone the struck target occupied
        let zone: TargetZone = central ? "center" : (pick(rng, PERIPHERAL_ZONES) as TargetZone);
        for (let a = 0; a < 4 && zone === prevZone; a++) {
          zone = pick(rng, PERIPHERAL_ZONES.concat(["center"]) as TargetZone[]);
        }
        prevZone = zone;
        const ecc = zone === "center" ? 2 + rng() * 9 : 16 + rng() * Math.max(10, p.spreadDeg - 16);
        const c = deck[i];
        trials.push({
          id: `ehc-${sIdx}-${i}`,
          spawnAt: i === 0 ? 1000 + sIdx * 400 : -1,
          chainId: `ehc-${sIdx}`,
          chainGapMs: 80,
          seq: i,
          duration: p.timeoutMs,
          kind: "go",
          zone,
          position: strikePosition(zone, ecc, 0.12, rng, EHC_REACH),
          requiredHand: c.hand,
          color: c.color,
          emissive: c.color,
          shape: "sphere",
          scale,
        });
      }
    }
    return trials;
  },
  durationMs: () => 61500,
};

// ============================== RAW-REACTION ==============================
// A ball is SHOT from the central launcher toward the athlete after a random
// delay. Response = index-trigger CLICK (either hand) the instant it fires.
// 25 trials at every level; full RT metric set on the results panel.
const LAUNCH_Z = -6;

export const RawReaction: DrillDefinition = {
  id: "raw-reaction",
  name: "Raw-Reaction",
  shortName: "Raw-Reaction",
  phase: "Execute",
  description: "A ball fires from the central launcher after a random delay. CLICK the trigger — either hand — the instant it launches. 25 trials; do not anticipate.",
  purpose: "Pure simple reaction time to visual onset.",
  interaction: "touch",
  responseMode: "trigger",
  launcher: true,
  environment: "arena",
  mvp: true,
  instructions: [
    "1. Watch the launcher hole dead ahead. Nothing happens for a random delay.",
    "2. The instant a ball FIRES out of the hole, CLICK the top trigger - either hand.",
    "3. Do NOT anticipate. Clicking before a launch counts as a false start.",
    "4. 25 trials. Your average reaction time and consistency are scored.",
  ],
  controlsHint: "CLICK THE TRIGGER THE INSTANT THE BALL FIRES",
  levels: levels50((i) => ({
    label: `${(lerp50(6, 14, i)).toFixed(1)} m/s launches, delays up to ${(ilerp50(1400, 3400, i) / 1000).toFixed(1)}s`,
    parameters: {
      trials: 25,
      speed: lerp50(6, 14, i),
      minDelay: 600,
      maxDelay: ilerp50(1400, 3400, i),
      size: lerp50(0.09, 0.05, i),
    },
  })),
  buildTrials: (params, rng) => {
    const p = params as { trials: number; speed: number; minDelay: number; maxDelay: number; size: number };
    const travelMs = (Math.abs(LAUNCH_Z) / p.speed) * 1000;
    const trials: TrialSpec[] = [];
    let t = 1500;
    for (let i = 0; i < p.trials; i++) {
      t += p.minDelay + rng() * (p.maxDelay - p.minDelay);
      trials.push({
        id: `rr-${i}`,
        spawnAt: t,
        duration: travelMs + 250,
        kind: "go",
        zone: "center",
        position: [0, 1.45, LAUNCH_Z],
        velocity: [(rng() - 0.5) * 0.3, (rng() - 0.5) * 0.2, p.speed],
        color: TEAL,
        emissive: TEAL,
        shape: "sphere",
        scale: p.size,
      });
      t += travelMs + 400;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; speed: number; maxDelay: number };
    const travelMs = (Math.abs(LAUNCH_Z) / p.speed) * 1000;
    return 1500 + p.trials * (p.maxDelay + travelMs + 650) + 1500;
  },
};

// ================================ CHOICE-RT ================================
// PURPLE ball -> RIGHT trigger. TEAL ball -> LEFT trigger. Balls fire from
// the central launcher; 50 trials at every level.
export const ChoiceRT: DrillDefinition = {
  id: "choice-rt",
  name: "Choice-RT",
  shortName: "Choice-RT",
  phase: "Execute",
  description: "Balls fire from the launcher: PURPLE = click the RIGHT trigger, TEAL = click the LEFT trigger. 50 trials of pure choice reaction.",
  purpose: "Choice reaction time — stimulus-response mapping under time pressure.",
  interaction: "touch",
  responseMode: "trigger",
  launcher: true,
  environment: "arena",
  mvp: true,
  instructions: [
    "1. Watch the launcher hole. Balls fire toward you after random delays.",
    "2. PURPLE ball - click the RIGHT top trigger (right hand).",
    "3. TEAL ball - click the LEFT top trigger (left hand).",
    "4. Click the instant the ball fires. Wrong-hand clicks and early clicks are scored against you.",
    "5. 50 trials. Average choice reaction time plus the full metric set are recorded.",
  ],
  controlsHint: "PURPLE = RIGHT TRIGGER - TEAL = LEFT TRIGGER",
  levels: levels50((i) => ({
    label: `${(lerp50(5.5, 13, i)).toFixed(1)} m/s launches, delays up to ${(ilerp50(1500, 3400, i) / 1000).toFixed(1)}s`,
    parameters: {
      trials: 24, // rep limit per athlete feedback — 50+ ran way too long
      speed: lerp50(5.5, 13, i),
      minDelay: 600,
      maxDelay: ilerp50(1500, 3400, i),
      size: lerp50(0.09, 0.05, i),
    },
  })),
  buildTrials: (params, rng) => {
    const p = params as { trials: number; speed: number; minDelay: number; maxDelay: number; size: number };
    const travelMs = (Math.abs(LAUNCH_Z) / p.speed) * 1000;
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
        id: `crt-${i}`,
        spawnAt: t,
        duration: travelMs + 250,
        kind: "go",
        zone: "center",
        position: [0, 1.45, LAUNCH_Z],
        velocity: [(rng() - 0.5) * 0.3, (rng() - 0.5) * 0.2, p.speed],
        requiredHand: isPurple ? "right" : "left",
        color: isPurple ? PURPLE : TEAL,
        emissive: isPurple ? PURPLE : TEAL,
        shape: "sphere",
        scale: p.size,
      });
      t += travelMs + 400;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; speed: number; maxDelay: number };
    const travelMs = (Math.abs(LAUNCH_Z) / p.speed) * 1000;
    return 1500 + p.trials * (p.maxDelay + travelMs + 650) + 1500;
  },
};

// ================================ GO/NO GO ================================
// 50-LEVEL PROGRESSION across six bands, engaging every difficulty axis the
// engine offers. `k` = level-1 (0..49); band-local ramps use gngT(k).
//   L1-10   CENTRAL       learn the rule; big, slow, central, 25% no-go
//   L11-20  SPATIAL       periphery opens to 30 deg; smaller, faster
//   L21-30  TEMPO         relentless pace; no-go turns RARE (more surprising)
//   L31-38  ELITE FLIP    WHITE becomes no-go; 4 go-colors; 38 deg field
//   L39-44  STOP-SIGNAL   targets can flip to no-go MID-FLIGHT (red flash)
//   L45-50  APEX          45 deg field, drifting targets, burst pacing
const GNG_LEVELS = 50;
const gngT = (k: number, a: number, b: number) => (k - a) / (b - a);
const gLerp = (from: number, to: number, t: number) => from + (to - from) * Math.max(0, Math.min(1, t));

interface GngParams {
  trials: number; showMs: number; isiMin: number; isiMax: number; size: number;
  noGoProb: number; stopProb: number; eccMax: number; spatial: boolean;
  elite: boolean; fourGo: boolean; drift: number;
}

function gngParams(k: number): GngParams {
  let p: GngParams = {
    trials: 24, showMs: 1500, isiMin: 450, isiMax: 1300, size: 90,
    noGoProb: 0.25, stopProb: 0, eccMax: 0, spatial: false,
    elite: false, fourGo: false, drift: 0,
  };
  if (k <= 9) {            // CENTRAL
    const t = gngT(k, 0, 9);
    p = { ...p, showMs: gLerp(1500, 1150, t), isiMax: gLerp(1300, 1050, t), size: gLerp(90, 64, t) };
  } else if (k <= 19) {    // SPATIAL
    const t = gngT(k, 10, 19);
    p = { ...p, spatial: true, eccMax: gLerp(14, 30, t), showMs: gLerp(1150, 950, t),
      isiMax: gLerp(1050, 900, t), size: gLerp(64, 48, t), noGoProb: gLerp(0.27, 0.3, t) };
  } else if (k <= 29) {    // TEMPO — rare no-go is the trap
    const t = gngT(k, 20, 29);
    p = { ...p, spatial: true, eccMax: 30, showMs: gLerp(950, 850, t),
      isiMin: gLerp(450, 350, t), isiMax: gLerp(900, 750, t), size: gLerp(48, 40, t),
      noGoProb: gLerp(0.3, 0.2, t), trials: 26 };
  } else if (k <= 37) {    // ELITE FLIP
    const t = gngT(k, 30, 37);
    p = { ...p, spatial: true, elite: true, fourGo: true, eccMax: gLerp(30, 38, t),
      showMs: gLerp(850, 800, t), isiMin: 350, isiMax: gLerp(750, 700, t),
      size: gLerp(40, 37, t), noGoProb: 0.28, trials: 26 };
  } else if (k <= 43) {    // STOP-SIGNAL HYBRID
    const t = gngT(k, 38, 43);
    p = { ...p, spatial: true, elite: true, fourGo: true, eccMax: 38,
      showMs: gLerp(800, 780, t), isiMin: 330, isiMax: 680, size: gLerp(37, 35, t),
      noGoProb: 0.22, stopProb: gLerp(0.12, 0.18, t), trials: 28 };
  } else {                 // APEX
    const t = gngT(k, 44, 49);
    p = { ...p, spatial: true, elite: true, fourGo: true, eccMax: gLerp(38, 45, t),
      showMs: gLerp(780, 720, t), isiMin: gLerp(330, 300, t), isiMax: gLerp(680, 620, t),
      size: gLerp(35, 30, t), noGoProb: 0.28, stopProb: 0.2, drift: gLerp(0.05, 0.11, t), trials: 28 };
  }
  return { ...p, showMs: Math.round(p.showMs), isiMin: Math.round(p.isiMin),
    isiMax: Math.round(p.isiMax), size: px2scale(p.size),
    noGoProb: Math.round(p.noGoProb * 100) / 100, stopProb: Math.round(p.stopProb * 100) / 100,
    eccMax: Math.round(p.eccMax), drift: Math.round(p.drift * 1000) / 1000 };
}

const GNG_BAND = (k: number) =>
  k <= 9 ? "Central" : k <= 19 ? "Spatial" : k <= 29 ? "Tempo" :
  k <= 37 ? "Elite (white no-go)" : k <= 43 ? "Stop-Signal" : "Apex";

/* GoNoGo moved to its own module — see execute/GoNoGoVR.ts (full 50-level port). */


// =============================== STOP-SIGNAL ===============================
// Go target appears; on stop trials a RED STOP RING flashes around it after
// the SSD — inhibit. Purple no-go targets must always be ignored.
export const StopSignal: DrillDefinition = {
  id: "stop-signal",
  name: "Stop-Signal",
  shortName: "Stop-Signal",
  phase: "Execute",
  description: "Strike GO targets fast — unless the red STOP ring flashes around one after onset. Purple no-go targets are always ignored.",
  purpose: "Reactive inhibition — cancelling an initiated response.",
  interaction: "touch",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. When a TEAL GO target appears: STRIKE FAST.",
    "2. If the target flashes RED shortly after appearing - that is the STOP SIGNAL. DO NOT strike.",
    "3. PURPLE targets are no-go from the start. Ignore them completely.",
    "4. The stop signal comes later and later as you level up - commitment gets harder to cancel.",
  ],
  controlsHint: "STRIKE TEAL FAST - CANCEL IF IT TURNS RED",
  levels: levels50((i) => ({
    label: `${i < 30 ? "Standard" : "High-pressure"} — SSD ~${ilerp50(200, 600, i)}ms`,
    parameters: {
      trials: i < 30 ? 24 : 28,
      ssd: ilerp50(200, 600, i),
      deadline: ilerp50(2000, 1300, i),
      stopProb: i < 30 ? 0.25 : 0.3,
      noGoProb: 0.15,
      size: px2scale(lerp50(64, 30, i)),
    },
  })),
  buildTrials: (params, rng) => {
    const p = params as { trials: number; ssd: number; deadline: number; stopProb: number; noGoProb: number; size: number };
    const trials: TrialSpec[] = [];
    let t = 1200;
    let lastX = 99;
    let lastY = 99;
    for (let i = 0; i < p.trials; i++) {
      const r = rng();
      const isNoGo = r < p.noGoProb;
      const isStop = !isNoGo && r < p.noGoProb + p.stopProb;
      const ssd = p.ssd + (rng() - 0.5) * 80;
      // never co-locate with the previous (possibly still-live) trial
      let px = (rng() - 0.5) * 0.5;
      let py = 1.4 + (rng() - 0.5) * 0.3;
      for (let a = 0; a < 6 && Math.hypot(px - lastX, py - lastY) < p.size * 3.4; a++) {
        px = (rng() - 0.5) * 0.5;
        py = 1.4 + (rng() - 0.5) * 0.3;
      }
      lastX = px;
      lastY = py;
      trials.push({
        id: `ss-${i}`,
        spawnAt: t,
        duration: p.deadline,
        kind: isNoGo ? "noGo" : "go",
        ...(isStop ? { switchKindAt: t + ssd, switchKindTo: "noGo" as const, switchColor: RED } : {}),
        zone: "center",
        position: [px, py, Z],
        color: isNoGo ? PURPLE : TEAL,
        emissive: isNoGo ? PURPLE : TEAL,
        shape: "sphere", // no-go is a proper orb now (was a flat ring)
        scale: p.size,
      });
      t += p.deadline * 0.55 + rng() * 600;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; deadline: number };
    return 1200 + p.trials * (p.deadline * 0.55 + 600) + p.deadline + 1500;
  },
};

// ============================== FOCUS-FRENZY ==============================
// Moving targets ramp urgency Purple -> Teal -> Blue -> Orange -> Red.
// Letting a RED target expire is the failure condition.
export const FocusFrenzy: DrillDefinition = {
  id: "focus-frenzy",
  name: "Focus-Frenzy",
  shortName: "Focus-Frenzy",
  phase: "Execute",
  description: "Small targets drift through free space and ramp color to signal urgency: Purple → Teal → Blue → Orange → Red. They shrink, speed up, and race to red as levels climb. Never let a red one expire.",
  purpose: "Sustained attention, target triage, and clearing under pressure.",
  interaction: "touch",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. Small targets drift through free space, each in its own region, ramping color:",
    "2. PURPLE (new) - TEAL - BLUE - ORANGE - RED (about to expire).",
    "3. Strike them before they reach RED - they move, so lead your hand. A red expiry fails.",
    "4. Triage: always clear the most urgent colors first.",
  ],
  controlsHint: "CLEAR TARGETS BEFORE THEY TURN RED",
levels: levels50((i) => ({
    label: `${i < 16 ? 2 : i < 34 ? 3 : 4} live — ${(ilerp50(5000, 1200, i) / 1000).toFixed(1)}s to red`,
    parameters: {
      streams: i < 16 ? 2 : i < 34 ? 3 : 4,
      perStream: 22,
      lifeMs: ilerp50(5000, 1200, i),   // faster color ramp to red as levels climb
      scale: lerp50(0.062, 0.026, i),   // targets shrink sharply
      amp: lerp50(0.10, 0.20, i),       // wider free-space travel
      freq: lerp50(0.7, 3.1, i),        // faster oscillation — harder to hit exactly
    },
  })),
  buildTrials: (params, rng) => {
    const p = params as { streams: number; perStream: number; lifeMs: number; scale: number; amp: number; freq: number };
    // four well-separated anchors — a target wandering within `amp` of its
    // anchor can never reach a neighbouring anchor's zone (spacing > 2*amp+size)
    const ANCHORS: [number, number][] = [
      [-0.42, 1.30], [0.42, 1.30], [-0.42, 1.68], [0.42, 1.68],
    ];
    /**
     * Focus-Frenzy was the ONLY drill in the suite sitting outside the strike
     * shell: z = -0.85 against a documented reach of 0.55-0.75 m. Combined with
     * targets as small as 2.6 cm, the total hit tolerance was ~10 cm at a point
     * the athlete could only reach at full extension — while the target was also
     * oscillating away from them. Hits genuinely could not land, which is exactly
     * what was reported: strike it, nothing counts, it rides the ramp to red.
     */
    const Z_FF = -STRIKE_REACH;
    const trials: TrialSpec[] = [];
    for (let sIdx = 0; sIdx < p.streams; sIdx++) {
      const [ax0, ay0] = ANCHORS[sIdx];
      for (let i = 0; i < p.perStream; i++) {
        // amplitude kept safely inside the anchor spacing; vertical is tighter
        const ampX = Math.min(p.amp, 0.2);
        const ampY = Math.min(p.amp * 0.6, 0.12);
        trials.push({
          id: `ff-${sIdx}-${i}`,
          spawnAt: i === 0 ? 1000 + sIdx * 500 : -1,
          chainId: `ff-${sIdx}`,
          chainGapMs: 120,
          seq: i,
          duration: p.lifeMs,
          kind: "go",
          zone: ax0 < -0.12 ? "left" : ax0 > 0.12 ? "right" : "center",
          position: [ax0, ay0, Z_FF],
          wander: {
            ax: ampX, ay: ampY,
            wx: p.freq * (0.85 + rng() * 0.4),
            wy: p.freq * (0.7 + rng() * 0.4),
            px: rng() * Math.PI * 2, py: rng() * Math.PI * 2,
          },
          color: PURPLE,
          emissive: PURPLE,
          /**
           * A MOVING target earns a little extra tolerance, scaled to how fast it
           * is actually travelling. A 2.6 cm ball oscillating at 3 Hz is not the
           * same hit as a 2.6 cm ball standing still, and pretending otherwise
           * measures the athlete's luck with frame timing rather than their aim.
           */
          shape: "sphere",
          scale: p.scale,
          meta: { urgency: true, hitBoost: Math.min(0.035, ampX * p.freq * 0.05) },
        });
      }
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { perStream: number; lifeMs: number };
    return 1600 + p.perStream * (p.lifeMs * 0.75 + 150) + p.lifeMs + 2000;
  },
};

// ============================== SACCADE-SWIPE ==============================
// CYAN arrow: strike THROUGH it in the arrow's direction (pro-saccade).
// RED arrow: strike in the OPPOSITE direction (anti-saccade).
const DIRS: SliceDirection[] = ["up", "down", "left", "right"];
const OPP: Record<string, SliceDirection> = { up: "down", down: "up", left: "right", right: "left" };

export const SaccadeSwipe: DrillDefinition = {
  id: "saccade-swipe",
  name: "Saccade-Swipe",
  shortName: "Saccade-Swipe",
  phase: "Execute",
  description: "Arrow targets: CYAN = strike through in the arrow's direction (pro-saccade). RED = strike the OPPOSITE way (anti-saccade).",
  purpose: "Pro/anti-saccade control — overriding reflexive orienting.",
  interaction: "touch",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. Hold fixation on the center diamond until a cone target appears left or right.",
    "2. CYAN cone: strike THROUGH it in the direction it points (pro).",
    "3. RED cone: strike through it in the OPPOSITE direction (anti). Fight the reflex.",
    "4. Anti-saccade density rises with level.",
  ],
  controlsHint: "CYAN = WITH THE ARROW - RED = AGAINST IT",
  levels: levels50((i) => ({
    label: `${ilerp50(15, 90, i)}% anti-saccade`,
    parameters: { trials: i < 30 ? 20 : 24, antiRatio: lerp50(0.15, 0.9, i), showMs: ilerp50(1900, 850, i), fixationLoad: true },
  })),
  buildTrials: (params, rng) => {
    const p = params as { trials: number; antiRatio: number; showMs: number };
    const trials: TrialSpec[] = [];
    let t = 1500;
    for (let i = 0; i < p.trials; i++) {
      const dir = pick(rng, DIRS);
      const anti = rng() < p.antiRatio;
      const side = rng() < 0.5 ? -1 : 1;
      trials.push({
        id: `sw-${i}`,
        spawnAt: t,
        duration: p.showMs,
        kind: "go",
        zone: side < 0 ? "left" : "right",
        position: [side * (0.3 + rng() * 0.2), 1.4 + (rng() - 0.5) * 0.3, Z],
        requiredDirection: anti ? OPP[dir] : dir,
        color: anti ? RED : CYAN,
        emissive: anti ? RED : CYAN,
        shape: "cone",
        scale: 0.09,
        label: dir,
        meta: { pointDir: dir },
      });
      t += p.showMs + 500 + rng() * 500;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; showMs: number };
    return 1500 + p.trials * (p.showMs + 750) + 1500;
  },
};
