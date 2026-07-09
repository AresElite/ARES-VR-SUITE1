/**
 * ProgressionEngine — drill-side progression utilities.
 * The Goldilocks logic itself lives in src/ares/progression.ts so the VR
 * suite and the 55" touchscreen suite can share one adaptive brain.
 */
export { recommendProgression, ACTION_LABELS } from "@/ares/progression";
export type { ProgressionAction, ProgressionRecommendation } from "@/ares/progression";

import type { DrillDefinition, ProgressionLevel } from "@/ares/drillTypes";

export function levelFor(def: DrillDefinition, level: number): ProgressionLevel {
  return def.levels.find((l) => l.level === level) ?? def.levels[0];
}

export function clampLevel(def: DrillDefinition, level: number): number {
  return Math.min(def.levels.length, Math.max(1, level));
}
