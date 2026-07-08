import type { DrillDefinition, TrialSpec, SliceDirection, TargetZone } from "@/ares/drillTypes";
import { ARES_COLORS } from "@/ares/colors";
import { pick } from "@/utils/rng";
import { strikePosition, PERIPHERAL_ZONES } from "../shared/zones";
import { levels25, lerp25, ilerp25 } from "../shared/levels";

/**
 * EXECUTE — direct ports of the A.R.E.S. Performance Suite drills.
 * Names, progression tables, colors, and rules follow the touchscreen
 * suite's source (drill_logic_export + drill components); "tap" becomes a
 * physical strike with hand/controller in VR.
 */

const TEAL = "#2998AA";
const BLUE = "#3B82F6";
const ORANGE = "#F97316";
const PURPLE = "#8B5CF6";
const CYAN = "#22D3EE";
const WHITE = "#EAF0FF";
const RED = "#EF5A6F";

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
  levels: levels25((i) => ({
    label: i < 5 ? "Central Cluster" : i < 10 ? "Moderate Spread" : i < 15 ? "Wide Horizontal" : i < 20 ? "Wide H + V" : "Full Board",
    parameters: { level: i + 1, timeoutMs: ilerp25(1700, 900, i), scale: lerp25(0.062, 0.044, i) },
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
const EHC_REACH = 0.98; // strike wall sits a full arm's extension out
const EHC_SIZES: Record<string, number> = { xl: 0.115, l: 0.095, m: 0.078, s: 0.062, xs: 0.05 };
const EHC_DIST: Record<string, number> = {
  "60-40": 0.6, "50-50": 0.5, "40-60": 0.4, "30-70": 0.3, "20-80": 0.2, "10-90": 0.1, "0-100": 0,
};

export const EyeHandCoordination: DrillDefinition = {
  id: "eye-hand-coordination",
  name: "Eye-Hand Coordination",
  shortName: "Eye-Hand Coordination",
  phase: "Execute",
  description: "60 seconds. Multiple targets live at once across the strike wall — clear them as they appear; each strike spawns the next. Central/peripheral distribution, stimulus size, and color/hand rules are trainer-selectable.",
  purpose: "Continuous eye-hand mapping, bimanual coverage, scan-and-strike speed.",
  interaction: "touch",
  responseMode: "strike",
  environment: "arena",
  mvp: true,
  hardStop: true,
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
    "1. 60 seconds on the clock. Up to three targets live at once on the strike wall at full arm's reach.",
    "2. STRIKE any live target - a new one appears elsewhere the moment you do.",
    "3. Color rules: PURPLE = RIGHT hand. TEAL = LEFT hand. BLUE = either. Purple-only = any hand.",
    "4. The central/peripheral mix follows the selected distribution.",
    "5. Use BOTH hands - left covers left field, right covers right. Clear as many as you can before time expires.",
  ],
  controlsHint: "60s - CLEAR THE WALL - PURPLE=R TEAL=L BLUE=ANY",
  levels: levels25((i) => ({
    label: `${i < 8 ? 2 : 3} live targets — ${(ilerp25(2500, 1400, i) / 1000).toFixed(1)}s windows`,
    parameters: {
      spreadDeg: lerp25(14, 42, i),
      streams: i < 8 ? 2 : 3,
      timeoutMs: ilerp25(2500, 1400, i),
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
      for (let i = 0; i < perStream; i++) {
        const central = rng() < centralFrac;
        const zone = central ? "center" : (pick(rng, PERIPHERAL_ZONES) as TargetZone);
        const ecc = central ? 2 + rng() * 9 : 16 + rng() * Math.max(10, p.spreadDeg - 16);
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
  levels: levels25((i) => ({
    label: `${(lerp25(6, 13, i)).toFixed(1)} m/s launches, delays up to ${(ilerp25(1400, 3200, i) / 1000).toFixed(1)}s`,
    parameters: {
      trials: 25,
      speed: lerp25(6, 13, i),
      minDelay: 600,
      maxDelay: ilerp25(1400, 3200, i),
      size: lerp25(0.09, 0.055, i),
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
  levels: levels25((i) => ({
    label: `${(lerp25(5.5, 12, i)).toFixed(1)} m/s launches, delays up to ${(ilerp25(1500, 3200, i) / 1000).toFixed(1)}s`,
    parameters: {
      trials: 50,
      speed: lerp25(5.5, 12, i),
      minDelay: 600,
      maxDelay: ilerp25(1500, 3200, i),
      size: lerp25(0.09, 0.055, i),
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
// GO: Teal / Blue / Orange. NO-GO: Purple. Elite band: White becomes NO-GO.
export const GoNoGo: DrillDefinition = {
  id: "go-no-go",
  name: "Go/No Go",
  shortName: "Go/No Go",
  phase: "Execute",
  description: "GO COLORS (teal, blue, orange): strike fast. NO-GO (purple): do not strike. Central fixation or spatial scan by level.",
  purpose: "Selective response inhibition and processing speed.",
  interaction: "touch",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. GO COLORS: strike TEAL, BLUE, and ORANGE targets immediately.",
    "2. NO-GO: DO NOT strike PURPLE targets. Freeze the hand.",
    "3. Elite levels flip the trap: WHITE becomes the no-go color.",
    "4. Maintain central fixation on Focus levels; scan the field on Spatial levels.",
  ],
  controlsHint: "STRIKE TEAL/BLUE/ORANGE - NEVER PURPLE",
  levels: levels25((i) => ({
    label: i < 8 ? "Central" : i < 17 ? "Spatial" : "Elite (white no-go)",
    parameters: {
      trials: 24, elite: i >= 17, spatial: i >= 8,
      size: px2scale(lerp25(80, 30, i)),
      showMs: ilerp25(1400, 750, i),
      isiMin: 450, isiMax: ilerp25(1200, 800, i),
    },
  })),
  buildTrials: (params, rng) => {
    const p = params as { trials: number; elite: boolean; spatial: boolean; size: number; showMs: number; isiMin: number; isiMax: number };
    const goColors = p.elite ? [CYAN, BLUE, ORANGE] : [TEAL, BLUE, ORANGE];
    const noGoColor = p.elite ? WHITE : PURPLE;
    const trials: TrialSpec[] = [];
    let t = 1200;
    for (let i = 0; i < p.trials; i++) {
      const isNoGo = rng() < 0.3;
      const zone = p.spatial ? (pick(rng, PERIPHERAL_ZONES) as TargetZone) : "center";
      trials.push({
        id: `gng-${i}`,
        spawnAt: t,
        duration: p.showMs,
        kind: isNoGo ? "noGo" : "go",
        zone,
        // full strike distance — targets sit at arm's length, never in the face
        position: p.spatial ? strikePosition(zone, 8 + rng() * 26, 0.12, rng, 0.92) : [(rng() - 0.5) * 0.55, 1.34 + (rng() - 0.5) * 0.34, -0.88],
        color: isNoGo ? noGoColor : pick(rng, goColors),
        emissive: isNoGo ? noGoColor : undefined,
        shape: "sphere",
        scale: p.size,
      });
      trials[trials.length - 1].emissive = trials[trials.length - 1].color;
      t += p.showMs + p.isiMin + rng() * (p.isiMax - p.isiMin);
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; showMs: number; isiMin: number; isiMax: number };
    return 1200 + p.trials * (p.showMs + (p.isiMin + p.isiMax) / 2) + 1500;
  },
};

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
  levels: levels25((i) => ({
    label: `SSD ~${ilerp25(200, 560, i)}ms`,
    parameters: {
      trials: 24, ssd: ilerp25(200, 560, i),
      deadline: ilerp25(2000, 1400, i),
      stopProb: 0.25, noGoProb: 0.15,
      size: px2scale(lerp25(64, 34, i)),
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
        shape: isNoGo ? "ring" : "sphere",
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
  description: "Drifting targets shift color to signal urgency: Purple → Teal → Blue → Orange → Red. Never let a red one expire.",
  purpose: "Sustained attention, target triage, and clearing under pressure.",
  interaction: "touch",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. Targets drift across your reach zone and ramp through urgency colors:",
    "2. PURPLE (new) - TEAL - BLUE - ORANGE - RED (about to expire).",
    "3. Strike them before they reach RED. A red expiry is the failure condition.",
    "4. Triage: always clear the most urgent colors first.",
  ],
  controlsHint: "CLEAR TARGETS BEFORE THEY TURN RED",
levels: levels25((i) => ({
    label: `${i < 8 ? 2 : i < 17 ? 3 : 4} live — ${(lerp25(4.4, 2.2, i)).toFixed(1)}s decay`,
    parameters: {
      streams: i < 8 ? 2 : i < 17 ? 3 : 4,
      perStream: ilerp25(12, 16, i),
      lifeMs: ilerp25(4400, 2200, i),
      drift: lerp25(0.08, 0.3, i),
      scale: lerp25(0.09, 0.055, i),
    },
  })),
  buildTrials: (params, rng) => {
    const p = params as { streams: number; perStream: number; lifeMs: number; drift: number; scale: number };
    const trials: TrialSpec[] = [];
    for (let sIdx = 0; sIdx < p.streams; sIdx++) {
      for (let i = 0; i < p.perStream; i++) {
        const zone = pick(rng, PERIPHERAL_ZONES.concat(["center"]) as TargetZone[]);
        trials.push({
          id: `ff-${sIdx}-${i}`,
          spawnAt: i === 0 ? 1000 + sIdx * 600 : -1,
          chainId: `ff-${sIdx}`,
          chainGapMs: 150,
          seq: i,
          duration: p.lifeMs,
          kind: "go",
          zone,
          position: strikePosition(zone, 6 + rng() * 26, 0.14, rng),
          velocity: [(rng() - 0.5) * 2 * p.drift, (rng() - 0.5) * 2 * p.drift * 0.6, 0],
          color: PURPLE,
          emissive: PURPLE,
          shape: "sphere",
          scale: p.scale,
          meta: { urgency: true },
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
  levels: levels25((i) => ({
    label: `${ilerp25(15, 85, i)}% anti-saccade`,
    parameters: { trials: 20, antiRatio: lerp25(0.15, 0.85, i), showMs: ilerp25(1900, 900, i), fixationLoad: true },
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
