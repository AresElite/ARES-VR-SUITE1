import type { DrillDefinition, TrialSpec } from "@/ares/drillTypes";
import { pick, range } from "@/utils/rng";
import { levels25, lerp25, ilerp25 } from "../shared/levels";

/**
 * ROUTE — direct ports of the A.R.E.S. Performance Suite cognitive drills.
 * Responses are physical: YES/NO pads, side pads, grid cells — all struck
 * with the hands. Exact names and rules from the touchscreen suite.
 */

const TEAL = "#2998AA";
const PURPLE = "#8B5CF6";
const GOLD = "#F5B648";
const GREEN = "#22C55E";
const RED = "#EF5A6F";
const WHITE = "#EAF0FF";
const GRAY = "#38406B";
const Z = -0.62;

const YES_POS: [number, number, number] = [0.42, 1.12, Z];
const NO_POS: [number, number, number] = [-0.42, 1.12, Z];

// ============================ STERNBERG (family) ============================
// Memorize a set; after retention, a probe appears.
// RIGHT pad = YES (probe was in set). LEFT pad = NO.
function buildSternberg(
  items: string[],
  colorItems: boolean,
  p: { trials: number; setSize: number; memorizeMs: number; retentionMs: number; probeMs: number },
  rng: () => number,
  idp: string,
): TrialSpec[] {
  const trials: TrialSpec[] = [];
  let t = 1500;
  const palette = [TEAL, PURPLE, GOLD, GREEN, RED, WHITE];
  for (let i = 0; i < p.trials; i++) {
    const groupId = `${idp}-g${i}`;
    const shuffled = [...items].sort(() => rng() - 0.5);
    const set = shuffled.slice(0, p.setSize);
    const inSet = rng() < 0.5;
    const probe = inSet ? pick(rng, set) : shuffled[p.setSize];
    // memorize display (row of items)
    set.forEach((item, k) => {
      trials.push({
        id: `${groupId}-m${k}`, spawnAt: t, duration: p.memorizeMs, kind: "distractor", decor: true,
        zone: "center", position: [(k - (set.length - 1) / 2) * 0.16, 1.55, Z - 0.08],
        color: colorItems ? item : WHITE, emissive: colorItems ? item : undefined,
        shape: colorItems ? "sphere" : "diamond", scale: colorItems ? 0.05 : 0.028,
        label: colorItems ? undefined : item,
      });
    });
    // probe + pads after retention
    const probeAt = t + p.memorizeMs + p.retentionMs;
    trials.push({
      id: `${groupId}-probe`, spawnAt: probeAt, duration: p.probeMs, kind: "distractor", decor: true,
      zone: "center", position: [0, 1.55, Z - 0.08],
      color: colorItems ? probe : WHITE, emissive: colorItems ? probe : undefined,
      shape: colorItems ? "sphere" : "diamond", scale: colorItems ? 0.065 : 0.04,
      label: colorItems ? undefined : probe,
    });
    trials.push({
      id: `${groupId}-yes`, spawnAt: probeAt, duration: p.probeMs, kind: inSet ? "go" : "distractor",
      zone: "right", position: YES_POS, color: GREEN, shape: "pad", scale: 0.07, label: "YES", groupId,
    });
    trials.push({
      id: `${groupId}-no`, spawnAt: probeAt, duration: p.probeMs, kind: inSet ? "distractor" : "go",
      zone: "left", position: NO_POS, color: RED, shape: "pad", scale: 0.07, label: "NO", groupId,
    });
    t = probeAt + p.probeMs + 800;
  }
  return trials;
}

function sternbergLevels() {
  return levels25((i) => ({
    label: `set of ${2 + Math.floor(i / 5)}, ${ilerp25(2800, 1200, i)}ms study`,
    parameters: {
      trials: 10, setSize: 2 + Math.floor(i / 5),
      memorizeMs: ilerp25(2800, 1200, i),
      retentionMs: ilerp25(800, 2600, i),
      probeMs: ilerp25(2600, 1500, i),
    },
  }));
}
const sternbergDuration = (params: Record<string, unknown>) => {
  const p = params as { trials: number; memorizeMs: number; retentionMs: number; probeMs: number };
  return 1500 + p.trials * (p.memorizeMs + p.retentionMs + p.probeMs + 800) + 1500;
};
const STERNBERG_INSTRUCTIONS = (what: string) => [
  `1. Memorize the set of ${what} shown ahead.`,
  "2. Wait through the blank retention interval - hold the set in mind.",
  `3. A single probe ${what.replace(/s$/, "")} appears.`,
  "4. Strike the RIGHT pad (YES) if it WAS in the set.",
  "5. Strike the LEFT pad (NO) if it was NOT.",
];

export const Sternberg: DrillDefinition = {
  id: "sternberg",
  name: "Sternberg",
  shortName: "Sternberg",
  phase: "Route",
  description: "Memorize a set of colors. After the retention interval a probe color appears: RIGHT pad = YES it was in the set, LEFT pad = NO.",
  purpose: "Working-memory scanning (colors).",
  interaction: "touch", environment: "arena", mvp: true,
  instructions: STERNBERG_INSTRUCTIONS("colors"),
  controlsHint: "RIGHT PAD = YES IN SET - LEFT PAD = NO",
  levels: sternbergLevels(),
  buildTrials: (params, rng) =>
    buildSternberg([TEAL, PURPLE, GOLD, GREEN, RED, WHITE, "#3B82F6", "#F97316"], true, params as never, rng, "stc"),
  durationMs: sternbergDuration,
};

export const SternbergDigits: DrillDefinition = {
  ...Sternberg,
  id: "sternberg-digits",
  name: "Sternberg-Digits",
  shortName: "Sternberg-Digits",
  description: "Memorize a set of digits. After retention, a probe digit appears: RIGHT pad = YES in set, LEFT pad = NO.",
  purpose: "Working-memory scanning (digits).",
  instructions: STERNBERG_INSTRUCTIONS("digits"),
  buildTrials: (params, rng) => buildSternberg("0123456789".split(""), false, params as never, rng, "std"),
};

export const SternbergLetters: DrillDefinition = {
  ...Sternberg,
  id: "sternberg-letters",
  name: "Sternberg-Letters",
  shortName: "Sternberg-Letters",
  description: "Memorize a set of letters. After retention, a probe letter appears: RIGHT pad = YES in set, LEFT pad = NO.",
  purpose: "Working-memory scanning (letters).",
  instructions: STERNBERG_INSTRUCTIONS("letters"),
  buildTrials: (params, rng) => buildSternberg("BCDFGHJKLMNPQRSTVXZ".split(""), false, params as never, rng, "stl"),
};

// ========================== FLANKER COMPATIBILITY ==========================
// Identify the CENTRAL arrow in a row of 5; ignore the flankers.
// Strike the pad on the side the CENTER arrow points to.
export const FlankerCompatibility: DrillDefinition = {
  id: "flanker",
  name: "Flanker Compatibility",
  shortName: "Flanker",
  phase: "Route",
  description: "A row of five arrows appears. Respond ONLY to the CENTER arrow — strike the pad on the side it points to. Flankers lie.",
  purpose: "Selective attention and conflict resolution.",
  interaction: "touch", environment: "arena", mvp: true,
  instructions: [
    "1. A row of five arrows appears (for example  < < > < < ).",
    "2. Only the CENTER arrow matters. Ignore the flankers.",
    "3. Center points RIGHT - strike the RIGHT pad. LEFT - strike the LEFT pad.",
    "4. Incompatible rows (flankers pointing the other way) are the test. Stay on the center.",
  ],
  controlsHint: "ANSWER THE CENTER ARROW ONLY",
  levels: levels25((i) => ({
    label: `${ilerp25(50, 90, i)}% incompatible, ${ilerp25(2200, 1100, i)}ms`,
    parameters: { trials: 16, incompatibleRatio: lerp25(0.5, 0.9, i), windowMs: ilerp25(2200, 1100, i) },
  })),
  buildTrials: (params, rng) => {
    const p = params as { trials: number; incompatibleRatio: number; windowMs: number };
    const trials: TrialSpec[] = [];
    let t = 1500;
    for (let i = 0; i < p.trials; i++) {
      const groupId = `flk-g${i}`;
      const centerRight = rng() < 0.5;
      const incompatible = rng() < p.incompatibleRatio;
      const c = centerRight ? ">" : "<";
      const f = incompatible ? (centerRight ? "<" : ">") : c;
      trials.push({
        id: `${groupId}-row`, spawnAt: t, duration: p.windowMs, kind: "distractor", decor: true,
        zone: "center", position: [0, 1.55, Z - 0.08], color: WHITE, shape: "diamond", scale: 0.001,
        label: `${f} ${f} ${c} ${f} ${f}`,
      });
      trials.push({
        id: `${groupId}-L`, spawnAt: t, duration: p.windowMs, kind: centerRight ? "distractor" : "go",
        zone: "left", position: NO_POS, color: WHITE, shape: "pad", scale: 0.07, label: "LEFT", groupId,
      });
      trials.push({
        id: `${groupId}-R`, spawnAt: t, duration: p.windowMs, kind: centerRight ? "go" : "distractor",
        zone: "right", position: YES_POS, color: WHITE, shape: "pad", scale: 0.07, label: "RIGHT", groupId,
      });
      t += p.windowMs + 700;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; windowMs: number };
    return 1500 + p.trials * (p.windowMs + 700) + 1500;
  },
};

// ================================== STROOP ==================================
// A color word is shown in a mismatching ink. Strike the pad matching the
// INK color (the physical property), not the word.
const STROOP_COLORS: { name: string; hex: string }[] = [
  { name: "RED", hex: RED },
  { name: "GREEN", hex: GREEN },
  { name: "GOLD", hex: GOLD },
  { name: "TEAL", hex: TEAL },
];

export const Stroop: DrillDefinition = {
  id: "stroop",
  name: "Stroop",
  shortName: "Stroop",
  phase: "Route",
  description: "A color word appears in mismatched ink. Answer the INK — the physical property — never the word. Strike the matching color pad.",
  purpose: "Interference control — physical property over semantic meaning.",
  interaction: "touch", environment: "arena", mvp: true,
  instructions: [
    "1. A word appears ahead - for example the word GREEN written in RED ink.",
    "2. Identify the INK COLOR. IGNORE what the word says.",
    "3. Strike the color pad that matches the INK.",
    "4. Respond as fast as possible without sacrificing accuracy.",
  ],
  controlsHint: "ANSWER THE INK COLOR - IGNORE THE WORD",
  levels: levels25((i) => ({
    label: `${ilerp25(2300, 1150, i)}ms window`,
    parameters: { trials: 16, windowMs: ilerp25(2300, 1150, i), congruentRatio: lerp25(0.45, 0.08, i) },
  })),
  buildTrials: (params, rng) => {
    const p = params as { trials: number; windowMs: number; congruentRatio: number };
    const trials: TrialSpec[] = [];
    let t = 1500;
    for (let i = 0; i < p.trials; i++) {
      const groupId = `str-g${i}`;
      const ink = STROOP_COLORS[Math.floor(rng() * STROOP_COLORS.length)];
      const congruent = rng() < p.congruentRatio;
      const word = congruent ? ink : STROOP_COLORS[(STROOP_COLORS.indexOf(ink) + 1 + Math.floor(rng() * 2)) % STROOP_COLORS.length];
      trials.push({
        id: `${groupId}-w`, spawnAt: t, duration: p.windowMs, kind: "distractor", decor: true,
        zone: "center", position: [0, 1.58, Z - 0.08], color: ink.hex, shape: "diamond", scale: 0.001, label: word.name,
      });
      STROOP_COLORS.forEach((c, k) => {
        trials.push({
          id: `${groupId}-p${k}`, spawnAt: t, duration: p.windowMs,
          kind: c.name === ink.name ? "go" : "distractor",
          zone: k < 2 ? "left" : "right",
          position: [-0.51 + k * 0.34, 1.12, Z], color: c.hex, emissive: c.hex, shape: "pad", scale: 0.06, groupId,
        });
      });
      t += p.windowMs + 700;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; windowMs: number };
    return 1500 + p.trials * (p.windowMs + 700) + 1500;
  },
};

// ============================== PATTERN-MEMORY ==============================
// Exact base level from the suite: grid 3, pattern 2, display 3000ms.
export const PatternMemory: DrillDefinition = {
  id: "pattern-memory",
  name: "Pattern-Memory",
  shortName: "Pattern-Memory",
  phase: "Route",
  description: "Memorize the lit pattern on the grid. When it disappears, re-create it by striking exactly those cells.",
  purpose: "Visuospatial pattern memory and recall.",
  interaction: "touch", environment: "arena", mvp: true,
  instructions: [
    "1. A pattern of GOLD cells lights up on the grid. Memorize it.",
    "2. The pattern disappears. Hold the image in your mind.",
    "3. When the full grid returns, strike EXACTLY the cells that were lit.",
    "4. The round completes when you have found them all - wrong cells count against you.",
  ],
  controlsHint: "REBUILD THE PATTERN - STRIKE THE REMEMBERED CELLS",
  levels: levels25((i) => {
    const grid = i < 8 ? 3 : i < 17 ? 4 : 5;
    return {
      label: `${grid}×${grid} grid, ${Math.min(2 + Math.floor(i / 3), 8)} cells`,
      parameters: {
        rounds: 6, gridSize: grid, patternLength: Math.min(2 + Math.floor(i / 3), 8),
        displayMs: ilerp25(3000, 1300, i), delayMs: ilerp25(100, 1600, i), recallMs: ilerp25(4400, 2800, i),
      },
    };
  }),
  buildTrials: (params, rng) => {
    const p = params as { rounds: number; gridSize: number; patternLength: number; displayMs: number; delayMs: number; recallMs: number };
    const trials: TrialSpec[] = [];
    const n = p.gridSize * p.gridSize;
    const cell = Math.min(0.19, 0.66 / p.gridSize);
    const origin = -((p.gridSize - 1) * cell) / 2;
    const posOf = (idx: number): [number, number, number] => [
      origin + (idx % p.gridSize) * cell,
      1.5 - 0.34 + Math.floor(idx / p.gridSize) * cell * 0.85,
      Z,
    ];
    let t = 1500;
    for (let r = 0; r < p.rounds; r++) {
      const groupId = `pm-g${r}`;
      const cells = range(n).sort(() => rng() - 0.5).slice(0, p.patternLength);
      // display phase (decor)
      cells.forEach((idx, k) => {
        trials.push({
          id: `${groupId}-d${k}`, spawnAt: t, duration: p.displayMs, kind: "distractor", decor: true,
          zone: "center", position: posOf(idx), color: GOLD, emissive: GOLD, shape: "box", scale: cell * 0.34,
        });
      });
      // recall phase: full grid, groupMode 'all'
      const recallAt = t + p.displayMs + p.delayMs;
      for (let idx = 0; idx < n; idx++) {
        trials.push({
          id: `${groupId}-c${idx}`, spawnAt: recallAt, duration: p.recallMs,
          kind: cells.includes(idx) ? "go" : "distractor",
          zone: "center", position: posOf(idx), color: PURPLE, emissive: "#2D234F", shape: "box",
          scale: cell * 0.34, groupId, groupMode: "all",
        });
      }
      t = recallAt + p.recallMs + 900;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { rounds: number; displayMs: number; delayMs: number; recallMs: number };
    return 1500 + p.rounds * (p.displayMs + p.delayMs + p.recallMs + 900) + 1500;
  },
};

// =============================== RANDOM-NUMBER ===============================
// Digits scattered across the field — strike them in ascending order.
export const RandomNumber: DrillDefinition = {
  id: "random-number",
  name: "Random-Number",
  shortName: "Random-Number",
  phase: "Route",
  description: "Numbers are scattered randomly across the field. Strike them in ascending order as fast as possible.",
  purpose: "Ordered visual search with number processing under time pressure.",
  interaction: "touch", environment: "arena", mvp: true,
  instructions: [
    "1. Numbers are scattered randomly across your reach zone.",
    "2. Strike them in ASCENDING order (smallest first).",
    "3. Wrong-order strikes count against you but the round continues.",
    "4. Numbers get denser and time gets shorter as you level.",
  ],
  controlsHint: "STRIKE THE NUMBERS SMALLEST TO LARGEST",
  levels: levels25((i) => ({
    label: `${5 + Math.floor(i / 4)} numbers`,
    parameters: { rounds: 5, count: 5 + Math.floor(i / 4), perNumberMs: ilerp25(2500, 1300, i) },
  })),
  buildTrials: (params, rng) => {
    const p = params as { rounds: number; count: number; perNumberMs: number };
    const trials: TrialSpec[] = [];
    let t = 1500;
    for (let r = 0; r < p.rounds; r++) {
      const groupId = `rn-g${r}`;
      const values = new Set<number>();
      while (values.size < p.count) values.add(1 + Math.floor(rng() * 89));
      const sorted = [...values].sort((a, b) => a - b);
      const roundMs = p.count * p.perNumberMs;
      const placed: [number, number][] = [];
      const scatter = (): [number, number] => {
        for (let a = 0; a < 30; a++) {
          const px = (rng() - 0.5) * 1.1;
          const py = 1.12 + rng() * 0.68;
          if (placed.every(([qx, qy]) => Math.hypot(px - qx, py - qy) >= 0.17)) {
            placed.push([px, py]);
            return [px, py];
          }
        }
        const fx = (rng() - 0.5) * 1.1;
        const fy = 1.12 + rng() * 0.68;
        placed.push([fx, fy]);
        return [fx, fy];
      };
      sorted.forEach((v, k) => {
        const [px, py] = scatter();
        trials.push({
          id: `${groupId}-${k}`, spawnAt: t, duration: roundMs, kind: "go",
          zone: "center",
          position: [px, py, Z],
          color: GRAY, emissive: TEAL, shape: "pad", scale: 0.055,
          label: String(v), groupId, groupMode: "ordered", seq: k,
        });
      });
      t += roundMs + 1200;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { rounds: number; count: number; perNumberMs: number };
    return 1500 + p.rounds * (p.count * p.perNumberMs + 1200) + 1500;
  },
};

// ======================== MULTIPLE OBJECT TRACKING ========================
// Exact L1 seed from the suite: 4 balls, track 1, highlight 2200ms, 12s track.
export const MultipleObjectTracking: DrillDefinition = {
  id: "mot",
  name: "Multiple Object Tracking",
  shortName: "MOT",
  phase: "Route",
  description: "Memorize the highlighted orbs, track them through the swarm, and strike all of them when the answer window opens.",
  purpose: "Sustained multifocal attention on moving targets.",
  interaction: "touch", environment: "arena", mvp: true,
  instructions: [
    "1. Some orbs flash GOLD at the start - memorize which ones.",
    "2. All orbs turn identical and swirl around each other. TRACK your targets.",
    "3. When the orbs turn purple, the answer window is open.",
    "4. Strike every orb you were tracking. 3 rounds per session.",
  ],
  controlsHint: "TRACK THE FLASHED ORBS - STRIKE THEM AT THE END",
  levels: levels25((i) => ({
    label: `track ${1 + Math.floor(i / 7)} of ${4 + Math.floor(i / 4)}`,
    parameters: {
      rounds: 1 + Math.floor(i / 7) <= 2 ? 5 : 3,
      balls: 4 + Math.floor(i / 4), track: 1 + Math.floor(i / 7),
      highlightMs: 2200, trackMs: ilerp25(12000, 6500, i), answerMs: 4200,
      speed: lerp25(0.35, 0.95, i),
    },
  })),
  buildTrials: (params, rng) => {
    const p = params as { rounds: number; balls: number; track: number; highlightMs: number; trackMs: number; answerMs: number; speed: number };
    const trials: TrialSpec[] = [];
    let t = 1500;
    for (let r = 0; r < p.rounds; r++) {
      const groupId = `mot-g${r}`;
      const tracked = new Set(range(p.balls).sort(() => rng() - 0.5).slice(0, p.track));
      const total = p.highlightMs + p.trackMs + p.answerMs;
      for (let b = 0; b < p.balls; b++) {
        const phase = rng() * Math.PI * 2;
        const isTracked = tracked.has(b);
        trials.push({
          id: `${groupId}-b${b}`, spawnAt: t, duration: total,
          kind: "distractor",
          ...(isTracked
            ? { switchKindAt: t + p.highlightMs + p.trackMs, switchKindTo: "go" as const }
            : {}),
          zone: "center",
          position: [Math.sin(phase) * 0.42, 1.42, Z],
          lane: {
            radius: 0.42,
            angularSpeed: (b % 2 === 0 ? 1 : -1) * p.speed * (0.8 + rng() * 0.5),
            phase,
            y: 1.2 + rng() * 0.5,
          },
          color: isTracked ? GOLD : TEAL,
          emissive: isTracked ? GOLD : TEAL,
          shape: "sphere", scale: 0.06, groupId, groupMode: "all",
          meta: {
            paintPhases: isTracked
              ? [{ t: 0, c: GOLD }, { t: p.highlightMs, c: TEAL }, { t: p.highlightMs + p.trackMs, c: PURPLE }]
              : [{ t: 0, c: TEAL }, { t: p.highlightMs + p.trackMs, c: PURPLE }],
          },
        });
      }
      t += total + 1200;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { rounds: number; highlightMs: number; trackMs: number; answerMs: number };
    return 1500 + p.rounds * (p.highlightMs + p.trackMs + p.answerMs + 1200) + 1500;
  },
};
