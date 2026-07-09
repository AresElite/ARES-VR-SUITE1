import { ARES_COLORS, ARES_ACCENTS } from "./colors";

/**
 * The A.R.E.S. Performance Loop.
 * Acquire → Route → Execute → Synchronize.
 * This vocabulary is canonical across the entire suite — never replace it
 * with generic phrasing.
 */
export type ARESPhase = "Acquire" | "Route" | "Execute" | "Synchronize" | "Assess" | "Perform";

/** The four training phases of the Performance Loop. */
export const ARES_PHASES: ARESPhase[] = [
  "Acquire",
  "Route",
  "Execute",
  "Synchronize",
];

/** All portals in the arena — the Loop plus the Assess baseline suite. */
export const ARES_ALL_PHASES: ARESPhase[] = ["Assess", ...ARES_PHASES, "Perform"];

export interface PhaseMeta {
  phase: ARESPhase;
  tagline: string;
  description: string;
  color: string;
  /** Angle (radians) of the portal in the FRONT arc — the athlete never
      turns around: all four portals are selectable while facing forward. */
  portalAngle: number;
}

export const PHASE_META: Record<ARESPhase, PhaseMeta> = {
  Acquire: {
    phase: "Acquire",
    tagline: "Visual intake under pressure",
    description:
      "Target detection, peripheral awareness, contrast, glare, filtering, binocular input, visual search.",
    color: ARES_ACCENTS.tealBright,
    portalAngle: -0.54,
  },
  Route: {
    phase: "Route",
    tagline: "Processing & prediction",
    description:
      "Visual processing, spatial mapping, working memory, predictive recognition, central-peripheral integration, route selection.",
    color: ARES_ACCENTS.purpleGlow,
    portalAngle: -0.18,
  },
  Execute: {
    phase: "Execute",
    tagline: "Motor output & inhibition",
    description:
      "Reaction, choice reaction, motor output, bimanual coordination, inhibition, timing, speed-accuracy control.",
    color: ARES_COLORS.warningGold,
    portalAngle: 0.18,
  },
  Assess: {
    phase: "Assess",
    tagline: "Performance baseline testing",
    description:
      "Standardized reaction, eye-hand, color discrimination, depth, and eye-movement performance baselines. Fixed protocols, repeatable numbers, training-design inputs.",
    color: "#EAF0FF",
    portalAngle: -0.9,
  },
  Perform: {
    phase: "Perform",
    tagline: "Beat-locked flow training",
    description:
      "The measured track ladder: beat-mapped choreography where notes arrive on the musical beat. Timing precision, hand coordination, and flow under rising demand.",
    color: "#F472B6",
    portalAngle: 0.9,
  },
  Synchronize: {
    phase: "Synchronize",
    tagline: "Full-system integration",
    description:
      "Integration under load, fatigue, rhythm, chaos, sport-specific transfer, decision stability.",
    color: ARES_COLORS.errorRed,
    portalAngle: 0.54,
  },
};
