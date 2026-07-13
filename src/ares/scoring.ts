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

  // Best streak + explicit miss count
  let bestStreak = 0;
  {
    let run = 0;
    for (const e of [...events].sort((a, b) => a.timestamp - b.timestamp)) {
      if (e.errorType === "correctRejection") continue;
      if (e.correct) {
        run += 1;
        bestStreak = Math.max(bestStreak, run);
      } else {
        run = 0;
      }
    }
  }
  const misses = events.filter((e) => e.errorType === "miss").length;

  // ---- Signal-detection sensitivity d' (two-choice / forced-choice tasks) ----
  // Treat "right" as the signal class and "left" as the noise class:
  //   hit         = correctly answered RIGHT when RIGHT was required
  //   false alarm = answered RIGHT when LEFT was required
  //   d' = z(hitRate) - z(falseAlarmRate)   (log-linear corrected)
  // d' separates true discriminability from a left/right response bias.
  let dPrime: number | undefined;
  let criterionC: number | undefined;
  {
    const sig = scoreable.filter((e) => e.expectedAction === "hit:right");
    const noi = scoreable.filter((e) => e.expectedAction === "hit:left");
    if (sig.length >= 3 && noi.length >= 3) {
      const hits = sig.filter((e) => e.correct).length;
      // a wrong answer on a LEFT trial means they said RIGHT
      const fas = noi.filter((e) => !e.correct).length;
      // log-linear correction keeps z() finite at ceiling/floor
      const hr = (hits + 0.5) / (sig.length + 1);
      const far = (fas + 0.5) / (noi.length + 1);
      const zH = probit(hr);
      const zF = probit(far);
      dPrime = Math.round((zH - zF) * 100) / 100;
      criterionC = Math.round((-0.5 * (zH + zF)) * 100) / 100;
    }
  }

  // Per-hand split (choice protocols): required side from expectedAction
  const sideOf = (e: RawEvent): "left" | "right" | null =>
    e.expectedAction === "hit:left" ? "left" : e.expectedAction === "hit:right" ? "right" : null;
  const handStats = (side: "left" | "right") => {
    const evts = scoreable.filter((e) => sideOf(e) === side);
    if (evts.length === 0) return { rt: undefined as number | undefined, acc: undefined as number | undefined };
    const hrts = evts.filter((e) => e.correct && e.reactionMs !== undefined).map((e) => e.reactionMs!);
    return {
      rt: hrts.length ? Math.round(mean(hrts)!) : undefined,
      acc: Math.round((evts.filter((e) => e.correct).length / evts.length) * 1000) / 10,
    };
  };
  const L = handStats("left");
  const R = handStats("right");

  // Eye-hand precision: mean distance from target center at contact (cm)
  const precisions = events.filter((e) => e.precisionM !== undefined).map((e) => e.precisionM! * 100);
  const avgPrecisionCm = precisions.length ? Math.round(mean(precisions)! * 10) / 10 : undefined;

  // Post-error slowing (true PES): mean REACTION TIME on the trial immediately
  // after an error, minus mean reaction time on trials after a correct.
  // Positive = they slowed down after a mistake (adaptive control).
  // (The old version differenced inter-response intervals, which in a fixed
  //  trial schedule mostly measures the schedule, not the athlete.)
  let postErrorSlowingMs: number | undefined;
  {
    const seq = events
      .filter((e) => e.errorType !== "correctRejection" && e.reactionMs !== undefined && e.actualAction !== "none")
      .sort((a, b) => a.timestamp - b.timestamp);
    const postErr: number[] = [];
    const postCorrect: number[] = [];
    for (let i = 1; i < seq.length; i++) {
      const rt = seq[i].reactionMs!;
      if (!Number.isFinite(rt)) continue;
      if (seq[i - 1].correct) postCorrect.push(rt);
      else postErr.push(rt);
    }
    if (postErr.length >= 1 && postCorrect.length >= 1) {
      postErrorSlowingMs = Math.round(mean(postErr)! - mean(postCorrect)!);
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
    dPrime,
    criterionC,
    bestStreak: bestStreak || undefined,
    misses,
    leftAvgReactionMs: L.rt,
    rightAvgReactionMs: R.rt,
    leftAccuracyPct: L.acc,
    rightAccuracyPct: R.acc,
  };
}

/**
 * probit — inverse standard-normal CDF (Acklam's rational approximation).
 * Used for d' / criterion. Accurate to ~1e-9 across (0,1).
 */
function probit(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q: number, r: number;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
