import type { KeyEvent, KeySettings, BreakdownDomain } from "./types";
import { TIER_COEFF, MODE_RANKED } from "./tiers";
import type { KeystoneEngine } from "./KeystoneEngine";
import { profilePrecision, precisionGate, type PrecisionProfile } from "@/ares/precision";

/**
 * METRIC DICTIONARY (§36) + THE TEN COMPOSITE INDICES (§37).
 *
 * Every number is derived from recorded events. Where a metric is a composite,
 * its formula is written out in full so a coach — or a sceptical sports
 * scientist — can read exactly what it is made of.
 *
 * A boundary I have held throughout: we have a headset and two controllers. We
 * do NOT have a spine, hips, or a skeleton. "Postural Organization" below is a
 * measure of the geometric relationship between three tracked points and how
 * consistently the athlete reproduces it. It is named as a proxy, described as a
 * proxy, and makes no medical claim of any kind.
 */

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const sd = (v: number[]) => {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
};
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const rate = (n: number, d: number) => (d ? n / d : 1);

export interface KeyMetrics {
  // ---- headline (§35)
  score: number;
  synchronizationAccuracyPct: number;   // share of EVENTS completed perfectly
  initiationMs: number;                 // primary: cue -> valid coordinated onset
  bilateralCoordination: number;
  movementEconomy: number;
  stabilizationControl: number;
  bonusStage: number;

  // ---- expanded (§36)
  events: number; perfect: number;
  phaseAccuracyPct: number;
  leftAccPct: number; rightAccPct: number;
  bilateralSymmetryPct: number;
  intentionalAsymmetryPct: number;
  headHandSyncPct: number;
  endpointErrM: number;
  holdAccPct: number;
  meanDriftM: number;
  overshootRate: number;
  meanCorrections: number;
  transitionAccPct: number;
  inhibitionAccPct: number;
  falseStarts: number;
  predictiveTimingMs: number;
  reactiveTimingMs: number;
  forceAccPct: number;
  criticalErrors: number;
  recoveryEvents: number; avgRecoveryMs: number;
  meanPathRatio: number;
  headTravelM: number;
  initiationGapMs: number;
  arrivalGapMs: number;
  peakComplexity: number;
  bonusDurationMs: number; failCause?: string;
  breakdowns: Record<BreakdownDomain, number>;
  weakestDomain?: BreakdownDomain;

  // ---- the ten indices (§37)
  wholeBodySync: number;
  visualMotorCoupling: number;
  bilateralIntegration: number;
  posturalOrganization: number;
  temporalSync: number;
  stabilizationIndex: number;
  motorAdaptability: number;
  inhibitionCancellation: number;
  economyIndex: number;
  recoveryResilience: number;
  breakdownPoint: number | null;

  precision: PrecisionProfile;
  advanceReady: boolean;
  advanceReason: string;

  compositeRating: number;
  ranked: boolean;
}

export function computeKeyMetrics(e: KeystoneEngine, s: KeySettings): KeyMetrics {
  const ev = e.log;
  const correct = ev.filter((x) => x.correct);
  const outc = (o: string) => ev.filter((x) => x.outcome === o).length;

  const inits = ev.filter((x) => x.initiationMs !== undefined).map((x) => x.initiationMs!);
  const initiationMs = Math.round(mean(inits));

  const pred = ev.filter((x) => x.predictive && x.initiationMs !== undefined).map((x) => x.initiationMs!);
  const reac = ev.filter((x) => !x.predictive && x.initiationMs !== undefined).map((x) => x.initiationMs!);

  const drifts = ev.filter((x) => x.driftM !== undefined).map((x) => x.driftM!);
  const ratios = ev.filter((x) => x.pathRatio !== undefined).map((x) => x.pathRatio!);
  const corrections = ev.map((x) => x.corrections ?? 0);
  const initGaps = ev.filter((x) => x.initiationGapMs !== undefined).map((x) => x.initiationGapMs!);
  const arrGaps = ev.filter((x) => x.arrivalGapMs !== undefined).map((x) => x.arrivalGapMs!);
  const timingErrs = ev.filter((x) => x.timingErrorMs !== undefined).map((x) => Math.abs(x.timingErrorMs!));

  const synchronizationAccuracyPct = pct(e.perfect, e.events);
  const phaseAccuracyPct = pct(correct.length, ev.length);

  // ---- per-hand accuracy, from endpoint error against the phase tolerance
  const lErrs = ev.filter((x) => x.leftErrM !== undefined).map((x) => x.leftErrM!);
  const rErrs = ev.filter((x) => x.rightErrM !== undefined).map((x) => x.rightErrM!);
  const leftAccPct = pct(ev.filter((x) => x.correct && (x.leftErrM ?? 9) < 0.2).length, Math.max(1, ev.length));
  const rightAccPct = pct(ev.filter((x) => x.correct && (x.rightErrM ?? 9) < 0.2).length, Math.max(1, ev.length));

  /**
   * INTENTIONAL ASYMMETRY. A desync phase asks the hands to arrive DELIBERATELY
   * APART by a specified amount. This is scored separately from symmetry, because
   * bilateral coupling is the motor system's default state — breaking it ON
   * PURPOSE is a completely different (and harder) skill from maintaining it, and
   * collapsing them into one "symmetry" number would hide both.
   */
  const desyncTrials = ev.filter((x) => (x.requiredGapMs ?? 0) !== 0);
  const intentionalAsymmetryPct = pct(desyncTrials.filter((x) => x.correct).length, desyncTrials.length);
  const syncTrials = ev.filter((x) => (x.requiredGapMs ?? 0) === 0 && x.arrivalGapMs !== undefined);
  const bilateralSymmetryPct = pct(syncTrials.filter((x) => (x.arrivalGapMs ?? 999) < 120).length, syncTrials.length);

  const headTrials = ev.filter((x) => x.headErrRad !== undefined);
  const headHandSyncPct = pct(headTrials.filter((x) => x.correct).length, headTrials.length);

  const holdTrials = ev.filter((x) => x.driftM !== undefined);
  const holdAccPct = pct(holdTrials.filter((x) => x.correct).length, holdTrials.length);

  const transTrials = ev.filter((x) => x.kind === "transition");
  const transitionAccPct = pct(transTrials.filter((x) => x.correct).length, transTrials.length);

  const inhibTrials = ev.filter((x) => x.kind === "noGo" || x.kind === "cancel"
    || x.outcome === "prohibited" || x.outcome === "falseStart");
  const inhibitionAccPct = pct(inhibTrials.filter((x) => x.correct).length, inhibTrials.length);

  const forceTrials = ev.filter((x) => x.kind === "absorb" || x.kind === "redirect");
  const forceAccPct = pct(forceTrials.filter((x) => x.correct).length, forceTrials.length);

  // ---------------------------------------------------------------- INDICES

  /** WHOLE-BODY SYNCHRONIZATION — a PRODUCT, not an average. Being excellent at
   *  four of five and hopeless at the fifth does not integrate; it fails. */
  const bilatQ = rate(syncTrials.filter((x) => (x.arrivalGapMs ?? 999) < 150).length, Math.max(1, syncTrials.length));
  const headQ = headTrials.length ? rate(headTrials.filter((x) => x.correct).length, headTrials.length) : 1;
  const torsoQ = 1 - Math.min(1, mean(ev.map((x) => x.torsoErrM ?? 0)) / 0.25);
  const endQ = 1 - Math.min(1, mean([...lErrs, ...rErrs]) / 0.3);
  const patternQ = rate(e.perfect, Math.max(1, e.events));
  const wholeBodySync = Math.round(bilatQ * headQ * torsoQ * endQ * patternQ * 100);

  /** VISUAL-MOTOR COUPLING — did the visual information become the right movement,
   *  fast. Latency is CAPPED at 1, so being quicker than the reference cannot
   *  inflate the score; it can only stop slowness from deflating it. */
  const latQ = initiationMs > 0 ? Math.min(1, 420 / initiationMs) : 0;
  const interpQ = 1 - Math.min(1, rate(e.breakdowns.interpretation + e.breakdowns.selection, Math.max(1, ev.length)) * 3);
  const dirQ = 1 - Math.min(1, rate(e.breakdowns.direction, Math.max(1, ev.length)) * 3);
  const visualMotorCoupling = Math.round(interpQ * dirQ * (0.65 + 0.35 * latQ) * 100);

  /** BILATERAL INTEGRATION — symmetry AND intentional asymmetry AND the absence
   *  of cross-side interference. All three, because they dissociate. */
  const gapQ = 1 - Math.min(1, mean(initGaps) / 320);
  const asymQ = desyncTrials.length ? rate(desyncTrials.filter((x) => x.correct).length, desyncTrials.length) : 1;
  const revPenalty = rate(outc("bilateralReversal"), Math.max(1, ev.length)) * 3;
  const bilateralIntegration = Math.round(Math.max(0, (bilatQ * 0.4 + asymQ * 0.35 + gapQ * 0.25) - revPenalty) * 100);

  /**
   * POSTURAL ORGANIZATION. From three tracked points only. This measures how
   * CONSISTENTLY the athlete reproduces a commanded geometric arrangement of
   * headset and controllers, and how little the torso proxy wanders while doing
   * it. It is a repeatability measure of tracked-point geometry. It is NOT a
   * postural assessment, and nothing here should ever be presented as one.
   */
  const torsoErrs = ev.filter((x) => x.torsoErrM !== undefined).map((x) => x.torsoErrM!);
  const consistency = 1 - Math.min(1, sd([...lErrs, ...rErrs]) / 0.2);
  const torsoStill = 1 - Math.min(1, mean(torsoErrs) / 0.22);
  const posturalOrganization = Math.round(Math.max(0, consistency * 0.55 + torsoStill * 0.45) * 100);

  /** TEMPORAL SYNCHRONIZATION — consistency, not speed. A metronome, not a sprint. */
  const window = e.tune.timingWindowMs || 400;
  const temporalSync = Math.round(
    Math.max(0, (1 - Math.min(1, mean(timingErrs) / window)) * 0.55
      + (1 - Math.min(1, sd(timingErrs) / window)) * 0.25
      + asymQ * 0.2) * 100,
  );

  /** STABILIZATION CONTROL — arriving is easy; STOPPING is the skill. */
  const driftQ = 1 - Math.min(1, mean(drifts) / (e.tune.stabilityTolM * 3 || 0.1));
  const releaseQ = 1 - Math.min(1, rate(outc("earlyRelease") + outc("stabilityFail"), Math.max(1, ev.length)) * 2.5);
  const corrQ = 1 - Math.min(1, mean(corrections) / 4);
  const stabilizationIndex = Math.round(Math.max(0, driftQ * 0.45 + releaseQ * 0.35 + corrQ * 0.2) * 100);

  /** MOTOR ADAPTABILITY — can the plan be rewritten mid-movement. */
  const adaptTrials = ev.filter((x) => x.kind === "reverse" || x.kind === "mirror" || x.kind === "transition");
  const motorAdaptability = adaptTrials.length
    ? Math.round(rate(adaptTrials.filter((x) => x.correct).length, adaptTrials.length) * 100)
    : 0;

  /** INHIBITION & CANCELLATION — the ability to NOT move, including after the
   *  movement has already been loaded. */
  const leakQ = 1 - Math.min(1, rate(outc("falseStart"), Math.max(1, ev.length)) * 4);
  const noGoQ = inhibTrials.length ? rate(inhibTrials.filter((x) => x.correct).length, inhibTrials.length) : 1;
  const inhibitionCancellation = Math.round(Math.max(0, noGoQ * 0.65 + leakQ * 0.35) * 100);

  /** MOVEMENT ECONOMY — path directness. This is the anti-flail term. */
  const pathQ = ratios.length ? Math.max(0, Math.min(1, 1.3 / Math.max(1, mean(ratios)))) : 0;
  const headQuiet = 1 - Math.min(1, mean(ev.map((x) => x.headTravelM ?? 0)) / 1.6);
  const economyIndex = Math.round(Math.max(0, pathQ * 0.6 + corrQ * 0.25 + headQuiet * 0.15) * 100);
  const movementEconomy = economyIndex;

  /** RECOVERY RESILIENCE — can the whole system be REORGANIZED after disruption. */
  const avgRecoveryMs = Math.round(mean(e.recoveryTimes));
  const recoveryResilience = Math.round(
    Math.max(0, (e.recoveryAttempts ? Math.min(1, 2 / e.recoveryAttempts) : 1) * 0.45
      + (phaseAccuracyPct / 100) * 0.55) * 100,
  );

  /** SYNCHRONIZATION BREAKDOWN POINT — the bonus stage at which coordination
   *  materially fell below the athlete's own main-round standard. */
  let breakdownPoint: number | null = null;
  const bonusEv = ev.filter((x) => x.bonusStage !== undefined);
  for (const st of [...new Set(bonusEv.map((x) => x.bonusStage!))].sort((a, b) => a - b)) {
    const list = bonusEv.filter((x) => x.bonusStage === st);
    if (list.length < 5) continue;
    if (rate(list.filter((x) => x.correct).length, list.length) < (phaseAccuracyPct / 100) * 0.7) {
      breakdownPoint = st;
      break;
    }
  }

  const precision = profilePrecision(
    ev.filter((x) => x.correct && x.leftErrM !== undefined)
      .map((x) => ({ distM: Math.max(x.leftErrM!, x.rightErrM ?? 0), radiusM: e.tune.endpointTolM })),
  );
  const gate = precisionGate(synchronizationAccuracyPct, precision.localizationIndex);

  /**
   * COMPOSITE LEADERBOARD (§34). Normalized quality, never raw score — the same
   * lesson AEGIS and Sequence Command both taught. Raw score scales with how many
   * events you happened to be shown, which lets an easy tier played flawlessly for
   * five minutes out-rank a hard tier played well.
   *
   *   quality = 0.26 synchronization accuracy   (a whole PATTERN, not a lucky rep)
   *           + 0.16 whole-body synchronization
   *           + 0.13 stabilization              (the thing only this drill measures)
   *           + 0.12 bilateral integration
   *           + 0.10 motor adaptability
   *           + 0.09 inhibition & cancellation
   *           + 0.08 movement economy           (the anti-flail term)
   *           + 0.06 temporal synchronization
   *
   *   rating = 1000 · quality^1.5 · tierCoeff · complexityCoeff · bonusDepth
   *
   * Quality^1.5 punishes sloppiness super-linearly, and because quality is bounded
   * at 1 and tier-independent, the tier coefficient is genuinely decisive.
   * Assessment and Custom are scored but never ranked.
   */
  const quality =
    0.26 * (synchronizationAccuracyPct / 100) +
    0.16 * (wholeBodySync / 100) +
    0.13 * (stabilizationIndex / 100) +
    0.12 * (bilateralIntegration / 100) +
    0.10 * (motorAdaptability / 100) +
    0.09 * (inhibitionCancellation / 100) +
    0.08 * (economyIndex / 100) +
    0.06 * (temporalSync / 100);

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
    synchronizationAccuracyPct,
    initiationMs,
    bilateralCoordination: bilateralIntegration,
    movementEconomy,
    stabilizationControl: stabilizationIndex,
    bonusStage: e.bonusStage,

    events: e.events, perfect: e.perfect,
    phaseAccuracyPct,
    leftAccPct, rightAccPct,
    bilateralSymmetryPct, intentionalAsymmetryPct,
    headHandSyncPct,
    endpointErrM: Math.round(mean([...lErrs, ...rErrs]) * 1000) / 1000,
    holdAccPct,
    meanDriftM: Math.round(mean(drifts) * 1000) / 1000,
    overshootRate: pct(ev.filter((x) => (x.overshootM ?? 0) > 0).length, Math.max(1, ev.length)),
    meanCorrections: Math.round(mean(corrections) * 10) / 10,
    transitionAccPct, inhibitionAccPct,
    falseStarts: outc("falseStart"),
    predictiveTimingMs: Math.round(mean(pred)),
    reactiveTimingMs: Math.round(mean(reac)),
    forceAccPct,
    criticalErrors: ev.filter((x) => x.critical).length,
    recoveryEvents: e.recoveryAttempts, avgRecoveryMs,
    meanPathRatio: Math.round(mean(ratios) * 100) / 100,
    headTravelM: Math.round(mean(ev.map((x) => x.headTravelM ?? 0)) * 100) / 100,
    initiationGapMs: Math.round(mean(initGaps)),
    arrivalGapMs: Math.round(mean(arrGaps)),
    peakComplexity: Math.round(e.complexity * 100) / 100,
    bonusDurationMs: e.bonusDurationMs(), failCause: e.failCause,
    breakdowns: { ...e.breakdowns },
    weakestDomain: e.weakestDomain(),

    wholeBodySync, visualMotorCoupling, bilateralIntegration, posturalOrganization,
    temporalSync, stabilizationIndex, motorAdaptability, inhibitionCancellation,
    economyIndex, recoveryResilience, breakdownPoint,

    precision, advanceReady: gate.ready, advanceReason: gate.reason,
    compositeRating, ranked,
  };
}
