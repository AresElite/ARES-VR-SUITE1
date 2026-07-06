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
// 6 fixed locations; the active target lights up; strike -> it instantly
// moves to another location. Layout spread per level from GET_LAYOUT (dx/dy).
const RG_LAYOUT: Record<number, { dx: number; dy: number; label: string }> = {
  1: { dx: 0.08, dy: 0.15, label: "Central Cluster" },
  2: { dx: 0.15, dy: 0.25, label: "Moderate Spread" },
  3: { dx: 0.3, dy: 0.25, label: "Wide Horizontal" },
  4: { dx: 0.35, dy: 0.35, label: "Wide H + V" },
  5: { dx: 0.42, dy: 0.42, label: "Full Board" },
};

function rgPositions(level: number): [number, number, number][] {
  const { dx, dy } = RG_LAYOUT[level] ?? RG_LAYOUT[1];
  const X = dx * 1.5; // board fraction -> meters at reach
  const Y = dy * 1.1;
  return [
    [-X, 1.45 + Y, Z],
    [X, 1.45 + Y, Z],
    [-X, 1.45, Z],
    [X, 1.45, Z],
    [-X, 1.45 - Y, Z],
    [X, 1.45 - Y, Z],
  ];
}

export const ReactionGrid: DrillDefinition = {
  id: "reaction-grid",
  name: "Reaction Grid",
  shortName: "Reaction Grid",
  phase: "Execute",
  description: "6 possible target locations. Strike the ACTIVE TARGET as fast as possible — it moves the instant you touch it.",
  purpose: "Rapid foveation, peripheral detection, motor output speed.",
  interaction: "touch",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. 6 possible target locations on the board in front of you.",
    "2. STRIKE the ACTIVE (lit) target as fast as possible.",
    "3. The target moves to a new location the instant you touch it.",
    "4. Keep both hands ready - use whichever hand is closest.",
  ],
  controlsHint: "STRIKE THE LIT TARGET - IT MOVES ON TOUCH",
  levels: levels25((i) => ({
    label: i < 5 ? "Central Cluster" : i < 10 ? "Moderate Spread" : i < 15 ? "Wide Horizontal" : i < 20 ? "Wide H + V" : "Full Board",
    parameters: { level: i + 1, trials: ilerp25(30, 48, i), timeoutMs: ilerp25(1800, 950, i) },
  })),
  buildTrials: (params, rng) => {
    const p = params as { level: number; trials: number; timeoutMs: number };
    const spots = rgPositions(p.level);
    const trials: TrialSpec[] = [];
    let last = -1;
    for (let i = 0; i < p.trials; i++) {
      let idx = Math.floor(rng() * 6);
      if (idx === last) idx = (idx + 1 + Math.floor(rng() * 4)) % 6;
      last = idx;
      trials.push({
        id: `rg-${i}`,
        spawnAt: i === 0 ? 1000 : -1,
        chainId: "rg",
        chainGapMs: 0,
        seq: i,
        duration: p.timeoutMs,
        kind: "go",
        zone: idx % 2 === 0 ? "left" : "right",
        position: spots[idx],
        color: TEAL,
        emissive: TEAL,
        shape: "sphere",
        scale: 0.085,
      });
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; timeoutMs: number };
    return 1000 + p.trials * (p.timeoutMs + 60) + 2000;
  },
};

// =========================== EYE-HAND COORDINATION ===========================
export const EyeHandCoordination: DrillDefinition = {
  id: "eye-hand-coordination",
  name: "Eye-Hand Coordination",
  shortName: "Eye-Hand Coordination",
  phase: "Execute",
  description: "Multiple targets live at once across the board. Clear them as fast as they appear — each strike spawns the next.",
  purpose: "Continuous eye-hand mapping, bimanual coverage, scan-and-strike speed.",
  interaction: "touch",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. Up to three targets are live at the same time across your reach zone.",
    "2. STRIKE any live target - a new one appears somewhere else the moment you do.",
    "3. Use BOTH hands. Left hand covers left field, right hand covers right.",
    "4. Clear as many as you can before the clock runs out.",
  ],
  controlsHint: "CLEAR TARGETS WITH BOTH HANDS - NEW ONES KEEP COMING",
levels: levels25((i) => ({
    label: `${i < 8 ? "Large" : i < 17 ? "Medium" : "Small"} / ${i < 12 ? "Central" : "Wide"} field`,
    parameters: {
      scale: lerp25(0.105, 0.05, i),
      spreadDeg: lerp25(12, 40, i),
      streams: i < 8 ? 2 : 3,
      perStream: ilerp25(12, 20, i),
      timeoutMs: ilerp25(2500, 1400, i),
    },
  })),
  buildTrials: (params, rng) => {
    const p = params as { scale: number; spreadDeg: number; streams: number; perStream: number; timeoutMs: number };
    const trials: TrialSpec[] = [];
    for (let sIdx = 0; sIdx < p.streams; sIdx++) {
      for (let i = 0; i < p.perStream; i++) {
        const zone = pick(rng, PERIPHERAL_ZONES.concat(["center"]) as TargetZone[]);
        trials.push({
          id: `ehc-${sIdx}-${i}`,
          spawnAt: i === 0 ? 1000 + sIdx * 400 : -1,
          chainId: `ehc-${sIdx}`,
          chainGapMs: 80,
          seq: i,
          duration: p.timeoutMs,
          kind: "go",
          zone,
          position: strikePosition(zone, rng() * p.spreadDeg, 0.16, rng),
          color: TEAL,
          emissive: TEAL,
          shape: "sphere",
          scale: p.scale,
        });
      }
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { perStream: number; timeoutMs: number };
    return 1400 + p.perStream * (p.timeoutMs + 80) + 2500;
  },
};

// ============================== RAW-REACTION ==============================
// Exact size ramp from the touchscreen suite; 20 Central + 20 Spatial levels.
const RAW_SIZES = [120, 116, 112, 107, 103, 99, 95, 91, 87, 82, 78, 74, 70, 66, 62, 57, 53, 49, 45, 41];

export const RawReaction: DrillDefinition = {
  id: "raw-reaction",
  name: "Raw-Reaction",
  shortName: "Raw-Reaction",
  phase: "Execute",
  description: "Watch intently. Strike the target the instant it appears. Do not anticipate — react only to visual onset.",
  purpose: "Pure simple reaction time to visual onset.",
  interaction: "touch",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. Watch the board intently. Nothing happens for a random delay.",
    "2. The moment the target appears, STRIKE it with either hand.",
    "3. Do NOT anticipate - striking before onset counts against you.",
    "4. Central levels: the target is always dead ahead. Spatial levels: it can appear anywhere.",
  ],
  controlsHint: "REACT ONLY TO ONSET - STRIKE INSTANTLY",
  levels: levels25((i) => ({
    label: `${i < 12 ? "Central (Focus)" : "Spatial (Scan)"} — ${Math.round(lerp25(120, 41, i))}px`,
    parameters: {
      spatial: i >= 12, trials: 15,
      size: px2scale(lerp25(120, 41, i)),
      minDelay: 500, maxDelay: ilerp25(1000, 3000, i),
      showMs: ilerp25(1500, 800, i),
    },
  })),
  buildTrials: (params, rng) => {
    const p = params as { spatial: boolean; trials: number; size: number; minDelay: number; maxDelay: number; showMs: number };
    const trials: TrialSpec[] = [];
    let t = 1200;
    for (let i = 0; i < p.trials; i++) {
      t += p.minDelay + rng() * (p.maxDelay - p.minDelay);
      const zone = p.spatial ? (pick(rng, PERIPHERAL_ZONES) as TargetZone) : "center";
      trials.push({
        id: `rr-${i}`,
        spawnAt: t,
        duration: p.showMs,
        kind: "go",
        zone,
        position: p.spatial ? strikePosition(zone, 8 + rng() * 24, 0.12, rng) : [0, 1.45, Z],
        color: TEAL,
        emissive: TEAL,
        shape: "sphere",
        scale: p.size,
      });
      t += 350;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; maxDelay: number; showMs: number };
    return 1200 + p.trials * (p.maxDelay + p.showMs + 350) + 1500;
  },
};

// ================================ CHOICE-RT ================================
// TEAL -> strike the LEFT pad. PURPLE -> strike the RIGHT pad.
export const ChoiceRT: DrillDefinition = {
  id: "choice-rt",
  name: "Choice-RT",
  shortName: "Choice-RT",
  phase: "Execute",
  description: "A stimulus flashes: TEAL means LEFT pad, PURPLE means RIGHT pad. Focus levels are central; Scan levels are spatial.",
  purpose: "Choice reaction time — stimulus-response mapping under time pressure.",
  interaction: "touch",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. Two answer pads float at your hands: LEFT and RIGHT.",
    "2. Watch for the stimulus orb.",
    "3. If it is TEAL - strike the LEFT pad. If PURPLE - strike the RIGHT pad.",
    "4. Focus levels show it dead ahead; Scan levels can flash it anywhere.",
  ],
  controlsHint: "TEAL = LEFT PAD - PURPLE = RIGHT PAD",
  levels: levels25((i) => ({
    label: `${i < 12 ? "Central (Focus)" : "Spatial (Scan)"} — ${Math.round(lerp25(150, 45, i))}px`,
    parameters: {
      central: i < 12, trials: 16,
      size: px2scale(lerp25(150, 45, i)),
      minDelay: 500, maxDelay: ilerp25(1000, 2900, i),
    },
  })),
  buildTrials: (params, rng) => {
    const p = params as { central: boolean; trials: number; size: number; minDelay: number; maxDelay: number };
    const trials: TrialSpec[] = [];
    let t = 1200;
    const windowMs = 1900;
    for (let i = 0; i < p.trials; i++) {
      t += p.minDelay + rng() * (p.maxDelay - p.minDelay);
      const isTeal = rng() < 0.5;
      const zone = p.central ? "center" : (pick(rng, PERIPHERAL_ZONES) as TargetZone);
      const groupId = `crt-g${i}`;
      // stimulus (decorative)
      trials.push({
        id: `${groupId}-stim`,
        spawnAt: t,
        duration: windowMs,
        kind: "distractor",
        decor: true,
        zone,
        position: p.central ? [0, 1.55, Z - 0.15] : strikePosition(zone, 10 + rng() * 22, 0.1, rng),
        color: isTeal ? TEAL : PURPLE,
        emissive: isTeal ? TEAL : PURPLE,
        shape: "sphere",
        scale: p.size,
      });
      // answer pads
      trials.push({
        id: `${groupId}-L`,
        spawnAt: t,
        duration: windowMs,
        kind: isTeal ? "go" : "distractor",
        zone: "left",
        position: [-0.42, 1.15, Z],
        color: WHITE,
        shape: "pad",
        scale: 0.075,
        label: "LEFT",
        groupId,
      });
      trials.push({
        id: `${groupId}-R`,
        spawnAt: t,
        duration: windowMs,
        kind: isTeal ? "distractor" : "go",
        zone: "right",
        position: [0.42, 1.15, Z],
        color: WHITE,
        shape: "pad",
        scale: 0.075,
        label: "RIGHT",
        groupId,
      });
      t += windowMs + 250;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; maxDelay: number };
    return 1200 + p.trials * (p.maxDelay + 2150) + 1500;
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
        position: p.spatial ? strikePosition(zone, 8 + rng() * 26, 0.12, rng) : [(rng() - 0.5) * 0.2, 1.45 + (rng() - 0.5) * 0.16, Z],
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
    for (let i = 0; i < p.trials; i++) {
      const r = rng();
      const isNoGo = r < p.noGoProb;
      const isStop = !isNoGo && r < p.noGoProb + p.stopProb;
      const ssd = p.ssd + (rng() - 0.5) * 80;
      trials.push({
        id: `ss-${i}`,
        spawnAt: t,
        duration: p.deadline,
        kind: isNoGo ? "noGo" : "go",
        ...(isStop ? { switchKindAt: t + ssd, switchKindTo: "noGo" as const, switchColor: RED } : {}),
        zone: "center",
        position: [(rng() - 0.5) * 0.5, 1.4 + (rng() - 0.5) * 0.3, Z],
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
