import type { DrillDefinition, TrialSpec, TargetZone } from "@/ares/drillTypes";
import { pick } from "@/utils/rng";
import { strikePosition, PERIPHERAL_ZONES } from "../shared/zones";
import { levels25, lerp25, ilerp25 } from "../shared/levels";

/**
 * ACQUIRE — direct ports of the A.R.E.S. Performance Suite drills.
 * Exact names and progression structure from the touchscreen suite.
 */

const TEAL = "#2998AA";
const TEAL_L = "#7FD3DE";
const GOLD = "#F5B648";
const GRAY = "#111428";
const WHITE = "#EAF0FF";
const Z = -0.62;

// ============================== SPEED-SEARCH ==============================
// Find the single TRIANGLE among circle/square/diamond decoys.
// Phase 1 (Shapes): size ramps 60->20px, central fraction 0.8->0.2 (L1-30).
export const SpeedSearch: DrillDefinition = {
  id: "speed-search",
  name: "Speed-Search",
  shortName: "Speed-Search",
  phase: "Acquire",
  description: "A field of decoy shapes floods the board. Find the single TRIANGLE and strike it before the field collapses.",
  purpose: "Fast saccades, crowd discrimination, target selection.",
  interaction: "touch",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. A field of shapes appears across your reach zone - circles, boxes, diamonds.",
    "2. Exactly ONE triangle (cone) hides among them.",
    "3. Find it with your eyes and STRIKE it before the field disappears.",
    "4. Striking any decoy counts against you. Higher levels: smaller shapes, wider field.",
  ],
  controlsHint: "FIND THE TRIANGLE - STRIKE IT FAST",
  levels: levels25((i) => ({
    label: `field of ${6 + Math.floor(i / 3)} — ${Math.round(lerp25(60, 20, i))}px`,
    parameters: {
      searches: 10, fieldSize: 6 + Math.floor(i / 3),
      exposureMs: ilerp25(3000, 1400, i), gapMs: 1000,
      scale: Math.max(0.042, lerp25(60, 20, i) * 0.0011),
      spreadDeg: lerp25(12, 36, i),
    },
  })),
  buildTrials: (params, rng) => {
    const p = params as { searches: number; fieldSize: number; exposureMs: number; gapMs: number; scale: number; spreadDeg: number };
    const decoyShapes = ["sphere", "box", "diamond"] as const;
    const trials: TrialSpec[] = [];
    let t = 1200;
    for (let s = 0; s < p.searches; s++) {
      const groupId = `sps-g${s}`;
      const targetIdx = Math.floor(rng() * p.fieldSize);
      for (let i = 0; i < p.fieldSize; i++) {
        const zone = pick(rng, PERIPHERAL_ZONES.concat(["center"]) as TargetZone[]);
        const isTarget = i === targetIdx;
        trials.push({
          id: `${groupId}-${i}`,
          spawnAt: t,
          duration: p.exposureMs,
          kind: isTarget ? "go" : "distractor",
          zone,
          position: strikePosition(zone, 4 + rng() * p.spreadDeg, 0.2, rng, 0.75),
          color: isTarget ? TEAL_L : "#38406B",
          emissive: isTarget ? TEAL : undefined,
          shape: isTarget ? "cone" : pick(rng, decoyShapes),
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
// Fixate center, use peripheral vision, strike 1..N in ascending order.
// Difficulty bands: <=20 3x3, <=45 4x4, <=75 5x5, <=90 6x6, else 7x7.
function schulteSize(level: number): { size: number; label: string } {
  if (level <= 20) return { size: 3, label: "Beginner" };
  if (level <= 45) return { size: 4, label: "Intermediate" };
  if (level <= 75) return { size: 5, label: "Advanced" };
  if (level <= 90) return { size: 6, label: "Elite" };
  return { size: 7, label: "Master" };
}

export const SchulteTable: DrillDefinition = {
  id: "schulte-table",
  name: "Schulte Table",
  shortName: "Schulte Table",
  phase: "Acquire",
  description: "Fixate the center of the grid, locate numbers with peripheral vision, and strike them in ascending order as fast as possible.",
  purpose: "Peripheral localization, visual span, ordered scanning speed.",
  interaction: "touch",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. Fixate your gaze on the CENTER of the grid.",
    "2. Use PERIPHERAL vision to locate the numbers - do not scan with your head.",
    "3. Strike the numbers in ascending order (1, 2, 3...) as fast as possible.",
    "4. A wrong-order strike counts against you but the grid keeps going.",
    "5. Complete every grid to finish the session.",
  ],
  controlsHint: "EYES CENTER - STRIKE 1..N IN ORDER",
  levels: levels25((i) => {
    const size = i < 8 ? 3 : i < 14 ? 4 : i < 20 ? 5 : i < 23 ? 6 : 7;
    const band = size === 3 ? "Beginner" : size === 4 ? "Intermediate" : size === 5 ? "Advanced" : size === 6 ? "Elite" : "Master";
    return {
      label: `${size}×${size} ${band}`,
      parameters: { gridSize: size, grids: size <= 4 ? 5 : 3, cellSeconds: Math.max(1.5, 2.5 - i * 0.04) },
    };
  }),
  buildTrials: (params, rng) => {
    const p = params as { gridSize: number; grids: number; cellSeconds: number };
    const trials: TrialSpec[] = [];
    const n = p.gridSize * p.gridSize;
    const cell = Math.min(0.19, 0.72 / p.gridSize);
    const origin = -((p.gridSize - 1) * cell) / 2;
    let t = 1500;
    const gridMs = n * p.cellSeconds * 1000;
    for (let g = 0; g < p.grids; g++) {
      const groupId = `sch-g${g}`;
      const order = Array.from({ length: n }, (_, k) => k);
      for (let k = order.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [order[k], order[j]] = [order[j], order[k]];
      }
      for (let cellIdx = 0; cellIdx < n; cellIdx++) {
        const x = cellIdx % p.gridSize;
        const y = Math.floor(cellIdx / p.gridSize);
        trials.push({
          id: `${groupId}-${cellIdx}`,
          spawnAt: t,
          duration: gridMs,
          kind: "go",
          zone: "center",
          position: [origin + x * cell, 1.5 - 0.36 + y * cell * 0.85, Z],
          color: GRAY,
          emissive: TEAL,
          shape: "pad",
          scale: cell * 0.36,
          label: String(order[cellIdx] + 1),
          groupId,
          groupMode: "ordered",
          seq: order[cellIdx],
        });
      }
      t += gridMs + 1500;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { gridSize: number; grids: number; cellSeconds: number };
    const n = p.gridSize * p.gridSize;
    return 1500 + p.grids * (n * p.cellSeconds * 1000 + 1500) + 1000;
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
  levels: levels25((i) => ({
    label: `${Math.round(lerp25(92, 10, i))}% contrast`,
    parameters: { trials: 25, contrast: lerp25(0.92, 0.1, i), showMs: ilerp25(2300, 1300, i) },
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
        meta: { pointDir: gap, gapRing: true },
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
// Central cue stays visible; peripheral rings flash confusable characters
// briefly, then blank. Strike the ring that held the MATCHING character.
const CONFUSABLES: Record<string, string> = { "0": "O", O: "0", "1": "I", I: "1", "2": "Z", Z: "2", "3": "E", E: "3", "5": "S", S: "5", "6": "G", G: "6", "7": "T", T: "7", "8": "B", B: "8" };

export const RapidRecognition: DrillDefinition = {
  id: "rapid-recognition",
  name: "Rapid Recognition",
  shortName: "Rapid Recognition",
  phase: "Acquire",
  description: "The central cue stays visible. Peripheral rings flash characters briefly, then blank. Strike the ring that held the MATCH — confusables everywhere.",
  purpose: "Peripheral character recognition under brief exposure.",
  interaction: "touch",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. A cue character stays visible at center (for example 'B').",
    "2. Rings around it flash characters BRIEFLY, then go blank.",
    "3. One ring held the exact match - the others held confusables (8 vs B, 0 vs O, 5 vs S...).",
    "4. Strike the ring that held the MATCH after the characters vanish.",
  ],
  controlsHint: "READ FAST - STRIKE THE RING THAT HELD THE MATCH",
  levels: levels25((i) => ({
    label: `${3 + Math.floor(i / 7)} rings — ${ilerp25(750, 260, i)}ms flash`,
    parameters: { trials: 12, rings: 3 + Math.floor(i / 7), flashMs: ilerp25(750, 260, i), answerMs: ilerp25(2400, 1500, i) },
  })),
  buildTrials: (params, rng) => {
    const p = params as { trials: number; rings: number; flashMs: number; answerMs: number };
    const chars = Object.keys(CONFUSABLES);
    const trials: TrialSpec[] = [];
    let t = 1500;
    for (let i = 0; i < p.trials; i++) {
      const groupId = `rrec-g${i}`;
      const cue = pick(rng, chars);
      const matchIdx = Math.floor(rng() * p.rings);
      // persistent central cue
      trials.push({
        id: `${groupId}-cue`, spawnAt: t, duration: p.flashMs + p.answerMs, kind: "distractor", decor: true,
        zone: "center", position: [0, 1.62, Z - 0.1], color: WHITE, shape: "diamond", scale: 0.045, label: cue,
      });
      for (let rIdx = 0; rIdx < p.rings; rIdx++) {
        const ang = (rIdx / p.rings) * Math.PI * 2 + rng() * 0.5;
        const pos: [number, number, number] = [Math.cos(ang) * 0.38, 1.42 + Math.sin(ang) * 0.28, Z];
        // brief character flash (decor)
        trials.push({
          id: `${groupId}-f${rIdx}`, spawnAt: t, duration: p.flashMs, kind: "distractor", decor: true,
          zone: "center", position: [pos[0], pos[1] + 0.09, pos[2]], color: GOLD, shape: "diamond", scale: 0.02,
          label: rIdx === matchIdx ? cue : CONFUSABLES[cue],
        });
        // strikeable ring (answer window opens after the flash)
        trials.push({
          id: `${groupId}-r${rIdx}`, spawnAt: t, duration: p.flashMs + p.answerMs,
          kind: rIdx === matchIdx ? "go" : "distractor",
          zone: "center", position: pos, color: TEAL, emissive: TEAL, shape: "ring", scale: 0.06, groupId,
        });
      }
      t += p.flashMs + p.answerMs + 700;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; flashMs: number; answerMs: number };
    return 1500 + p.trials * (p.flashMs + p.answerMs + 700) + 1500;
  },
};
