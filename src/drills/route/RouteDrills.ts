import type { DrillDefinition, TrialSpec } from "@/ares/drillTypes";
import { pick, range } from "@/utils/rng";
import { levels25, lerp25, ilerp25, levels50, lerp50, ilerp50 } from "../shared/levels";

/**
 * ROUTE — direct ports of the A.R.E.S. Performance Suite cognitive drills.
 * Responses are physical: YES/NO pads, side pads, grid cells — all struck
 * with the hands. Exact names and rules from the touchscreen suite.
 */

const TEAL = "#2998AA";
const PURPLE = "#8B5CF6";
const GOLD = "#C4B5FD";
const GREEN = "#2998AA";
const RED = "#4C1D95";
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
  // balanced YES/NO deck so left/right trigger loads stay even
  const deck = Array.from({ length: p.trials }, (_, k) => k % 2 === 0);
  for (let k = deck.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [deck[k], deck[j]] = [deck[j], deck[k]];
  }
  for (let i = 0; i < p.trials; i++) {
    const groupId = `${idp}-g${i}`;
    const shuffled = [...items].sort(() => rng() - 0.5);
    const set = shuffled.slice(0, p.setSize);
    const inSet = deck[i];
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
    // probe IS the response target — RIGHT trigger = YES (in set), LEFT = NO
    const probeAt = t + p.memorizeMs + p.retentionMs;
    trials.push({
      id: `${groupId}-probe`, spawnAt: probeAt, duration: p.probeMs, kind: "go",
      requiredHand: inSet ? "right" : "left",
      zone: "center", position: [0, 1.55, Z - 0.08],
      color: colorItems ? probe : WHITE, emissive: colorItems ? probe : undefined,
      shape: colorItems ? "sphere" : "diamond", scale: colorItems ? 0.065 : 0.04,
      label: colorItems ? undefined : probe,
    });
    t = probeAt + p.probeMs + 800;
  }
  return trials;
}

const STERNBERG_SPECTRUM = [
  "#EF4444", "#F97316", "#F5B648", "#22C55E", "#14B8A6", "#2998AA",
  "#3B82F6", "#6366F1", "#8B5CF6", "#D946EF", "#EC4899", "#EAF0FF",
  "#7FD3DE", "#C4B5FD",
];

function sternbergLevels() {
  return levels50((i) => ({
    label: `set of ${2 + Math.floor(i / 6)}, ${ilerp50(2800, 1050, i)}ms study`,
    parameters: {
      trials: 14, setSize: Math.min(7, 2 + Math.floor(i / 6)), // max 7 balls on screen
      memorizeMs: ilerp50(2800, 1050, i),
      retentionMs: ilerp50(800, 3200, i),
      probeMs: ilerp50(2600, 1350, i),
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
  "4. RIGHT-hand TRIGGER = YES (it WAS in the set).",
  "5. LEFT-hand TRIGGER = NO (it was NOT in the set).",
];

export const Sternberg: DrillDefinition = {
  id: "sternberg",
  name: "Sternberg",
  shortName: "Sternberg",
  phase: "Route",
  description: "Memorize a set of colors. After the retention interval a probe color appears: RIGHT pad = YES it was in the set, LEFT pad = NO.",
  purpose: "Working-memory scanning (colors).",
  interaction: "touch", responseMode: "trigger", environment: "arena", mvp: true,
  instructions: STERNBERG_INSTRUCTIONS("colors"),
  controlsHint: "RIGHT TRIGGER = YES IN SET - LEFT TRIGGER = NO",
  levels: sternbergLevels(),
  // full spectrum here (the purple/teal UI restriction is for menus, not this
  // memory drill) — a rich, distinct color set so recall is genuinely tested
  buildTrials: (params, rng) =>
    buildSternberg(STERNBERG_SPECTRUM, true, params as never, rng, "stc"),
  durationMs: sternbergDuration,
};

export const SternbergDigits: DrillDefinition = {
  ...Sternberg,
  id: "sternberg-digits",
  name: "Sternberg-Digits",
  shortName: "Sternberg-Digits",
  description: "Memorize a set of digits. After retention, a probe digit appears: RIGHT trigger = YES in set, LEFT trigger = NO.",
  purpose: "Working-memory scanning (digits).",
  instructions: STERNBERG_INSTRUCTIONS("digits"),
  buildTrials: (params, rng) => buildSternberg("0123456789".split(""), false, params as never, rng, "std"),
};

export const SternbergLetters: DrillDefinition = {
  ...Sternberg,
  id: "sternberg-letters",
  name: "Sternberg-Letters",
  shortName: "Sternberg-Letters",
  description: "Memorize a set of letters. After retention, a probe letter appears: RIGHT trigger = YES in set, LEFT trigger = NO.",
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
  responseMode: "trigger",
  description: "A row of five arrows appears. Respond ONLY to the CENTER arrow — strike the pad on the side it points to. Flankers lie.",
  purpose: "Selective attention and conflict resolution.",
  interaction: "touch", environment: "arena", mvp: true,
  instructions: [
    "1. A row of five arrows appears (for example  < < > < < ).",
    "2. Only the CENTER arrow matters. Ignore the flankers.",
    "3. Center points RIGHT - pull the RIGHT-hand TRIGGER. Points LEFT - LEFT-hand TRIGGER.",
    "4. Incompatible rows (flankers pointing the other way) are the test. Stay on the center.",
  ],
  controlsHint: "CENTER ARROW: RIGHT TRIGGER = >  /  LEFT TRIGGER = <",
  levels: levels50((i) => ({
    label: `${ilerp50(50, 95, i)}% incompatible, ${ilerp50(2200, 950, i)}ms`,
    parameters: { trials: i < 30 ? 16 : 20, incompatibleRatio: lerp50(0.5, 0.95, i), windowMs: ilerp50(2200, 950, i) },
  })),
  buildTrials: (params, rng) => {
    const p = params as { trials: number; incompatibleRatio: number; windowMs: number };
    const trials: TrialSpec[] = [];
    let t = 1500;
    const rdeck = Array.from({ length: p.trials }, (_, k) => k % 2 === 0);
    for (let k = rdeck.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [rdeck[k], rdeck[j]] = [rdeck[j], rdeck[k]];
    }
    for (let i = 0; i < p.trials; i++) {
      const groupId = `flk-g${i}`;
      const centerRight = rdeck[i];
      const incompatible = rng() < p.incompatibleRatio;
      const c = centerRight ? ">" : "<";
      const f = incompatible ? (centerRight ? "<" : ">") : c;
      // the arrow row IS the response target — RIGHT trigger = >, LEFT = <
      trials.push({
        id: `${groupId}-row`, spawnAt: t, duration: p.windowMs, kind: "go",
        requiredHand: centerRight ? "right" : "left",
        zone: "center", position: [0, 1.55, Z - 0.08], color: WHITE, shape: "diamond", scale: 0.001,
        label: `${f} ${f} ${c} ${f} ${f}`,
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
// A color word is shown in colored ink. RIGHT trigger = word meaning matches
// INK color (the physical property), not the word.
const STROOP_COLORS: { name: string; hex: string }[] = [
  { name: "RED", hex: RED },
  { name: "GREEN", hex: GREEN },
  { name: "GOLD", hex: GOLD },
  { name: "TEAL", hex: TEAL },
];

export const Stroop: DrillDefinition = {
  id: "stroop",
  responseMode: "trigger",
  name: "Stroop",
  shortName: "Stroop",
  phase: "Route",
  description: "A color word appears in colored ink. Judge whether the word MEANING matches the INK color: RIGHT trigger = YES (they match), LEFT trigger = NO (mismatch).",
  purpose: "Interference control — physical property over semantic meaning.",
  interaction: "touch", environment: "arena", mvp: true,
  instructions: [
    "1. A color word appears in colored ink - e.g. the word GREEN written in TEAL ink.",
    "2. Does the WORD'S MEANING match its INK color?",
    "3. MATCH (e.g. GREEN in green ink) - pull the RIGHT-hand TRIGGER (YES).",
    "4. MISMATCH (e.g. GREEN in teal ink) - pull the LEFT-hand TRIGGER (NO).",
    "5. Respond fast - resist reading the word instead of judging the ink.",
  ],
  controlsHint: "MATCH? RIGHT TRIGGER = YES  /  LEFT TRIGGER = NO",
  levels: levels50((i) => ({
    label: `${ilerp50(2300, 1000, i)}ms window`,
    parameters: { trials: i < 30 ? 16 : 20, windowMs: ilerp50(2300, 1000, i), congruentRatio: 0.5 },
  })),
  buildTrials: (params, rng) => {
    const p = params as { trials: number; windowMs: number; congruentRatio: number };
    const trials: TrialSpec[] = [];
    let t = 1500;
    const cdeck = Array.from({ length: p.trials }, (_, k) => k % 2 === 0);
    for (let k = cdeck.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [cdeck[k], cdeck[j]] = [cdeck[j], cdeck[k]];
    }
    for (let i = 0; i < p.trials; i++) {
      const groupId = `str-g${i}`;
      const ink = STROOP_COLORS[Math.floor(rng() * STROOP_COLORS.length)];
      const congruent = cdeck[i];
      const word = congruent ? ink : STROOP_COLORS[(STROOP_COLORS.indexOf(ink) + 1 + Math.floor(rng() * 2)) % STROOP_COLORS.length];
      // the WORD (in its ink color) IS the response target: does the word's
      // meaning MATCH its ink? RIGHT trigger = YES (congruent), LEFT = NO
      trials.push({
        id: `${groupId}-w`, spawnAt: t, duration: p.windowMs, kind: "go",
        requiredHand: congruent ? "right" : "left",
        zone: "center", position: [0, 1.58, Z - 0.08], color: ink.hex, shape: "diamond", scale: 0.001, label: word.name,
        meta: { labelColor: ink.hex, labelSize: 0.075 },
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
// Show a pattern, hide it, show the full grid, and the athlete POINTS + clicks
// the cells that were lit. Lives-based: 3 hearts, a wrong/missed cell fails the
// round and costs a heart; 3 clean rounds in a row restore FULL hearts. The
// run ends when hearts hit zero.
const PM_Z = -1.2; // pointer distance
interface PMState { lives: number; done: boolean; prevErrors: number; cleanStreak: number; started: boolean }
const pmState: PMState = { lives: 3, done: false, prevErrors: 0, cleanStreak: 0, started: false };

export const PatternMemory: DrillDefinition = {
  id: "pattern-memory",
  name: "Pattern-Memory",
  shortName: "Pattern-Memory",
  phase: "Route",
  description: "A pattern lights up on the grid - memorize it. It vanishes, the full grid appears, and you POINT + click exactly the cells that were lit. 3 hearts: a wrong or missed cell costs a heart; 3 clean rounds in a row restore full hearts. The run ends at zero hearts.",
  purpose: "Visuospatial pattern memory and recall (lives-based endurance).",
  interaction: "ray", responseMode: "pointer", environment: "arena", mvp: true, trialPaced: true,
  instructions: [
    "1. A pattern of TEAL cells lights up. Memorize which cells.",
    "2. The pattern vanishes, then the full grid appears.",
    "3. POINT your controller at each remembered cell and pull the TRIGGER.",
    "4. A wrong cell or a missed cell fails the round and costs a heart (you have 3).",
    "5. Three clean rounds in a row restore FULL hearts. The run ends at zero.",
  ],
  controlsHint: "MEMORIZE - THEN POINT + TRIGGER THE LIT CELLS - 3 HEARTS",
  levels: levels50((i) => {
    const grid = i < 14 ? 3 : i < 30 ? 4 : i < 44 ? 5 : 6;
    return {
      label: `${grid}x${grid} grid, ${Math.min(2 + Math.floor(i / 5), 10)} cells`,
      parameters: {
        gridSize: grid, patternLength: Math.min(2 + Math.floor(i / 5), Math.max(3, grid * grid - 2)),
        displayMs: ilerp50(3000, 1300, i), delayMs: ilerp50(400, 1400, i), recallMs: ilerp50(6000, 3800, i),
      },
    };
  }),
  buildTrials: (params, rng) => {
    const p = params as { gridSize: number; patternLength: number; displayMs: number; delayMs: number; recallMs: number };
    pmState.lives = 3; pmState.done = false; pmState.prevErrors = 0; pmState.cleanStreak = 0; pmState.started = false;
    const n = p.gridSize * p.gridSize;
    // wider spacing + bigger cells for clean pointing
    const cell = Math.min(0.28, 1.15 / p.gridSize);
    const origin = -((p.gridSize - 1) * cell) / 2;
    const posOf = (idx: number): [number, number, number] => [
      origin + (idx % p.gridSize) * cell,
      1.5 + (((p.gridSize - 1) / 2) - Math.floor(idx / p.gridSize)) * cell * 0.9,
      PM_Z,
    ];
    const trials: TrialSpec[] = [];
    let t = 1500;
    const ROUNDS = 40;
    for (let r = 0; r < ROUNDS; r++) {
      const groupId = `pm-g${r}`;
      const cells = range(n).sort(() => rng() - 0.5).slice(0, p.patternLength);
      // hearts marker + lives logic (spawns first each round)
      trials.push({
        id: `${groupId}-lives`, spawnAt: t, duration: p.displayMs + p.delayMs + p.recallMs, kind: "distractor",
        zone: "center", position: [0, 1.98, PM_Z], color: "#EC4899", emissive: "#EC4899", shape: "diamond", scale: 0.001,
        label: "HEARTS 3", meta: { decor: true, pmLivesFirst: true, labelInside: true, labelSize: 0.05, labelColor: "#EC4899" },
      });
      // display phase (teal, decor)
      cells.forEach((idx, k) => {
        trials.push({
          id: `${groupId}-d${k}`, spawnAt: t, duration: p.displayMs, kind: "distractor", decor: true,
          zone: "center", position: posOf(idx), color: "#2998AA", emissive: "#7FD3DE", shape: "box", scale: cell * 0.36,
        });
      });
      // recall phase: full grid, click the lit cells (groupMode all)
      const recallAt = t + p.displayMs + p.delayMs;
      for (let idx = 0; idx < n; idx++) {
        trials.push({
          id: `${groupId}-c${idx}`, spawnAt: recallAt, duration: p.recallMs,
          kind: cells.includes(idx) ? "go" : "distractor",
          zone: "center", position: posOf(idx), color: PURPLE, emissive: "#2D234F", shape: "box",
          scale: cell * 0.36, groupId, groupMode: "all",
        });
      }
      t = recallAt + p.recallMs + 900;
    }
    return trials;
  },
  onSpawnAdapt: (spec, snapshot, api) => {
    if (!spec.meta?.pmLivesFirst) return;
    if (pmState.done) { api.finishEarly(); spec.meta = { ...spec.meta, decor: true }; spec.duration = 10; return; }
    if (pmState.started) {
      // a round failed if the error count grew during it (wrong cell or miss)
      const newErrors = snapshot.errors - pmState.prevErrors;
      if (newErrors > 0) {
        pmState.lives -= 1;
        pmState.cleanStreak = 0;
      } else {
        pmState.cleanStreak += 1;
        if (pmState.cleanStreak % 3 === 0) pmState.lives = 3; // full restore
      }
    }
    pmState.prevErrors = snapshot.errors;
    pmState.started = true;
    if (pmState.lives <= 0) { pmState.done = true; api.finishEarly(); spec.meta = { ...spec.meta, decor: true }; spec.duration = 10; return; }
    spec.label = "\u2665 ".repeat(pmState.lives).trim();
  },
  analyze: (events) => {
    const clean = events.filter((e) => e.correct && e.errorType !== "correctRejection").length;
    return [
      `Pattern-Memory: recalled ${clean} cell(s) before running out of hearts.`,
      "Lives-based endurance - a wrong or missed cell fails the round; 3 clean rounds restore full hearts.",
    ];
  },
  durationMs: () => 300000, // ceiling; the run ends on hearts = 0
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
  levels: levels50((i) => ({
    label: `track ${1 + Math.floor(i / 12)} of ${4 + Math.floor(i / 7)}`,
    parameters: {
      rounds: 1 + Math.floor(i / 12) <= 2 ? 5 : 3,
      balls: 4 + Math.floor(i / 7), track: 1 + Math.floor(i / 12),
      highlightMs: 2200, trackMs: ilerp50(12000, 6000, i), answerMs: 4200,
      speed: lerp50(0.35, 1.05, i),
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
      t += total + 500;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { rounds: number; highlightMs: number; trackMs: number; answerMs: number };
    return 1500 + p.rounds * (p.highlightMs + p.trackMs + p.answerMs + 1200) + 1500;
  },
};
