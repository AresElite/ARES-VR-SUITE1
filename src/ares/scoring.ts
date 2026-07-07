import type { RawEvent, TargetZone } from "./drillTypes";
import type { SessionMetrics } from "@/data/schemas";

const median = (xs: number[]) => {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

const stddev = (xs: number[]) => {
  const m = mean(xs);
  if (m === undefined || xs.length < 2) return undefined;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

const isPeripheral = (z?: TargetZone) => z !== undefined && z !== "center";
const isLeftZone = (z?: TargetZone) => z === "left" || z === "upLeft" || z === "downLeft";
const isRightZone = (z?: TargetZone) => z === "right" || z === "upRight" || z === "downRight";
const isUpperZone = (z?: TargetZone) => z === "up" || z === "upLeft" || z === "upRight";
const isLowerZone = (z?: TargetZone) => z === "down" || z === "downLeft" || z === "downRight";

/**
 * Compute the standardized metric block from a drill's raw event stream.
 * Pure function — every drill engine funnels through here so metrics stay
 * comparable across the whole suite (and against the 55" touchscreen suite).
 */
export function computeMetrics(events: RawEvent[]): SessionMetrics {
  const scoreable = events.filter((e) => e.errorType !== "correctRejection");
  const trials = scoreable.length;
  const correct = scoreable.filter((e) => e.correct).length;
  const incorrect = trials - correct;

  const rts = events.filter((e) => e.correct && e.reactionMs !== undefined).map((e) => e.reactionMs!);
  const choiceRts = events
    .filter((e) => e.correct && e.reactionMs !== undefined && e.expectedAction && e.expectedAction !== "hit")
    .map((e) => e.reactionMs!);

  const falseStarts = events.filter((e) => e.errorType === "falseStart").length;
  const noGoFailures = events.filter((e) => e.errorType === "noGoFailure").length;
  const wrongHandErrors = events.filter((e) => e.errorType === "wrongHand").length;
  const peripheralMisses = events.filter(
    (e) => e.errorType === "miss" && isPeripheral(e.zone),
  ).length;

  // Left/right asymmetry: signed % difference of mean RT (positive = right slower)
  const leftRts = events.filter((e) => e.correct && e.reactionMs && isLeftZone(e.zone)).map((e) => e.reactionMs!);
  const rightRts = events.filter((e) => e.correct && e.reactionMs && isRightZone(e.zone)).map((e) => e.reactionMs!);
  const lM = mean(leftRts);
  const rM = mean(rightRts);
  const leftRightAsymmetryPct =
    lM !== undefined && rM !== undefined && lM > 0 ? Math.round(((rM - lM) / lM) * 100) : undefined;

  const upRts = events.filter((e) => e.correct && e.reactionMs && isUpperZone(e.zone)).map((e) => e.reactionMs!);
  const downRts = events.filter((e) => e.correct && e.reactionMs && isLowerZone(e.zone)).map((e) => e.reactionMs!);
  const uM = mean(upRts);
  const dM = mean(downRts);
  const upperLowerAsymmetryPct =
    uM !== undefined && dM !== undefined && uM > 0 ? Math.round(((dM - uM) / uM) * 100) : undefined;

  // Central vs peripheral split: accuracy difference in percentage points
  const centralEvts = scoreable.filter((e) => e.zone === "center");
  const periphEvts = scoreable.filter((e) => isPeripheral(e.zone));
  const acc = (evts: RawEvent[]) =>
    evts.length ? (evts.filter((e) => e.correct).length / evts.length) * 100 : undefined;
  const cAcc = acc(centralEvts);
  const pAcc = acc(periphEvts);
  const centralPeripheralSplitPct =
    cAcc !== undefined && pAcc !== undefined ? Math.round(cAcc - pAcc) : undefined;

  // Fatigue drift: mean RT of final third vs first third (positive = slowing)
  let fatigueDriftPct: number | undefined;
  if (rts.length >= 9) {
    const third = Math.floor(rts.length / 3);
    const first = mean(rts.slice(0, third))!;
    const last = mean(rts.slice(-third))!;
    fatigueDriftPct = Math.round(((last - first) / first) * 100);
  }

  const timingConsistencyMs = stddev(rts) !== undefined ? Math.round(stddev(rts)!) : undefined;

  // Eye-hand precision: mean distance from target center at contact (cm)
  const precisions = events.filter((e) => e.precisionM !== undefined).map((e) => e.precisionM! * 100);
  const avgPrecisionCm = precisions.length ? Math.round(mean(precisions)! * 10) / 10 : undefined;

  // Post-error slowing: inter-response interval after an error vs overall
  let postErrorSlowingMs: number | undefined;
  {
    const seq = events
      .filter((e) => e.errorType !== "correctRejection" && e.actualAction !== "none")
      .sort((a, b) => a.timestamp - b.timestamp);
    const intervals: number[] = [];
    const postErr: number[] = [];
    for (let i = 1; i < seq.length; i++) {
      const iv = seq[i].timestamp - seq[i - 1].timestamp;
      if (iv <= 0 || iv > 8000) continue;
      intervals.push(iv);
      if (!seq[i - 1].correct) postErr.push(iv);
    }
    if (postErr.length >= 2 && intervals.length >= 6) {
      postErrorSlowingMs = Math.round(mean(postErr)! - mean(intervals)!);
    }
  }

  // Speed-accuracy index: accuracy fraction × (600 / avgRT), clamped 0..2.
  // ~1.0 = balanced; >1.2 = fast & clean; <0.8 = slow or sloppy.
  const avg = mean(rts);
  const accuracyPct = trials ? Math.round((correct / trials) * 1000) / 10 : 0;
  const speedAccuracyIndex =
    avg !== undefined && avg > 0
      ? Math.round(Math.min(2, (correct / Math.max(1, trials)) * (600 / avg)) * 100) / 100
      : undefined;

  return {
    trials,
    correct,
    incorrect,
    accuracyPct,
    avgReactionMs: avg !== undefined ? Math.round(avg) : undefined,
    medianReactionMs: median(rts) !== undefined ? Math.round(median(rts)!) : undefined,
    fastestReactionMs: rts.length ? Math.round(Math.min(...rts)) : undefined,
    slowestReactionMs: rts.length ? Math.round(Math.max(...rts)) : undefined,
    choiceReactionMs: mean(choiceRts) !== undefined ? Math.round(mean(choiceRts)!) : undefined,
    falseStarts,
    noGoFailures,
    peripheralMisses,
    wrongHandErrors,
    leftRightAsymmetryPct,
    upperLowerAsymmetryPct,
    centralPeripheralSplitPct,
    fatigueDriftPct,
    timingConsistencyMs,
    speedAccuracyIndex,
    avgPrecisionCm,
    postErrorSlowingMs,
  };
}
