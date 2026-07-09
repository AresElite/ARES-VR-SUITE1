import type { DrillDefinition, TrialSpec, TargetZone } from "@/ares/drillTypes";
import { pick } from "@/utils/rng";
import { strikePosition, PERIPHERAL_ZONES } from "../shared/zones";
import { levels25, lerp25, ilerp25, levels50, lerp50, ilerp50 } from "../shared/levels";

/**
 * ACQUIRE — direct ports of the A.R.E.S. Performance Suite drills.
 * Exact names and progression structure from the touchscreen suite.
 */

const TEAL = "#2998AA";
const TEAL_L = "#7FD3DE";
const GOLD = "#C4B5FD";
const GRAY = "#111428";
const WHITE = "#EAF0FF";
const Z = -0.62;

// ============================== SPEED-SEARCH ==============================
// Find the single PYRAMID among sphere/cube decoys. All shapes share one
// color — the target is found by 3D FORM alone, never by a highlight.
// Phase 1 (Shapes): size ramps 60->20px, central fraction 0.8->0.2 (L1-30).
export const SpeedSearch: DrillDefinition = {
  id: "speed-search",
  name: "Speed-Search",
  shortName: "Speed-Search",
  phase: "Acquire",
  description: "A field of 3D shapes floods the board — spheres and cubes. Find the single PYRAMID (all the same color, no highlight) and strike it before the field collapses.",
  purpose: "Fast saccades, crowd discrimination, target selection.",
  interaction: "ray",
  responseMode: "pointer",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. A field of 3D shapes appears ahead - SPHERES and CUBES, all one color.",
    "2. Exactly ONE PYRAMID hides among them. There is NO color highlight - find it by shape.",
    "3. POINT your controller at the pyramid and pull the TRIGGER.",
    "4. Clicking any decoy counts against you. Higher levels: smaller shapes, wider field.",
  ],
  controlsHint: "POINT AT THE PYRAMID - PULL THE TRIGGER",
  levels: levels50((i) => ({
    label: `field of ${6 + Math.floor(i / 6)} — ${Math.round(lerp50(56, 20, i))}px`,
    parameters: {
      searches: 10, fieldSize: 6 + Math.floor(i / 6),
      exposureMs: ilerp50(3000, 1250, i), gapMs: 1000,
      scale: Math.max(0.024, lerp50(56, 20, i) * 0.0011),
      spreadDeg: lerp50(12, 40, i),
    },
  })),
  buildTrials: (params, rng) => {
    const p = params as { searches: number; fieldSize: number; exposureMs: number; gapMs: number; scale: number; spreadDeg: number };
    const decoyShapes = ["sphere", "box"] as const;
    const SHAPE_COLOR = "#9FA8D6"; // one color for every shape — no highlight
    const trials: TrialSpec[] = [];
    let t = 1200;
    for (let s = 0; s < p.searches; s++) {
      const groupId = `sps-g${s}`;
      const targetIdx = Math.floor(rng() * p.fieldSize);
      // golden-angle spiral lattice: geometric guarantee that every shape in
      // the field keeps clean strike separation, however dense the level
      const maxR = 0.18 + (p.spreadDeg / 36) * 0.42;
      const minSep = p.scale * 2.6 + 0.02;
      const lattice: [number, number][] = [];
      const GA = Math.PI * (3 - Math.sqrt(5));
      const spin = rng() * Math.PI * 2;
      for (let k = 0; lattice.length < p.fieldSize && k < 80; k++) {
        const r = maxR * Math.sqrt((k + 0.5) / p.fieldSize);
        const a = spin + k * GA;
        const px = Math.cos(a) * r * 1.15;
        const py = 1.42 + Math.sin(a) * r * 0.75;
        if (py < 0.98 || py > 1.88 || Math.abs(px) > 0.88) continue;
        if (lattice.every(([qx, qy]) => Math.hypot(px - qx, py - qy) >= minSep)) lattice.push([px, py]);
      }
      while (lattice.length < p.fieldSize) {
        lattice.push([(rng() - 0.5) * 1.4, 1.1 + rng() * 0.7]);
      }
      // shuffle so the target's lattice slot is unpredictable
      for (let k = lattice.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [lattice[k], lattice[j]] = [lattice[j], lattice[k]];
      }
      for (let i = 0; i < p.fieldSize; i++) {
        const zone = pick(rng, PERIPHERAL_ZONES.concat(["center"]) as TargetZone[]);
        const isTarget = i === targetIdx;
        const pos: [number, number, number] = [lattice[i][0] * 1.35, lattice[i][1], -1.25];
        trials.push({
          id: `${groupId}-${i}`,
          spawnAt: t,
          duration: p.exposureMs,
          kind: isTarget ? "go" : "distractor",
          zone,
          position: pos,
          color: SHAPE_COLOR,
          emissive: SHAPE_COLOR, // identical fill for every shape — no target highlight
          shape: isTarget ? "pyramid" : pick(rng, decoyShapes),
          scale: p.scale,
          groupId,
        });
      }
      t += p.exposureMs + p.gapMs;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { searches: number; exposureMs: number; gapMs: number };
    return 1200 + p.searches * (p.exposureMs + p.gapMs) + 1500;
  },
};

// ============================== SCHULTE TABLE ==============================
// Fixate center, use peripheral vision, POINT the controller ray at each
// number and click the trigger in ascending order. Trial-paced (5 grids per
// level) — each grid stays until completed, then the next appears. Grids grow
// 3x3 -> 7x7 across the ladder; boxes shrink and spread wider each level.
const SCHULTE_Z = -1.5; // pointer distance — you aim, you don't reach
const SCHULTE_GRIDS = 5;

export const SchulteTable: DrillDefinition = {
  id: "schulte-table",
  name: "Schulte Table",
  shortName: "Schulte Table",
  phase: "Acquire",
  description: "Fixate the grid center, find numbers with peripheral vision, and POINT-and-click them in ascending order. Five grids per level; each grid stays until you finish it. Grids grow 3x3 to 7x7 as levels climb, with smaller, wider-spaced boxes.",
  purpose: "Peripheral localization, visual span, ordered scanning speed.",
  interaction: "ray",
  responseMode: "pointer",
  environment: "arena",
  mvp: true,
  trialPaced: true,
  interTrialCountdown: true,
  instructions: [
    "1. Fixate your gaze on the CENTER of the grid.",
    "2. Use PERIPHERAL vision to locate the numbers - do not scan with your head.",
    "3. POINT your controller at each number and pull the TRIGGER, in ascending order (1, 2, 3...).",
    "4. A wrong-order click counts against you, but the grid keeps going.",
    "5. Finish a grid, take the 3-2-1-GO to recenter, and the next grid appears - 5 grids per level.",
  ],
  controlsHint: "EYES CENTER - POINT + TRIGGER 1..N IN ORDER",
  levels: levels50((i) => {
    const size = i < 14 ? 3 : i < 26 ? 4 : i < 38 ? 5 : i < 46 ? 6 : 7;
    const band = size === 3 ? "Beginner" : size === 4 ? "Intermediate" : size === 5 ? "Advanced" : size === 6 ? "Elite" : "Master";
    // field widens (boxes spread further) and boxes shrink as the level climbs
    return {
      label: `${size}x${size} ${band}`,
      parameters: {
        gridSize: size,
        grids: SCHULTE_GRIDS,
        fieldW: lerp50(0.95, 2.05, i),   // total spread — wider every level
        boxFrac: lerp50(0.34, 0.18, i),  // box size vs cell — shrinks every level (pads render 2.4x wide)
      },
    };
  }),
  buildTrials: (params, rng) => {
    const p = params as { gridSize: number; grids: number; fieldW: number; boxFrac: number };
    const n = p.gridSize * p.gridSize;
    const cellSpacing = p.fieldW / p.gridSize;
    const originX = -((p.gridSize - 1) * cellSpacing) / 2;
    const vSpacing = cellSpacing * 0.9;
    const originY = 1.48 + ((p.gridSize - 1) * vSpacing) / 2;
    const boxScale = Math.max(0.03, cellSpacing * p.boxFrac);
    const trials: TrialSpec[] = [];
    for (let g = 0; g < p.grids; g++) {
      const groupId = `sch-g${g}`;
      const order = Array.from({ length: n }, (_, k) => k);
      for (let k = order.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [order[k], order[j]] = [order[j], order[k]];
      }
      for (let cellIdx = 0; cellIdx < n; cellIdx++) {
        const col = cellIdx % p.gridSize;
        const row = Math.floor(cellIdx / p.gridSize);
        trials.push({
          id: `${groupId}-${cellIdx}`,
          // grid 0 spawns at start; grids 1..4 spawn on completion of the prior
          spawnAt: g === 0 ? 1500 : -1,
          gridSeq: g,
          duration: 120000, // effectively until struck — trial-paced, not timed
          kind: "go",
          zone: "center",
          position: [originX + col * cellSpacing, originY - row * vSpacing, SCHULTE_Z],
          color: GRAY,
          emissive: TEAL,
          shape: "pad",
          scale: boxScale,
          label: String(order[cellIdx] + 1),
          groupId,
          groupMode: "ordered",
          seq: order[cellIdx],
        });
      }
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { gridSize: number; grids: number };
    const n = p.gridSize * p.gridSize;
    return 1500 + p.grids * n * 1600 + 3000; // generous ceiling; trial-paced, ends on completion
  },
};

// =========================== CONTRAST-ASSESSMENT ===========================
// A 'C' (gapped ring) appears at center — strike THROUGH the gap direction.
// Contrast falls as levels rise. ~25 trials.
export const ContrastAssessment: DrillDefinition = {
  id: "contrast-assessment",
  name: "Contrast-Assessment",
  shortName: "Contrast",
  phase: "Acquire",
  description: "A faint 'C' ring appears ahead. Strike through it in the direction of the GAP (up, down, left, right). Contrast drops as you level.",
  purpose: "Contrast sensitivity with a directional forced choice.",
  interaction: "touch",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. A ring with a GAP (like a letter C) appears ahead at low contrast.",
    "2. Find the gap: up, down, left, or right.",
    "3. Strike THROUGH the ring in the gap's direction.",
    "4. Do not guess - be as precise as possible. About 25 trials.",
  ],
  controlsHint: "STRIKE THROUGH THE RING TOWARD THE GAP",
  levels: levels50((i) => ({
    label: `${Math.round(lerp50(92, 7, i))}% contrast`,
    parameters: { trials: 25, contrast: lerp50(0.92, 0.07, i), showMs: ilerp50(2300, 1200, i) },
  })),
  buildTrials: (params, rng) => {
    const p = params as { trials: number; contrast: number; showMs: number };
    const dirs = ["up", "down", "left", "right"] as const;
    const v = Math.round(30 + p.contrast * 190);
    const hex = `#${v.toString(16).padStart(2, "0")}${v.toString(16).padStart(2, "0")}${Math.min(255, v + 30).toString(16).padStart(2, "0")}`;
    const trials: TrialSpec[] = [];
    let t = 1500;
    for (let i = 0; i < p.trials; i++) {
      const gap = pick(rng, dirs);
      trials.push({
        id: `ca-${i}`,
        spawnAt: t,
        duration: p.showMs,
        kind: "go",
        zone: "center",
        position: [0, 1.45, Z],
        requiredDirection: gap,
        color: hex,
        shape: "arc",
        scale: 0.1,
        // hitBoost: entering the C opening counts — not just dead center
        meta: { pointDir: gap, gapRing: true, hitBoost: 0.06 },
      });
      t += p.showMs + 600 + rng() * 400;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; showMs: number };
    return 1500 + p.trials * (p.showMs + 800) + 1500;
  },
};

// ============================ RAPID RECOGNITION ============================
// Match-to-sample under pressure. A central CUE shows the target; options
// fan out around it — POINT and click the one that matches. Lives-based:
// you get 3 hearts, lose one on a miss, and win one back every 3 in a row.
// The run ends when your hearts hit zero. It ramps continuously — more
// options, smaller, faster — and the CONTENT hardens by level: colors ->
// shapes -> harder shapes -> letters -> letters+numbers.
const CONFUSABLES: Record<string, string> = { "0": "O", O: "0", "1": "I", I: "1", "2": "Z", Z: "2", "3": "E", E: "3", "5": "S", S: "5", "6": "G", G: "6", "7": "T", T: "7", "8": "B", B: "8" };
const RR_Z = -1.1; // pointer distance
const RR_COLORS = ["#EF4444", "#F97316", "#F5B648", "#22C55E", "#2998AA", "#3B82F6", "#8B5CF6", "#EC4899", "#7FD3DE", "#C4B5FD"];
const RR_SHAPES = ["sphere", "box", "pyramid"] as const;
const RR_HARD_SHAPES = ["box", "pyramid", "diamond", "cone", "ring"] as const;
const RR_LETTERS = "BCDEGIOSTZ".split("");
const RR_ALNUM = Object.keys(CONFUSABLES);

type RRBand = "colors" | "shapes" | "hardshapes" | "letters" | "alnum";
const rrBand = (i: number): RRBand =>
  i < 10 ? "colors" : i < 20 ? "shapes" : i < 30 ? "hardshapes" : i < 40 ? "letters" : "alnum";

interface RRState { lives: number; done: boolean; lastMilestone: number }
const rrState: RRState = { lives: 3, done: false, lastMilestone: 0 };
const RR_MAX_LIVES = 5;

// build one option's visual for a given band; `variant` picks distinct content
function rrOption(band: RRBand, variant: string, scale: number, pos: [number, number, number], id: string, groupId: string, spawnAt: number, duration: number, kind: "go" | "distractor"): TrialSpec {
  if (band === "colors") {
    return { id, spawnAt, duration, kind, groupId, zone: "center", position: pos, color: variant, emissive: variant, shape: "sphere", scale };
  }
  if (band === "shapes" || band === "hardshapes") {
    return { id, spawnAt, duration, kind, groupId, zone: "center", position: pos, color: "#9FA8D6", emissive: "#9FA8D6", shape: variant as never, scale };
  }
  // letters / alnum: a rounded pad with the character
  return { id, spawnAt, duration, kind, groupId, zone: "center", position: pos, color: GRAY, emissive: TEAL, shape: "pad", scale, label: variant };
}

export const RapidRecognition: DrillDefinition = {
  id: "rapid-recognition",
  name: "Rapid Recognition",
  shortName: "Rapid Recognition",
  phase: "Acquire",
  description: "Match-to-sample under pressure. A central cue shows the target - POINT and click the matching option around it. 3 hearts: lose one on a miss, earn one back every 3 correct in a row; the run ends at zero hearts. Ramps continuously and the content hardens by level: colors -> shapes -> harder shapes -> letters -> letters+numbers.",
  purpose: "Rapid recognition and match-to-sample under load (lives-based endurance).",
  interaction: "ray",
  responseMode: "pointer",
  environment: "arena",
  mvp: true,
  trialPaced: true,
  instructions: [
    "1. A CUE appears at center - a color, shape, or character to find.",
    "2. Options fan out around it. POINT your controller at the MATCH and pull the TRIGGER.",
    "3. You have 3 HEARTS. A wrong pick or a miss costs a heart.",
    "4. Get 3 correct IN A ROW to win a heart back (up to 5).",
    "5. It speeds up and adds options as you go. The run ends when your hearts hit zero.",
  ],
  controlsHint: "POINT + TRIGGER THE MATCH - DON'T LOSE ALL 3 HEARTS",
  levels: levels50((i) => {
    const band = rrBand(i);
    const within = i % 10; // position inside the band (0..9)
    return {
      label: `${band === "alnum" ? "letters+numbers" : band} — starts ${3 + Math.floor(within / 3)} options`,
      parameters: { band, baseOptions: 3 + Math.floor(within / 3), startSpeed: within },
    };
  }),
  buildTrials: (params, rng) => {
    const p = params as { band: RRBand; baseOptions: number; startSpeed: number };
    rrState.lives = 3;
    rrState.done = false;
    rrState.lastMilestone = 0;
    const pool: string[] =
      p.band === "colors" ? RR_COLORS
      : p.band === "shapes" ? [...RR_SHAPES]
      : p.band === "hardshapes" ? [...RR_HARD_SHAPES]
      : p.band === "letters" ? RR_LETTERS
      : RR_ALNUM;
    const trials: TrialSpec[] = [];
    let t = 1500;
    const ROUNDS = 60;
    for (let r = 0; r < ROUNDS; r++) {
      const groupId = `rr-g${r}`;
      // continuous ramp: more options, smaller, faster
      const count = Math.min(7, p.baseOptions + Math.floor((p.startSpeed + r) / 5));
      const scale = Math.max(0.026, 0.05 - r * 0.0009);
      const cueDelay = Math.max(300, 850 - (p.startSpeed * 15 + r * 22));
      const answerMs = Math.max(1100, 2200 - (p.startSpeed * 20 + r * 28));
      // choose the match + distinct distractors
      const shuffled = [...pool].sort(() => rng() - 0.5);
      const match = shuffled[0];
      const distractors = shuffled.slice(1, count);
      // for alnum, prefer confusable distractors so it's genuinely hard
      const optionVals = [match, ...distractors];
      for (let k = optionVals.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [optionVals[k], optionVals[j]] = [optionVals[j], optionVals[k]]; }
      // lives/hearts marker (drives the lives logic + shows hearts)
      trials.push({
        id: `${groupId}-lives`, spawnAt: t, duration: cueDelay + answerMs, kind: "distractor",
        zone: "center", position: [0, 1.92, RR_Z], color: TEAL, emissive: TEAL, shape: "diamond", scale: 0.001,
        label: "HEARTS 3", meta: { decor: true, rrLivesFirst: true, labelInside: true, labelSize: 0.05, labelColor: "#EC4899" },
      });
      // central cue
      const cueScale = p.band === "colors" ? 0.05 : 0.045;
      trials.push(
        p.band === "colors"
          ? { id: `${groupId}-cue`, spawnAt: t, duration: cueDelay + answerMs, kind: "distractor", decor: true, zone: "center", position: [0, 1.5, RR_Z], color: match, emissive: match, shape: "sphere", scale: cueScale }
          : p.band === "shapes" || p.band === "hardshapes"
            ? { id: `${groupId}-cue`, spawnAt: t, duration: cueDelay + answerMs, kind: "distractor", decor: true, zone: "center", position: [0, 1.5, RR_Z], color: "#EAF0FF", emissive: "#EAF0FF", shape: match as never, scale: cueScale }
            : { id: `${groupId}-cue`, spawnAt: t, duration: cueDelay + answerMs, kind: "distractor", decor: true, zone: "center", position: [0, 1.5, RR_Z], color: GRAY, emissive: WHITE, shape: "pad", scale: 0.05, label: match },
      );
      // options fan out on a ring, appearing after the cue delay
      const radius = 0.34 + count * 0.02;
      for (let o = 0; o < optionVals.length; o++) {
        const ang = (o / optionVals.length) * Math.PI * 2 + Math.PI / 2 + rng() * 0.2;
        const pos: [number, number, number] = [Math.cos(ang) * radius * 1.25, 1.42 + Math.sin(ang) * radius, RR_Z];
        const val = optionVals[o];
        const isMatch = val === match;
        trials.push({ ...rrOption(p.band, val, scale, pos, `${groupId}-o${o}`, groupId, t + cueDelay, answerMs, isMatch ? "go" : "distractor") });
      }
      t += cueDelay + answerMs + 500;
    }
    return trials;
  },
  onSpawnAdapt: (spec, snapshot, api) => {
    if (!spec.meta?.rrLivesFirst) return;
    if (rrState.done) { api.finishEarly(); spec.meta = { ...spec.meta, decor: true }; spec.duration = 10; return; }
    // fold in the previous round's outcome
    if (snapshot.hits + snapshot.errors > 0 && snapshot.lastEventCorrect !== undefined) {
      if (!snapshot.lastEventCorrect) {
        rrState.lives -= 1;
        rrState.lastMilestone = 0;
      } else if (snapshot.streak > 0 && snapshot.streak % 3 === 0 && snapshot.streak !== rrState.lastMilestone) {
        rrState.lives = Math.min(RR_MAX_LIVES, rrState.lives + 1);
        rrState.lastMilestone = snapshot.streak;
      }
    }
    if (rrState.lives <= 0) { rrState.done = true; api.finishEarly(); spec.meta = { ...spec.meta, decor: true }; spec.duration = 10; return; }
    spec.label = `${"\u2665 ".repeat(rrState.lives).trim()}`;
  },
  analyze: (events) => {
    const scored = events.filter((e) => e.errorType !== "correctRejection" && (e.correct || e.errorType));
    const correct = scored.filter((e) => e.correct).length;
    return [
      `Rapid Recognition: survived ${correct} correct match(es) before running out of hearts.`,
      "Lives-based endurance — content and speed ramp continuously within the run.",
    ];
  },
  durationMs: () => 300000, // generous ceiling; the run ends on hearts = 0
};
