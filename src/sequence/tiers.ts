import type { SeqTier, SeqTuning, SeqMode } from "./types";
import { QUADRANTS, WIDE_ARC, DEEP_ARC } from "./types";

/**
 * THE FIVE TIERS (§6). Each has a VERB, and the verb is the whole design:
 *
 *   BEGINNER      ENCODE     learn what a cue means and which hand it wants
 *   INTERMEDIATE  HOLD       carry it across a delay, and play it on a beat
 *   ADVANCED      TRANSFORM  the command now CHANGES the plan you encoded
 *   PRO           UPDATE     and it changes it again, DURING execution
 *   GOAT          INTEGRATE  two streams, both updating, on different clocks
 *
 * Difficulty deliberately does NOT scale primarily on sequence length (§11).
 * Longer lists only measure span, and span saturates fast in trained athletes.
 * The real load comes from delay, interference, transformation, remapping,
 * competing streams, and live updating — every one of which is a separate knob
 * below, and every one of which the adaptive engine can move independently.
 */
export const TIER_TUNING: Record<SeqTier, SeqTuning> = {
  // ENCODE — one cue at a time, no delay, no rules. Just: what does this mean.
  beginner: {
    seqLenMin: 2, seqLenMax: 3,
    cueDisplayMs: 1100, cueGapMs: 420,
    delayMinMs: 0, delayMaxMs: 0, interference: 0,
    distractorRate: 0, salientConflict: 0,
    commandMs: 99_999, commandPersists: true,   // the rule never leaves the screen
    previewMs: 1400,                            // full preview of the resolved plan
    tempoMs: 0,                                 // SELF-PACED. No clock at all.
    timingWindowMs: 900,
    transformRate: 0, transformDepth: 1,
    branchRate: 0, replaceRate: 0, chunkRate: 0, checkpointRate: 0, liveUpdateRate: 0,
    dualStream: false, asyncStreams: false,
    movingRate: 0, pendingRate: 0, inferRate: 0, crossBodyRate: 0,
    bands: ["mid"], cueZones: QUADRANTS, streams: 1,
    feedback: 1.0, haptics: 1.0, durationMs: 300_000,
  },
  // HOLD — a delay appears, and a beat appears. Retention plus rhythm.
  intermediate: {
    seqLenMin: 3, seqLenMax: 5,
    cueDisplayMs: 820, cueGapMs: 320,
    delayMinMs: 900, delayMaxMs: 900, interference: 0.1,
    distractorRate: 0.05, salientConflict: 0,
    commandMs: 1400, commandPersists: false,    // the rule fades once you start
    previewMs: 650,
    tempoMs: 750,                               // fixed rhythm
    timingWindowMs: 420,
    transformRate: 0.25, transformDepth: 1,     // repeat only
    branchRate: 0, replaceRate: 0, chunkRate: 0, checkpointRate: 0, liveUpdateRate: 0,
    dualStream: false, asyncStreams: false,
    movingRate: 0, pendingRate: 0, inferRate: 0, crossBodyRate: 0,
    bands: ["mid"], cueZones: QUADRANTS, streams: 1,
    feedback: 0.8, haptics: 0.8, durationMs: 300_000,
  },
  // TRANSFORM — two sequences compete, the command picks one and rewrites it.
  advanced: {
    seqLenMin: 4, seqLenMax: 6,
    cueDisplayMs: 600, cueGapMs: 240,
    delayMinMs: 800, delayMaxMs: 1800, interference: 0.35,
    distractorRate: 0.12, salientConflict: 0.15,
    commandMs: 950, commandPersists: false,
    previewMs: 300,                             // partial preview only
    tempoMs: 620,
    timingWindowMs: 330,
    transformRate: 0.55, transformDepth: 1,     // + reverse
    branchRate: 0.2, replaceRate: 0.15, chunkRate: 0.2, checkpointRate: 0.25, liveUpdateRate: 0,
    dualStream: false, asyncStreams: false,
    movingRate: 0.25, pendingRate: 0.2, inferRate: 0.1, crossBodyRate: 0.2,
    bands: ["high", "mid", "low"], cueZones: WIDE_ARC, streams: 2,
    feedback: 0.6, haptics: 0.6, durationMs: 300_000,
  },
  // UPDATE — the plan you committed to changes while you are executing it.
  pro: {
    seqLenMin: 5, seqLenMax: 7,
    cueDisplayMs: 440, cueGapMs: 170,
    delayMinMs: 700, delayMaxMs: 2600, interference: 0.6,   // unpredictable delay
    distractorRate: 0.2, salientConflict: 0.3,
    commandMs: 700, commandPersists: false,
    previewMs: 0,                               // NO PREVIEW. You hold it yourself.
    tempoMs: 520,
    timingWindowMs: 260,
    transformRate: 0.7, transformDepth: 2,      // + mirror, skip, replace
    branchRate: 0.35, replaceRate: 0.3, chunkRate: 0.35, checkpointRate: 0.4, liveUpdateRate: 0.3,
    dualStream: true, asyncStreams: false,
    movingRate: 0.4, pendingRate: 0.4, inferRate: 0.2, crossBodyRate: 0.35,
    bands: ["high", "mid", "low"], cueZones: DEEP_ARC, streams: 2,
    feedback: 0.35, haptics: 0.35, durationMs: 300_000,
  },
  // INTEGRATE — two streams, two clocks, both updating, minimal feedback.
  goat: {
    seqLenMin: 6, seqLenMax: 9,
    cueDisplayMs: 320, cueGapMs: 110,
    delayMinMs: 600, delayMaxMs: 3200, interference: 0.85,
    distractorRate: 0.26, salientConflict: 0.42,
    commandMs: 480, commandPersists: false,     // the command is a flicker
    previewMs: 0,
    tempoMs: 420,
    timingWindowMs: 200,
    transformRate: 0.85, transformDepth: 2,     // stacked: mirror+skip, repeat+reverse
    branchRate: 0.5, replaceRate: 0.45, chunkRate: 0.5, checkpointRate: 0.5, liveUpdateRate: 0.5,
    dualStream: true, asyncStreams: true,       // the hands run on DIFFERENT clocks
    movingRate: 0.55, pendingRate: 0.55, inferRate: 0.3, crossBodyRate: 0.45,
    bands: ["high", "mid", "low"], cueZones: DEEP_ARC, streams: 2,
    feedback: 0.18, haptics: 0.2, durationMs: 300_000,
  },
};

export const TIER_ORDER: SeqTier[] = ["beginner", "intermediate", "advanced", "pro", "goat"];
export const TIER_LABEL: Record<SeqTier, string> = {
  beginner: "Beginner · Encode",
  intermediate: "Intermediate · Hold",
  advanced: "Advanced · Transform",
  pro: "Pro · Update",
  goat: "GOAT · Integrate",
};
export const TIER_VERB: Record<SeqTier, string> = {
  beginner: "ENCODE", intermediate: "HOLD", advanced: "TRANSFORM",
  pro: "UPDATE", goat: "INTEGRATE",
};

/**
 * TIER COEFFICIENTS (§37). One difficulty-weighted board across every tier, so
 * these carry the fairness burden alone. They are steeper than AEGIS's because
 * the demand curve here is steeper: the jump from Advanced to Pro is not "a bit
 * faster", it is "the plan now changes while your arm is already moving", and
 * the board has to say so.
 */
export const TIER_COEFF: Record<SeqTier, number> = {
  beginner: 1.0, intermediate: 1.6, advanced: 2.6, pro: 4.0, goat: 6.0,
};

/** Assessment is fixed and repeatable — and therefore never ranked (§33, §37). */
export const MODE_RANKED: Record<SeqMode, boolean> = { training: true, assessment: false };

export function tuningFor(tier: SeqTier, mode: SeqMode, custom?: Partial<SeqTuning>): SeqTuning {
  const base = { ...TIER_TUNING[tier], ...(custom ?? {}) };
  if (mode === "assessment") {
    /**
     * ASSESSMENT MODE (§33). Everything that varies is FROZEN. A baseline is
     * worthless if the protocol moved between the pre and the post — so the
     * retention delay is fixed rather than sampled, and nothing adapts. What is
     * left is a fixed standardized battery whose only variable is the athlete.
     */
    const fixedDelay = Math.round((base.delayMinMs + base.delayMaxMs) / 2);
    return { ...base, delayMinMs: fixedDelay, delayMaxMs: fixedDelay, durationMs: 240_000 };
  }
  return base;
}
