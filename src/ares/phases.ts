import { ARES_COLORS, ARES_ACCENTS } from "./colors";

/**
 * The A.R.E.S. Performance Loop.
 * Acquire → Route → Execute → Synchronize.
 * This vocabulary is canonical across the entire suite — never replace it
 * with generic phrasing.
 */
export type ARESPhase = "Acquire" | "Route" | "Execute" | "Synchronize" | "Assess" | "Perform" | "Sport";

/** The four training phases of the Performance Loop. */
export const ARES_PHASES: ARESPhase[] = [
  "Acquire",
  "Route",
  "Execute",
  "Synchronize",
];

/** All portals in the arena — the Loop plus the Assess baseline suite. */
export const ARES_ALL_PHASES: ARESPhase[] = ["Assess", ...ARES_PHASES, "Perform", "Sport"];

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
    color: "#2998AA",
    portalAngle: -0.72,
  },
  Route: {
    phase: "Route",
    tagline: "Processing & prediction",
    description:
      "Visual processing, spatial mapping, working memory, predictive recognition, central-peripheral integration, route selection.",
    color: ARES_ACCENTS.purpleGlow,
    portalAngle: -0.36,
  },
  Execute: {
    phase: "Execute",
    tagline: "Motor output & inhibition",
    description:
      "Reaction, choice reaction, motor output, bimanual coordination, inhibition, timing, speed-accuracy control.",
    color: "#7FD3DE",
    portalAngle: 0.0,
  },
  Assess: {
    phase: "Assess",
    tagline: "Performance baseline testing",
    description:
      "Standardized reaction, eye-hand, color discrimination, depth, and eye-movement performance baselines. Fixed protocols, repeatable numbers, training-design inputs.",
    color: "#EAF0FF",
    portalAngle: -1.08,
  },
  Perform: {
    phase: "Perform",
    tagline: "Beat-locked flow training",
    description:
      "The measured track ladder: beat-mapped choreography where notes arrive on the musical beat. Timing precision, hand coordination, and flow under rising demand.",
    color: "#A78BFA",
    portalAngle: 0.72,
  },
  Sport: {
    phase: "Sport",
    tagline: "Sport-specific training suites",
    description:
      "Curated top-7 drill suites per sport — Soccer, Volleyball, Hockey, Auto Racing — each tuned to the visual-cognitive skills that sport lives on.",
    color: "#1A6B78",
    portalAngle: 1.08,
  },
  Synchronize: {
    phase: "Synchronize",
    tagline: "Full-system integration",
    description:
      "Integration under load, fatigue, rhythm, chaos, sport-specific transfer, decision stability.",
    color: "#C4B5FD",
    portalAngle: 0.36,
  },
};


/**
 * TOP-LEVEL ARENA GROUPS — the three portals the athlete sees first.
 * Assess (baseline), A.R.E.S. Training (the Loop phases + Sport), Perform.
 * Phases still drive drill lists; groups are the front-door hierarchy.
 */
export type ArenaGroupId = "assess" | "training" | "perform";

export interface ArenaGroup {
  id: ArenaGroupId;
  label: string;
  tagline: string;
  color: string;
  portalAngle: number;
}

export const ARENA_GROUPS: ArenaGroup[] = [
  { id: "assess", label: "Assess", tagline: "Performance baseline testing", color: "#EAF0FF", portalAngle: -0.52 },
  { id: "training", label: "A.R.E.S. Training", tagline: "Acquire · Route · Execute · Synchronize · Sport", color: "#8B5CF6", portalAngle: 0 },
  { id: "perform", label: "Perform", tagline: "Synch · AEGIS · Sequence Command", color: "#1A6B78", portalAngle: 0.52 },
];

/** the four Performance-Loop training phases (live inside A.R.E.S. Training) */
export const TRAINING_PHASES: ARESPhase[] = ["Acquire", "Route", "Execute", "Synchronize"];

export function groupForPhase(phase: ARESPhase): ArenaGroupId {
  if (phase === "Assess") return "assess";
  if (phase === "Perform") return "perform";
  return "training"; // Acquire/Route/Execute/Synchronize/Sport
}
