import type { DrillDefinition } from "@/ares/drillTypes";
import { GoNoGo } from "../execute/ExecuteDrills";
import { SternbergDigits, FlankerCompatibility } from "../route/RouteDrills";

/**
 * ASSESS — adopted baseline protocols.
 * Level-1 versions of core training drills, run as fixed standardized
 * protocols so every athlete baselines on the identical stimulus set.
 * Same mechanics as the training drills; single locked level.
 */
function asBaseline(src: DrillDefinition, id: string, name: string, shortName: string): DrillDefinition {
  return {
    ...src,
    id,
    name,
    shortName,
    phase: "Assess",
    assessment: true,
    mvp: true,
    description: `${src.description} BASELINE PROTOCOL: fixed Level-1 parameters for repeatable session-to-session comparison.`,
    levels: [{ level: 1, label: "Standard Protocol (Level 1)", parameters: src.levels[0].parameters }],
  };
}

export const GoNoGoBaseline = asBaseline(GoNoGo, "assess-go-no-go", "Go/No Go (Baseline L1)", "Go/No Go Baseline");
export const FlankerBaseline = asBaseline(
  FlankerCompatibility,
  "assess-flanker",
  "Flanker Compatibility (Baseline L1)",
  "Flanker Baseline",
);
export const SternbergDigitsBaseline = asBaseline(
  SternbergDigits,
  "assess-sternberg-digits",
  "Sternberg Digits (Baseline L1)",
  "Sternberg Baseline",
);

export const ASSESS_ADOPTED = [GoNoGoBaseline, FlankerBaseline, SternbergDigitsBaseline];
