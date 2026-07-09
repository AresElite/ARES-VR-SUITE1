import type { DrillDefinition, TrialSpec } from "@/ares/drillTypes";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { EYE_Y } from "../shared/zones";

/**
 * ROUTE — Working Memory Grid VR (scaffolded prototype)
 * A cue diamond flashes gold at one grid cell; after a retention delay the
 * grid fills, and only the remembered cell is the correct strike.
 */
interface Params {
  rounds: number;
  gridSize: number; // grid is gridSize x gridSize
  cueMs: number;
  delayMs: number;
  responseMs: number;
  gapMs: number;
  [k: string]: unknown;
}

export const WorkingMemoryGridVR: DrillDefinition = {
  id: "working-memory-grid",
  name: "Working Memory Grid VR",
  shortName: "Memory Grid",
  phase: "Route",
  description:
    "A gold cue flashes on the grid, disappears, and the full grid lights up after a delay. Strike only the remembered cell.",
  purpose: "Spatial working memory under retention delay.",
  interaction: "touch",
  instructions: [
    "1. A GOLD diamond flashes on one cell of the grid — burn its position into memory.",
    "2. The grid goes dark. Hold the position in your mind through the delay.",
    "3. When the full grid lights up purple, TAP the cell where the gold diamond was.",
    "4. One tap only — your first touch is your answer.",
  ],
  controlsHint: "REMEMBER THE GOLD CELL - TAP IT WHEN THE GRID RETURNS",
  environment: "arena",
  mvp: false,
  levels: [
    { level: 1, label: "Level 1 — 3×3, short delay", parameters: { rounds: 10, gridSize: 3, cueMs: 700, delayMs: 1000, responseMs: 2000, gapMs: 1200 } },
    { level: 2, label: "Level 2 — 3×3, long delay", parameters: { rounds: 12, gridSize: 3, cueMs: 600, delayMs: 2000, responseMs: 1800, gapMs: 1100 } },
    { level: 3, label: "Level 3 — 4×4", parameters: { rounds: 12, gridSize: 4, cueMs: 550, delayMs: 2200, responseMs: 1600, gapMs: 1000 } },
  ],
  buildTrials: (params, rng) => {
    const p = params as Params;
    const trials: TrialSpec[] = [];
    let t = 1500;
    const cell = 0.17;
    const origin = -((p.gridSize - 1) * cell) / 2;
    for (let r = 0; r < p.rounds; r++) {
      const cueIdx = Math.floor(rng() * p.gridSize * p.gridSize);
      const cx = cueIdx % p.gridSize;
      const cy = Math.floor(cueIdx / p.gridSize);
      const posOf = (x: number, y: number): [number, number, number] => [
        origin + x * cell,
        EYE_Y - 0.35 + y * cell,
        -0.62,
      ];
      // Cue flash (not interactive-scored: distractor kind, brief)
      trials.push({
        id: `wm-${r}-cue`,
        spawnAt: t,
        duration: p.cueMs,
        kind: "distractor",
        zone: "center",
        position: posOf(cx, cy),
        color: ARES_COLORS.warningGold,
        emissive: ARES_COLORS.warningGold,
        shape: "diamond",
        scale: 0.1,
      });
      // Response field after retention delay
      const respAt = t + p.cueMs + p.delayMs;
      const groupId = `wm-g${r}`;
      for (let y = 0; y < p.gridSize; y++) {
        for (let x = 0; x < p.gridSize; x++) {
          const isCue = x === cx && y === cy;
          trials.push({
            id: `${groupId}-${x}-${y}`,
            spawnAt: respAt,
            duration: p.responseMs,
            kind: isCue ? "go" : "distractor",
            zone: "center",
            position: posOf(x, y),
            color: ARES_ACCENTS.purpleGlow,
            emissive: ARES_COLORS.deepPurple,
            shape: "box",
            scale: 0.09,
            groupId,
          });
        }
      }
      t = respAt + p.responseMs + p.gapMs;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as Params;
    return 1500 + p.rounds * (p.cueMs + p.delayMs + p.responseMs + p.gapMs) + 1500;
  },
};
