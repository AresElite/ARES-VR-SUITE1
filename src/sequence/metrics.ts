import type { SeqEvent, SeqSettings, BreakdownSource } from "./types";
import { TRANSFORM_COMMANDS } from "./types";
import { TIER_COEFF, MODE_RANKED } from "./tiers";
import type { SequenceEngine } from "./SequenceEngine";

/**
 * METRIC DICTIONARY (§39) + COMPOSITE INDICES (§40).
 *
 * Every number here is derived from recorded events. Where a metric is a
 * composite, the formula is stated in full so a coach — or a sceptical sports
 * scientist — can read exactly what it is made of and decide what it is worth.
 * These are performance descriptors from this drill. They are not diagnoses.
 */

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const sd = (v: number[]) => {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
};
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const rate = (n: number, d: number) => (d ? n / d : 1);

export interface SeqMetrics {
  // ---- headline (§38)
  score: number;
  sequenceAccuracyPct: number;      // share of sequences completed PERFECTLY
  avgDecisionToActionMs: number;    // the primary metric (§35)
  longestPerfectStreak: number;
  workingMemorySpan: number;        // longest sequence length held at >=80%
  handSelectionAccPct: number;
  bonusStage: number;

  // ---- expanded (§39)
  sequences: number; perfect: number;
  actionAccuracyPct: number;
  orderAccPct: number; timingAccPct: number; spatialAccPct: number;
  transformationAccPct: number; branchAccPct: number; replacementAccPct: number;
  inhibitionAccPct: number; antiSaccadicAccPct: number;
  dualStreamAccPct: number; crossStreamIntrusions: number;
  pendingRetentionPct: number; predictionAccPct: number;
  criticalErrors: number; skipped: number; extra: number;
  leftRT: number; rightRT: number; leftRightBalancePct: number;
  timingSD: number; iaiSD: number;
  recoveryEvents: number; avgRecoveryMs: number; postRecoveryAccPct: number;
  peakComplexity: number; bonusDurationMs: number; failCause?: string;
  breakdowns: Record<BreakdownSource, number>;
  weakestDomain?: BreakdownSource;

  // ---- composite indices (§40)
  sequenceIntegration: number;
  peripheralToCentral: number;
  workingMemoryCapacity: number;
  bilateralSequencing: number;
  inhibitionControl: number;
  cognitiveFlexibility: number;
  temporalPrecision: number;
  recoveryResilience: number;
  eliteBreakdownPoint: number | null;

  compositeRating: number;
  ranked: boolean;
}

export function computeSeqMetrics(e: SequenceEngine, s: SeqSettings): SeqMetrics {
  const ev = e.events;
  const acts = ev.filter((x) => x.slot >= 0);
  const correct = acts.filter((x) => x.correct);

  const outc = (o: string) => acts.filter((x) => x.outcome === o).length;
  const crit = acts.filter((x) => x.critical).length;

  // The primary metric: central decision cue -> movement initiation (§35).
  const d2a = acts.filter((x) => x.decisionToMoveMs !== undefined).map((x) => x.decisionToMoveMs!);
  const avgDecisionToActionMs = Math.round(mean(d2a));

  const rtFor = (h: "left" | "right") =>
    Math.round(mean(acts.filter((x) => x.actualHand === h && x.correct && x.decisionToMoveMs !== undefined)
      .map((x) => x.decisionToMoveMs!)));
  const leftRT = rtFor("left");
  const rightRT = rtFor("right");

  const leftN = correct.filter((x) => x.actualHand === "left").length;
  const rightN = correct.filter((x) => x.actualHand === "right").length;

  const wrongHand = outc("wrongHand");
  const handSelectionAcc = rate(acts.length - wrongHand, acts.length);

  // ---- domain-specific accuracies. Each is computed ONLY over the trials that
  // actually posed that demand — an athlete who never saw a transformation does
  // not get a 100% transformation score for free.
  const tf = acts.filter((x) => x.transformed);
  const transformationAccPct = pct(tf.filter((x) => x.correct).length, tf.length);

  const br = acts.filter((x) => x.command === "branchLeft" || x.command === "branchRight");
  const branchAccPct = pct(br.filter((x) => x.correct).length, br.length);

  const rp = acts.filter((x) => x.command === "replace");
  const replacementAccPct = pct(rp.filter((x) => x.correct).length, rp.length);

  const inhibTrials = acts.filter((x) =>
    x.expectedAction === "inhibit" || x.outcome === "forbidden"
    || x.outcome === "prematurePending" || x.outcome === "distractorHit");
  const inhibFails = inhibTrials.filter((x) => !x.correct).length;
  const inhibitionAcc = rate(Math.max(0, inhibTrials.length - inhibFails), Math.max(1, inhibTrials.length));

  const asTrials = acts.filter((x) => x.command === "oppositeCue" || x.command === "oppositeHand");
  const antiSaccadicAccPct = pct(asTrials.filter((x) => x.correct).length, asTrials.length);

  const dsTrials = acts.filter((x) => x.stream === "R");
  const dualStreamAccPct = pct(dsTrials.filter((x) => x.correct).length, dsTrials.length);
  const crossStreamIntrusions = outc("crossStream");

  const pendTrials = acts.filter((x) => x.outcome === "prematurePending" || x.correct);
  const pendingRetentionPct = pct(pendTrials.length - outc("prematurePending"), Math.max(1, pendTrials.length));

  const timingErrs = acts.filter((x) => x.timingErrorMs !== undefined).map((x) => Math.abs(x.timingErrorMs!));
  const iais = acts.filter((x) => x.iaiMs !== undefined).map((x) => x.iaiMs!);

  const postRec = acts.filter((x) => x.phase === "execute" && x.t > 0);
  const postRecoveryAccPct = pct(postRec.filter((x) => x.correct).length, postRec.length);

  /**
   * WORKING-MEMORY SPAN. The longest sequence length the athlete completed
   * PERFECTLY at least twice. This is an OBSERVED span, not a modelled one — if
   * they were never shown a 7-item sequence, it will never claim 7.
   */
  const bySeq = new Map<string, SeqEvent[]>();
  for (const x of acts) {
    const a = bySeq.get(x.sequenceId) ?? [];
    a.push(x);
    bySeq.set(x.sequenceId, a);
  }
  const spanHits = new Map<number, number>();
  for (const [, list] of bySeq) {
    const len = list.length;
    if (list.every((x) => x.correct)) spanHits.set(len, (spanHits.get(len) ?? 0) + 1);
  }
  let workingMemorySpan = 0;
  for (const [len, n] of spanHits) if (n >= 2 && len > workingMemorySpan) workingMemorySpan = len;

  const sequenceAccuracyPct = pct(e.perfect, e.sequences);
  const actionAccuracyPct = pct(correct.length, acts.length);

  // ------------------------------------------------------- COMPOSITE INDICES
  const orderAcc = rate(acts.length - outc("outOfOrder") - outc("skipped") - outc("extra"), Math.max(1, acts.length));
  const timingAcc = rate(acts.length - outc("timing") - outc("movingMiss"), Math.max(1, acts.length));
  const spatialAcc = rate(acts.length - outc("spatialMiss"), Math.max(1, acts.length));
  const actionTypeAcc = rate(acts.length - outc("wrongAction"), Math.max(1, acts.length));

  /** SEQUENCE INTEGRATION — can the athlete hold ALL five demands at once. It is
   *  a PRODUCT, not an average, because that is the honest model: being excellent
   *  at four of them and hopeless at the fifth does not integrate. */
  const sequenceIntegration = Math.round(
    orderAcc * timingAcc * actionTypeAcc * handSelectionAcc * spatialAcc * 100,
  );

  /** PERIPHERAL-TO-CENTRAL TRANSFER — did information survive the trip from the
   *  edge of the visual field into a correct central decision. */
  const encodeFails = e.breakdowns.encoding + e.breakdowns.memory;
  const peripheralAcc = rate(Math.max(0, acts.length - encodeFails), Math.max(1, acts.length));
  const decisionAcc = rate(Math.max(0, acts.length - e.breakdowns.decision - e.breakdowns.transformation), Math.max(1, acts.length));
  const latencyQ = avgDecisionToActionMs > 0 ? Math.min(1, 450 / avgDecisionToActionMs) : 0;
  const peripheralToCentral = Math.round(peripheralAcc * decisionAcc * (0.7 + 0.3 * latencyQ) * 100);

  /** WORKING-MEMORY CAPACITY — span, but discounted by how badly it collapses
   *  under delay and interference. A span of 7 that evaporates the moment a
   *  distractor appears is not a capacity of 7. */
  const memFailRate = rate(e.breakdowns.memory, Math.max(1, acts.length));
  const workingMemoryCapacity = Math.round(
    Math.min(100, (workingMemorySpan / 9) * 100 * (1 - Math.min(0.6, memFailRate * 3))),
  );

  /** BILATERAL SEQUENCING — balance, dual-stream accuracy, and contamination. */
  const rtAsym = leftRT && rightRT ? Math.abs(leftRT - rightRT) / Math.max(leftRT, rightRT) : 0;
  const cntAsym = leftN + rightN ? Math.abs(leftN - rightN) / (leftN + rightN) : 0;
  const contamination = rate(crossStreamIntrusions, Math.max(1, acts.length));
  const bilateralSequencing = Math.round(
    Math.max(0, 1 - rtAsym * 0.35 - cntAsym * 0.3 - contamination * 2) * 100,
  );

  /** INHIBITION CONTROL — the ability to NOT act: no-gos, distractors,
   *  anti-saccadic pull, and premature grabs at pending targets. */
  const prematureRate = rate(outc("prematurePending"), Math.max(1, acts.length));
  const inhibitionControl = Math.round(
    Math.max(0, inhibitionAcc * 0.55
      + (asTrials.length ? antiSaccadicAccPct / 100 : 1) * 0.25
      + (1 - Math.min(1, prematureRate * 4)) * 0.2) * 100,
  );

  /** COGNITIVE FLEXIBILITY — rule switching, transformations, branches, and
   *  live updates. This is the index that most separates Pro from GOAT. */
  const flexTrials = tf.length + br.length + rp.length;
  const flexOK = tf.filter((x) => x.correct).length + br.filter((x) => x.correct).length + rp.filter((x) => x.correct).length;
  const cognitiveFlexibility = flexTrials
    ? Math.round(rate(flexOK, flexTrials) * 100)
    : 0;

  /** TEMPORAL PRECISION — not speed. CONSISTENCY. A metronome, not a sprinter.
   *  Built from timing error and the variability of the inter-action interval. */
  const terr = mean(timingErrs);
  const window = e.tune.timingWindowMs || 400;
  const temporalPrecision = Math.round(
    Math.max(0, (1 - Math.min(1, terr / window)) * 0.6 + (1 - Math.min(1, sd(iais) / 400)) * 0.4) * 100,
  );

  /** RECOVERY RESILIENCE — what happens AFTER a critical error. */
  const avgRecoveryMs = Math.round(mean(e.recoveryTimes));
  const recoveryResilience = Math.round(
    Math.max(0, (postRecoveryAccPct / 100) * 0.6
      + (e.recoveryAttempts ? Math.min(1, 2 / Math.max(1, e.recoveryAttempts)) : 1) * 0.4) * 100,
  );

  /** ELITE BREAKDOWN POINT — the exact bonus stage where performance materially
   *  fell below the athlete's own main-round standard. Null = never broke. */
  let eliteBreakdownPoint: number | null = null;
  const bonusEv = acts.filter((x) => x.bonusStage !== undefined);
  const stages = [...new Set(bonusEv.map((x) => x.bonusStage!))].sort((a, b) => a - b);
  for (const st of stages) {
    const list = bonusEv.filter((x) => x.bonusStage === st);
    if (list.length < 5) continue;
    if (rate(list.filter((x) => x.correct).length, list.length) < (actionAccuracyPct / 100) * 0.7) {
      eliteBreakdownPoint = st;
      break;
    }
  }

  /**
   * COMPOSITE LEADERBOARD (§37). Ranked on NORMALIZED QUALITY, never raw score —
   * the same lesson AEGIS taught us. Raw score scales with how many sequences you
   * happened to be shown, so it inflates with easy tiers played long. Quality is
   * bounded at 1 and tier-independent, which is what lets the tier coefficient
   * actually be decisive.
   *
   *   quality = 0.30 sequence accuracy   (a PLAN completed, not a lucky hit)
   *           + 0.16 sequence integration
   *           + 0.14 cognitive flexibility
   *           + 0.12 inhibition control
   *           + 0.10 working-memory capacity
   *           + 0.08 bilateral sequencing
   *           + 0.06 temporal precision
   *           + 0.04 decision latency quality (capped — speed can never buy rank)
   *
   *   rating = 1000 · quality^1.5 · tierCoeff · complexityCoeff · bonusDepth
   *
   * Assessment Mode and Custom Mode are scored but NEVER ranked (§33, §37): a
   * fixed protocol and a self-tuned one are not comparable to a standardized
   * adaptive run, and pretending otherwise would corrupt the board.
   */
  const latQ = avgDecisionToActionMs > 0 ? Math.min(1, 450 / avgDecisionToActionMs) : 0;
  const quality =
    0.30 * (sequenceAccuracyPct / 100) +
    0.16 * (sequenceIntegration / 100) +
    0.14 * (cognitiveFlexibility / 100) +
    0.12 * (inhibitionControl / 100) +
    0.10 * (workingMemoryCapacity / 100) +
    0.08 * (bilateralSequencing / 100) +
    0.06 * (temporalPrecision / 100) +
    0.04 * latQ;

  const complexityCoeff = 1 + Math.min(1.2, (e.complexity - 1) * 0.4);
  const bonusDepth = 1 + Math.min(1.5, e.bonusStage * 0.10 * (TIER_COEFF[s.tier] / 3));
  const ranked = MODE_RANKED[s.mode] && !s.custom;

  const compositeRating = ranked
    ? Math.max(0, Math.round(
      1000 * Math.pow(Math.max(0, quality), 1.5) *
      TIER_COEFF[s.tier] * complexityCoeff * bonusDepth,
    ))
    : 0;

  return {
    score: e.score,
    sequenceAccuracyPct,
    avgDecisionToActionMs,
    longestPerfectStreak: e.longestStreak,
    workingMemorySpan,
    handSelectionAccPct: Math.round(handSelectionAcc * 1000) / 10,
    bonusStage: e.bonusStage,

    sequences: e.sequences, perfect: e.perfect,
    actionAccuracyPct,
    orderAccPct: Math.round(orderAcc * 1000) / 10,
    timingAccPct: Math.round(timingAcc * 1000) / 10,
    spatialAccPct: Math.round(spatialAcc * 1000) / 10,
    transformationAccPct, branchAccPct, replacementAccPct,
    inhibitionAccPct: Math.round(inhibitionAcc * 1000) / 10,
    antiSaccadicAccPct,
    dualStreamAccPct, crossStreamIntrusions,
    pendingRetentionPct,
    predictionAccPct: pct(acts.filter((x) => x.correct).length, Math.max(1, acts.length)),
    criticalErrors: crit, skipped: outc("skipped"), extra: outc("extra"),
    leftRT, rightRT,
    leftRightBalancePct: pct(Math.min(leftN, rightN), Math.max(1, Math.max(leftN, rightN))),
    timingSD: Math.round(sd(timingErrs)), iaiSD: Math.round(sd(iais)),
    recoveryEvents: e.recoveryAttempts, avgRecoveryMs, postRecoveryAccPct,
    peakComplexity: Math.round(e.complexity * 100) / 100,
    bonusDurationMs: e.bonusDurationMs(), failCause: e.failCause,
    breakdowns: { ...e.breakdowns },
    weakestDomain: e.weakestDomain(),

    sequenceIntegration, peripheralToCentral, workingMemoryCapacity,
    bilateralSequencing, inhibitionControl, cognitiveFlexibility,
    temporalPrecision, recoveryResilience, eliteBreakdownPoint,

    compositeRating, ranked,
  };
}
