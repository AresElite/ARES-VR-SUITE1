import type { AegisTier, AegisTuning, AegisMode, HandRule } from "./types";

/**
 * THE FIVE TIERS (§17). All are manually selectable from the start — no unlock
 * requirements. An elite athlete should never have to grind through Beginner to
 * be measured at GOAT, and a novice should never be told they are not allowed
 * to look at the thing they are training toward.
 *
 * The tiers do not simply scale speed. Each one changes WHAT IS BEING ASKED:
 *
 *   BEGINNER      one actionable object at a time. Wide windows, big targets,
 *                 fixed lanes, either-hand emphasis. Accuracy is everything.
 *   INTERMEDIATE  sequential coordination. Objects overlap in the air; hand
 *                 rules become asymmetric; bombs and no-gos enter.
 *   ADVANCED      simultaneous tracking. Directional blocking begins — passive
 *                 contact no longer scores like a driven interception.
 *   PRO           curved, decelerating, deceptive trajectories. Rule switching.
 *                 Minimum block velocity. Release-zone catches. Hesitation is
 *                 recorded and costs you.
 *   GOAT          full 3D adaptive trajectories, late vector changes, dense
 *                 simultaneous demands, small stimuli, short windows, minimal
 *                 assistance, maximum bonus escalation.
 */
export const TIER_TUNING: Record<AegisTier, AegisTuning> = {
  beginner: {
    speed: 3.0, targetSize: 0.105, spawnIntervalMs: 1500, maxSimultaneous: 1,
    bombRate: 0.0, nogoRate: 0.0, bonusRate: 0.05, togetherRate: 0.0, railRate: 0.0, eitherRate: 0.8,
    curveAmount: 0, lateVectorChange: 0, timingWindowMs: 420,
    minBlockSpeed: 0, requireDirection: false, retentionMs: 120, requireRelease: false,
    slowdownMs: 6000, slowdownFactor: 0.6, recoveryStreak: 3,
    failPlaneZ: 0.55, ruleSwitchRate: 0, hesitationPenalty: false,
    feedbackIntensity: 1.0, hapticIntensity: 1.0, durationMs: 300_000,
  },
  intermediate: {
    speed: 4.0, targetSize: 0.09, spawnIntervalMs: 1150, maxSimultaneous: 2,
    bombRate: 0.08, nogoRate: 0.07, bonusRate: 0.07, togetherRate: 0.09, railRate: 0.07, eitherRate: 0.4,
    curveAmount: 0.15, lateVectorChange: 0, timingWindowMs: 340,
    minBlockSpeed: 0, requireDirection: false, retentionMs: 180, requireRelease: false,
    slowdownMs: 5500, slowdownFactor: 0.65, recoveryStreak: 3,
    failPlaneZ: 0.55, ruleSwitchRate: 0, hesitationPenalty: false,
    feedbackIntensity: 0.8, hapticIntensity: 0.8, durationMs: 300_000,
  },
  advanced: {
    speed: 5.0, targetSize: 0.075, spawnIntervalMs: 900, maxSimultaneous: 3,
    bombRate: 0.11, nogoRate: 0.10, bonusRate: 0.08, togetherRate: 0.10, railRate: 0.08, eitherRate: 0.28,
    curveAmount: 0.4, lateVectorChange: 0.05, timingWindowMs: 280,
    minBlockSpeed: 0.6, requireDirection: true, retentionMs: 250, requireRelease: false,
    slowdownMs: 5000, slowdownFactor: 0.7, recoveryStreak: 4,
    failPlaneZ: 0.55, ruleSwitchRate: 0, hesitationPenalty: false,
    feedbackIntensity: 0.6, hapticIntensity: 0.6, durationMs: 300_000,
  },
  pro: {
    speed: 6.1, targetSize: 0.0638, spawnIntervalMs: 720, maxSimultaneous: 4,
    bombRate: 0.13, nogoRate: 0.12, bonusRate: 0.09, togetherRate: 0.12, railRate: 0.09, eitherRate: 0.22,
    curveAmount: 0.7, lateVectorChange: 0.18, timingWindowMs: 230,
    minBlockSpeed: 1.1, requireDirection: true, retentionMs: 320, requireRelease: true,
    slowdownMs: 4000, slowdownFactor: 0.75, recoveryStreak: 4,
    failPlaneZ: 0.55, ruleSwitchRate: 1.2, hesitationPenalty: true,
    feedbackIntensity: 0.35, hapticIntensity: 0.35, durationMs: 300_000,
  },
  goat: {
    speed: 7.3, targetSize: 0.0525, spawnIntervalMs: 560, maxSimultaneous: 6,
    bombRate: 0.15, nogoRate: 0.14, bonusRate: 0.10, togetherRate: 0.14, railRate: 0.10, eitherRate: 0.18,
    curveAmount: 1.0, lateVectorChange: 0.32, timingWindowMs: 185,
    minBlockSpeed: 1.5, requireDirection: true, retentionMs: 380, requireRelease: true,
    slowdownMs: 3000, slowdownFactor: 0.8, recoveryStreak: 5,
    failPlaneZ: 0.55, ruleSwitchRate: 2.2, hesitationPenalty: true,
    feedbackIntensity: 0.18, hapticIntensity: 0.2, durationMs: 300_000,
  },
};

export const TIER_ORDER: AegisTier[] = ["beginner", "intermediate", "advanced", "pro", "goat"];

export const TIER_LABEL: Record<AegisTier, string> = {
  beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced",
  pro: "Pro", goat: "GOAT",
};

/**
 * DIFFICULTY COEFFICIENT (§22). One global leaderboard across every tier, mode,
 * and hand rule means the coefficients have to carry the entire fairness burden.
 * A perfect Beginner run must not outrank a strong GOAT run — but a sloppy GOAT
 * run must not outrank a flawless Advanced one either. These are calibrated so
 * that equivalent *quality* at a higher tier always wins, and equivalent tier
 * always rewards quality.
 */
export const TIER_COEFF: Record<AegisTier, number> = {
  beginner: 1.0, intermediate: 1.45, advanced: 2.1, pro: 3.05, goat: 4.4,
};

/** Mixed mode adds an entire decision axis (which ACTION, not just which hand). */
export const MODE_COEFF: Record<AegisMode, number> = {
  block: 1.0, catch: 1.12, mixed: 1.35,
};

/** Asymmetric adds hand selection; adaptive adds rule reconfiguration under load. */
export const HANDRULE_COEFF: Record<HandRule, number> = {
  symmetric: 1.0, asymmetric: 1.2, adaptive: 1.45,
};

/** Mixed / adaptive are reserved for the top three tiers (§4, §5). */
export function modeAllowed(tier: AegisTier, mode: AegisMode): boolean {
  if (mode !== "mixed") return true;
  return tier === "advanced" || tier === "pro" || tier === "goat";
}
export function handRuleAllowed(tier: AegisTier, rule: HandRule): boolean {
  if (rule !== "adaptive") return true;
  return tier === "pro" || tier === "goat";
}

export function tuningFor(tier: AegisTier, custom?: Partial<AegisTuning>): AegisTuning {
  return { ...TIER_TUNING[tier], ...(custom ?? {}) };
}
