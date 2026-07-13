import type { KeyTier, KeyTuning, KeyMode } from "./types";

/**
 * THE FIVE TIERS (§6). Each has a verb, and the verb is the design:
 *
 *   BEGINNER      ALIGN        one clear stimulus, symmetrical, wide windows.
 *                              Learn what a coordinated position feels like.
 *   INTERMEDIATE  COORDINATE   the two sides take DIFFERENT roles. One moves
 *                              while the other holds still — which is much
 *                              harder than it sounds, and is the foundation.
 *   ADVANCED      INTEGRATE    pose + rhythm + force become one task. Head,
 *                              torso and arms can be told different things.
 *   PRO           ADAPT        the pattern changes WHILE you are executing it.
 *                              Prepared movements must be cancelled.
 *   GOAT          SYNCHRONIZE  four segments, four roles, two clocks, live rule
 *                              changes, almost no feedback.
 *
 * Note what does NOT scale much: raw speed. Difficulty here comes from the
 * number of segments carrying independent roles, from conflict between those
 * roles, and from how tight the athlete must be to STOP. Simply moving faster
 * would just measure arm speed.
 */
export const TIER_TUNING: Record<KeyTier, KeyTuning> = {
  // ALIGN — both hands, together, slowly, with a generous place to land.
  beginner: {
    stimulusSpeed: 0.55, prepMs: 1400, timingWindowMs: 620,
    endpointTolM: 0.22, holdMs: 500, stabilityTolM: 0.09,
    phasesMin: 1, phasesMax: 1,
    asymmetry: 0, headInvolve: 0.15, torsoInvolve: 0, headHandConflict: 0,
    rhythmVariance: 0, forceRate: 0, forceCurve: 0,
    transformRate: 0, inhibitRate: 0, falsePulseRate: 0,
    transitionRate: 0, desyncRate: 0, asyncStreams: false,
    predictiveMix: 1.0, simultaneous: 1,
    feedback: 1.0, haptics: 1.0, durationMs: 300_000,
  },
  // COORDINATE — one side works, the other must be STILL. The foundation.
  intermediate: {
    stimulusSpeed: 0.75, prepMs: 1050, timingWindowMs: 480,
    endpointTolM: 0.18, holdMs: 700, stabilityTolM: 0.07,
    phasesMin: 1, phasesMax: 2,
    asymmetry: 0.45, headInvolve: 0.35, torsoInvolve: 0.15, headHandConflict: 0,
    rhythmVariance: 0.15, forceRate: 0, forceCurve: 0,
    transformRate: 0.2, inhibitRate: 0.06, falsePulseRate: 0,
    transitionRate: 0.15, desyncRate: 0.1, asyncStreams: false,
    predictiveMix: 0.85, simultaneous: 1,
    feedback: 0.8, haptics: 0.8, durationMs: 300_000,
  },
  // INTEGRATE — pose, rhythm and force collapse into a single task.
  advanced: {
    stimulusSpeed: 1.0, prepMs: 800, timingWindowMs: 380,
    endpointTolM: 0.14, holdMs: 900, stabilityTolM: 0.055,
    phasesMin: 2, phasesMax: 3,
    asymmetry: 0.6, headInvolve: 0.55, torsoInvolve: 0.35, headHandConflict: 0.2,
    rhythmVariance: 0.4, forceRate: 0.35, forceCurve: 0.3,
    transformRate: 0.45, inhibitRate: 0.1, falsePulseRate: 0.08,
    transitionRate: 0.35, desyncRate: 0.2, asyncStreams: false,
    predictiveMix: 0.6, simultaneous: 2,
    feedback: 0.6, haptics: 0.6, durationMs: 300_000,
  },
  // ADAPT — the plan mutates mid-movement. Cancellation becomes routine.
  pro: {
    stimulusSpeed: 1.25, prepMs: 600, timingWindowMs: 300,
    endpointTolM: 0.11, holdMs: 1100, stabilityTolM: 0.04,
    phasesMin: 2, phasesMax: 4,
    asymmetry: 0.7, headInvolve: 0.7, torsoInvolve: 0.5, headHandConflict: 0.4,
    rhythmVariance: 0.65, forceRate: 0.5, forceCurve: 0.6,
    transformRate: 0.65, inhibitRate: 0.14, falsePulseRate: 0.18,
    transitionRate: 0.55, desyncRate: 0.3, asyncStreams: false,
    predictiveMix: 0.45, simultaneous: 3,
    feedback: 0.35, haptics: 0.35, durationMs: 300_000,
  },
  // SYNCHRONIZE — four segments, four roles, two clocks, live changes.
  goat: {
    stimulusSpeed: 1.5, prepMs: 440, timingWindowMs: 235,
    endpointTolM: 0.09, holdMs: 1300, stabilityTolM: 0.03,
    phasesMin: 3, phasesMax: 6,
    asymmetry: 0.8, headInvolve: 0.85, torsoInvolve: 0.65, headHandConflict: 0.55,
    rhythmVariance: 0.85, forceRate: 0.6, forceCurve: 0.85,
    transformRate: 0.8, inhibitRate: 0.16, falsePulseRate: 0.28,
    transitionRate: 0.75, desyncRate: 0.4, asyncStreams: true,
    predictiveMix: 0.3, simultaneous: 4,
    feedback: 0.18, haptics: 0.2, durationMs: 300_000,
  },
};

export const TIER_ORDER: KeyTier[] = ["beginner", "intermediate", "advanced", "pro", "goat"];
export const TIER_VERB: Record<KeyTier, string> = {
  beginner: "ALIGN", intermediate: "COORDINATE", advanced: "INTEGRATE",
  pro: "ADAPT", goat: "SYNCHRONIZE",
};
export const TIER_LABEL: Record<KeyTier, string> = {
  beginner: "Beginner · Align",
  intermediate: "Intermediate · Coordinate",
  advanced: "Advanced · Integrate",
  pro: "Pro · Adapt",
  goat: "GOAT · Synchronize",
};

/**
 * TIER COEFFICIENTS (§34). One difficulty-weighted board, so these carry the
 * fairness burden alone. The curve is steep because the demand curve is steep:
 * the step from Intermediate to Advanced is not "faster", it is "your head, your
 * torso and your two arms are now four independent instruments."
 */
export const TIER_COEFF: Record<KeyTier, number> = {
  beginner: 1.0, intermediate: 1.7, advanced: 2.8, pro: 4.3, goat: 6.5,
};

export const MODE_RANKED: Record<KeyMode, boolean> = { training: true, assessment: false };

export function tuningFor(tier: KeyTier, mode: KeyMode, custom?: Partial<KeyTuning>): KeyTuning {
  const base = { ...TIER_TUNING[tier], ...(custom ?? {}) };
  if (mode === "assessment") {
    /**
     * ASSESSMENT MODE (§28). Everything that varies is FROZEN. A baseline whose
     * protocol drifted between the pre and the post measures nothing. So the
     * rhythm becomes a metronome, the predictive/reactive mix is pinned, and
     * nothing adapts. The only variable left in the room is the athlete.
     */
    return {
      ...base,
      rhythmVariance: 0,
      predictiveMix: 0.5,      // a fixed, counterbalanced 50/50 split
      falsePulseRate: base.falsePulseRate > 0 ? 0.1 : 0,
      durationMs: 240_000,
    };
  }
  return base;
}
