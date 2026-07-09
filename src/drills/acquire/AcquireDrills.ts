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
  interaction: "touch",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. A field of 3D shapes appears at distance - SPHERES and CUBES, all one color.",
    "2. Exactly ONE PYRAMID hides among them. There is NO color highlight - find it by shape.",
    "3. Scan with your eyes and STRIKE the pyramid before the field disappears.",
    "4. Striking any decoy counts against you. Higher levels: smaller shapes, wider field.",
  ],
  controlsHint: "FIND THE PYRAMID BY ITS SHAPE - STRIKE IT FAST",
  levels: levels50((i) => ({
    label: `field of ${6 + Math.floor(i / 6)} — ${Math.round(lerp50(48, 15, i))}px`,
    parameters: {
      searches: 10, fieldSize: 6 + Math.floor(i / 6),
      exposureMs: ilerp50(3000, 1250, i), gapMs: 1000,
      scale: Math.max(0.02, lerp50(48, 15, i) * 0.0011),
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
        const pos: [number, number, number] = [lattice[i][0], lattice[i][1], -0.92];
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
  instructions: [
    "1. Fixate your gaze on the CENTER of the grid.",
    "2. Use PERIPHERAL vision to locate the numbers - do not scan with your head.",
    "3. POINT your controller at each number and pull the TRIGGER, in ascending order (1, 2, 3...).",
    "4. A wrong-order click counts against you, but the grid keeps going.",
    "5. Finish a grid and the next one appears - 5 grids per level.",
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
  levels: levels50((i) => ({
    label: `${Math.min(6, 3 + Math.floor(i / 12))} rings — ${ilerp50(750, 220, i)}ms flash`,
    parameters: { trials: 12, rings: Math.min(6, 3 + Math.floor(i / 12)), flashMs: ilerp50(750, 220, i), answerMs: ilerp50(2400, 1400, i) },
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
      // cue sits DEAD CENTER at eye height, slightly behind the ring circle
      trials.push({
        id: `${groupId}-cue`, spawnAt: t, duration: p.flashMs + p.answerMs, kind: "distractor", decor: true,
        zone: "center", position: [0, 1.45, -1.05], color: WHITE, shape: "diamond", scale: 0.004,
        label: cue, meta: { labelInside: true, labelColor: WHITE, labelSize: 0.07 },
      });
      for (let rIdx = 0; rIdx < p.rings; rIdx++) {
        const ang = (rIdx / p.rings) * Math.PI * 2 + rng() * 0.5;
        const pos: [number, number, number] = [Math.cos(ang) * 0.44, 1.45 + Math.sin(ang) * 0.32, -0.85];
        // character flashes INSIDE its ring
        trials.push({
          id: `${groupId}-f${rIdx}`, spawnAt: t, duration: p.flashMs, kind: "distractor", decor: true,
          zone: "center", position: [pos[0], pos[1], pos[2] + 0.015], color: GOLD, shape: "diamond", scale: 0.003,
          label: rIdx === matchIdx ? cue : CONFUSABLES[cue],
          meta: { labelInside: true, labelColor: GOLD, labelSize: 0.05 },
        });
        // strikeable ring (answer window opens after the flash)
        trials.push({
          id: `${groupId}-r${rIdx}`, spawnAt: t, duration: p.flashMs + p.answerMs,
          kind: rIdx === matchIdx ? "go" : "distractor",
          zone: "center", position: pos, color: TEAL, emissive: TEAL, shape: "ring", scale: 0.06, groupId,
          meta: { hitBoost: 0.02 },
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
