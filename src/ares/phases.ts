import { ARES_COLORS, ARES_ACCENTS } from "./colors";

/**
 * The A.R.E.S. Performance Loop.
 * Acquire → Route → Execute → Synchronize.
 * This vocabulary is canonical across the entire suite — never replace it
 * with generic phrasing.
 */
export type ARESPhase = "Acquire" | "Route" | "Execute" | "Synchronize";

export const ARES_PHASES: ARESPhase[] = [
  "Acquire",
  "Route",
  "Execute",
  "Synchronize",
];

export interface PhaseMeta {
  phase: ARESPhase;
  tagline: string;
  description: string;
  color: string;
  /** Angle (radians) of this phase's portal around the athlete in the arena. */
  portalAngle: number;
}

export const PHASE_META: Record<ARESPhase, PhaseMeta> = {
  Acquire: {
    phase: "Acquire",
    tagline: "Visual intake under pressure",
    description:
      "Target detection, peripheral awareness, contrast, glare, filtering, binocular input, visual search.",
    color: ARES_ACCENTS.tealBright,
    portalAngle: Math.PI * 0.25,
  },
  Route: {
    phase: "Route",
    tagline: "Processing & prediction",
    description:
      "Visual processing, spatial mapping, working memory, predictive recognition, central-peripheral integration, route selection.",
    color: ARES_ACCENTS.purpleGlow,
    portalAngle: Math.PI * 0.75,
  },
  Execute: {
    phase: "Execute",
    tagline: "Motor output & inhibition",
    description:
      "Reaction, choice reaction, motor output, bimanual coordination, inhibition, timing, speed-accuracy control.",
    color: ARES_COLORS.warningGold,
    portalAngle: Math.PI * 1.25,
  },
  Synchronize: {
    phase: "Synchronize",
    tagline: "Full-system integration",
    description:
      "Integration under load, fatigue, rhythm, chaos, sport-specific transfer, decision stability.",
    color: ARES_COLORS.errorRed,
    portalAngle: Math.PI * 1.75,
  },
};
