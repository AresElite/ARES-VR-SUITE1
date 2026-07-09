import type { SessionMetrics } from "@/data/schemas";
import type { ARESPhase } from "./phases";

export type ProgressionAction =
  | "progress"
  | "stay"
  | "regress"
  | "repeatLessNoise"
  | "addPeripheralDemand"
  | "addMemoryLoad"
  | "addInhibitionLoad"
  | "addBimanualDemand"
  | "addFatigueLoad"
  | "moveToSynchronized";

export interface ProgressionRecommendation {
  action: ProgressionAction;
  headline: string;
  detail: string;
  goldilocks: "underloaded" | "inZone" | "overloaded";
  suggestedLevel: number;
  secondary: ProgressionAction[];
}

/**
 * The Goldilocks Zone engine.
 *  - Too easy  → athlete is underloaded (accuracy very high, RT fast, no drift)
 *  - Too hard  → athlete is guessing or breaking down (accuracy low, discipline errors)
 *  - In zone   → challenged but producing usable, trainable reps
 */
export function recommendProgression(
  phase: ARESPhase,
  metrics: SessionMetrics,
  currentLevel: number,
  maxLevel: number,
): ProgressionRecommendation {
  const acc = metrics.accuracyPct;
  const t = Math.max(1, metrics.trials);
  const disciplineRate =
    ((metrics.falseStarts ?? 0) + (metrics.noGoFailures ?? 0) + (metrics.wrongHandErrors ?? 0)) / t;
  const drift = metrics.fatigueDriftPct ?? 0;
  const periphMissRate = (metrics.peripheralMisses ?? 0) / t;

  const secondary: ProgressionAction[] = [];

  // Breakdown signals → regress / clean the signal
  if (acc < 55 || disciplineRate > 0.25) {
    const action: ProgressionAction = disciplineRate > 0.25 ? "repeatLessNoise" : "regress";
    return {
      action,
      goldilocks: "overloaded",
      suggestedLevel: Math.max(1, currentLevel - 1),
      headline: action === "regress" ? "Regress one level" : "Repeat with less noise",
      detail:
        action === "regress"
          ? `Accuracy ${acc}% is below the trainable floor — the athlete is guessing, not routing. Drop one level to restore usable reps.`
          : `Discipline errors (false starts / no-go failures / wrong-hand) at ${Math.round(disciplineRate * 100)}% of trials. Strip distractors and rebuild the rule before reloading.`,
      secondary: ["regress"],
    };
  }

  // Underload signals → progress or add a specific demand
  if (acc >= 88 && disciplineRate < 0.08 && drift < 10) {
    if (periphMissRate < 0.05) secondary.push("addPeripheralDemand");
    if ((metrics.noGoFailures ?? 0) === 0) secondary.push("addInhibitionLoad");
    if ((metrics.wrongHandErrors ?? 0) === 0) secondary.push("addBimanualDemand");
    secondary.push("addMemoryLoad");
    if (phase !== "Synchronize" && currentLevel >= maxLevel)
      secondary.push("moveToSynchronized");

    const atCeiling = currentLevel >= maxLevel;
    return {
      action: atCeiling ? "moveToSynchronized" : "progress",
      goldilocks: "underloaded",
      suggestedLevel: Math.min(maxLevel, currentLevel + 1),
      headline: atCeiling ? "Move to synchronized work" : "Progress one level",
      detail: atCeiling
        ? `Accuracy ${acc}% at the top level of this drill — the isolated stimulus is no longer loading the system. Transfer this pattern into Synchronize-phase integration.`
        : `Accuracy ${acc}% with clean discipline and stable timing — the athlete is underloaded. Advance to keep the adaptation window open.`,
      secondary,
    };
  }

  // Fatigue-dominant pattern
  if (drift >= 20 && acc >= 65) {
    return {
      action: "addFatigueLoad",
      goldilocks: "inZone",
      suggestedLevel: currentLevel,
      headline: "Train the drift",
      detail: `Timing slowed ${drift}% across the run while accuracy held — fatigue resistance is the current bottleneck. Repeat at this level and extend duration before raising difficulty.`,
      secondary: ["stay"],
    };
  }

  // In the zone
  return {
    action: "stay",
    goldilocks: "inZone",
    suggestedLevel: currentLevel,
    headline: "Stay at this level",
    detail: `Accuracy ${acc}% with ${Math.round(disciplineRate * 100)}% discipline errors — this is the Goldilocks Zone. The athlete is challenged but every rep is trainable. Accumulate volume here before progressing.`,
    secondary: acc >= 80 ? ["progress"] : [],
  };
}

export const ACTION_LABELS: Record<ProgressionAction, string> = {
  progress: "Progress",
  stay: "Stay",
  regress: "Regress",
  repeatLessNoise: "Repeat • less noise",
  addPeripheralDemand: "Add peripheral demand",
  addMemoryLoad: "Add memory load",
  addInhibitionLoad: "Add inhibition load",
  addBimanualDemand: "Add bimanual demand",
  addFatigueLoad: "Add fatigue load",
  moveToSynchronized: "Move to synchronized drill",
};
