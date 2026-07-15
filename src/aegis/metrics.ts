import type { AegisEvent, AegisSettings } from "./types";
import { TIER_COEFF, MODE_COEFF, HANDRULE_COEFF } from "./tiers";
import type { AegisEngine } from "./ContinuousEngine";
import { profilePrecision, precisionGate, type PrecisionProfile } from "@/ares/precision";

/**
 * THE METRIC DICTIONARY (§23) and the derived indices (§24).
 *
 * A hard rule runs through this file: every number below is DERIVED FROM
 * RECORDED EVENTS. Nothing here is a construct we invented and then dressed up
 * as a measurement. Where a metric is a composite of other metrics, its formula
 * is stated in full so a coach — or a sceptical sports scientist — can read
 * exactly what it is made of and decide for themselves what it is worth.
 *
 * These are performance descriptors. They are not diagnostic, they are not
 * clinical, and they do not claim to measure anything beyond what the athlete
 * did inside this drill.
 */

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const median = (v: number[]) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sd = (v: number[]) => {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
};
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

export interface AegisMetrics {
  // ---- interaction
  valid: number; blocked: number; caught: number; released: number;
  missed: number; wrongHand: number; wrongAction: number;
  retentionFails: number; zoneFails: number;
  accuracyPct: number;

  // ---- reaction (primary RT = actionable -> valid response)
  avgRT: number; medianRT: number; fastestRT: number; slowestRT: number; rtSD: number;
  leftRT: number; rightRT: number; eitherRT: number;
  recoveryRT: number; bonusRT: number;

  // ---- avoidance & inhibition
  bombsDodged: number; bombContacts: number; bombAvoidPct: number;
  nogoAvoided: number; nogoContacts: number; nogoAvoidPct: number;
  hesitations: number;

  // ---- slowdown & recovery
  slowdowns: number; slowdownCauses: string[];
  postRecoveryAccuracyPct: number;

  // ---- coordination
  leftCount: number; rightCount: number; handBalancePct: number;
  handSelectionAccPct: number;
  pathLeftM: number; pathRightM: number;

  // ---- session
  score: number; mainScore: number; bonusScore: number;
  /**
   * PERFORMANCE SCORE — the athlete-facing number, built ONLY from what the athlete controls:
   * how many they hit, how CENTRED those hits were (perfect/good/poor share), and how long
   * their best streak ran. It is deliberately separate from the leaderboard compositeRating.
   */
  performanceScore: number;
  totalHits: number;
  longestStreak: number;
  peakSimultaneous: number; peakSpeed: number;
  bonusStage: number; bonusDurationMs: number; failCause?: string;

  // ---- derived indices (§24)
  decisionEfficiency: number;      // 0-100
  bilateralCoordination: number;   // 0-100
  inhibitionControl: number;       // 0-100
  recoveryResilience: number;      // 0-100
  trackingLoadCapacity: number;    // max simultaneous objects held at >=80% accuracy
  pressureStability: number;       // 0-100
  movementEconomy: number;         // 0-100
  eliteBreakdownPoint: number | null; // bonus stage where performance materially fell

  // ---- hand localization
  precision: PrecisionProfile;
  advanceReady: boolean;
  advanceReason: string;

  // ---- leaderboard
  compositeRating: number;
}

export function computeAegisMetrics(engine: AegisEngine, settings: AegisSettings): AegisMetrics {
  const ev = engine.events;
  const scoreable = ev.filter((e) => e.cat !== "bomb" && e.cat !== "nogo" && e.cat !== "bonus");
  const valid = ev.filter((e) => e.correct && e.cat !== "bomb" && e.cat !== "nogo").length;

  const rts = ev.filter((e) => e.reactionMs !== undefined).map((e) => e.reactionMs!);
  const rtFor = (f: (e: AegisEvent) => boolean) =>
    Math.round(mean(ev.filter((e) => e.reactionMs !== undefined && f(e)).map((e) => e.reactionMs!)));

  const blocked = ev.filter((e) => e.outcome === "blocked").length;
  const caught = ev.filter((e) => e.outcome === "caught").length;
  const released = ev.filter((e) => e.outcome === "released").length;
  const missed = ev.filter((e) => e.outcome === "miss").length;
  const wrongHand = ev.filter((e) => e.outcome === "wrongHand").length;
  const wrongAction = ev.filter((e) => e.outcome === "wrongAction").length;
  const retentionFails = ev.filter((e) => e.outcome === "dropped").length;
  const zoneFails = ev.filter((e) => e.outcome === "missedZone").length;

  const bombs = ev.filter((e) => e.cat === "bomb");
  const bombContacts = bombs.filter((e) => e.outcome === "bombContact").length;
  const bombsDodged = bombs.filter((e) => e.outcome === "avoided").length;
  const nogos = ev.filter((e) => e.cat === "nogo");
  const nogoContacts = nogos.filter((e) => e.outcome === "nogoContact").length;
  const nogoAvoided = nogos.filter((e) => e.outcome === "avoided").length;

  const accuracyPct = pct(scoreable.filter((e) => e.correct).length, scoreable.length);

  const leftCount = ev.filter((e) => e.responseHand === "left" && e.correct).length;
  const rightCount = ev.filter((e) => e.responseHand === "right" && e.correct).length;
  const leftRT = rtFor((e) => e.responseHand === "left");
  const rightRT = rtFor((e) => e.responseHand === "right");

  const path = engine.pathLength();

  // ---- post-recovery accuracy: how well does performance hold once pace is back
  const postRec = ev.filter((e) => e.pace === "recovery" && e.cat !== "bomb" && e.cat !== "nogo");
  const postRecoveryAccuracyPct = pct(postRec.filter((e) => e.correct).length, postRec.length);

  /**
   * DECISION EFFICIENCY (0-100). Correct RESPONSE SELECTION per unit of time.
   *   = correct-hand rate × correct-action rate × inhibition rate × speed factor
   * The speed factor is a ratio against a 500 ms reference, capped at 1, so that
   * being faster than the reference cannot inflate the index — it only prevents
   * being slow from deflating it. Speed can never buy accuracy here.
   */
  const handAcc = scoreable.length ? 1 - wrongHand / scoreable.length : 1;
  const actionAcc = scoreable.length ? 1 - wrongAction / scoreable.length : 1;
  const inhibRate = (bombs.length + nogos.length)
    ? (bombsDodged + nogoAvoided) / (bombs.length + nogos.length) : 1;
  const avgRT = Math.round(mean(rts));
  const speedFactor = avgRT > 0 ? Math.min(1, 500 / avgRT) : 0;
  const decisionEfficiency = Math.round(handAcc * actionAcc * inhibRate * speedFactor * 100);

  /**
   * BILATERAL COORDINATION (0-100). Penalises asymmetry in BOTH latency and
   * accuracy. An athlete who is fast and accurate on one side and slow and
   * sloppy on the other is not well coordinated, however good the average looks.
   */
  const rtAsym = leftRT && rightRT ? Math.abs(leftRT - rightRT) / Math.max(leftRT, rightRT) : 0;
  const cntAsym = leftCount + rightCount
    ? Math.abs(leftCount - rightCount) / (leftCount + rightCount) : 0;
  const bilateralCoordination = Math.round(Math.max(0, 1 - rtAsym * 0.6 - cntAsym * 0.4) * 100);

  /**
   * INHIBITION CONTROL (0-100). The ability to NOT act.
   *   bombs avoided + no-gos avoided + wrong-hand suppression, minus hesitation.
   */
  const hesitations = ev.filter((e) => e.cat === "bomb" && e.scoreDelta < 35 && e.outcome === "avoided").length;
  const inhibitionControl = Math.round(
    Math.max(0, inhibRate * 0.7 + handAcc * 0.3 - hesitations * 0.01) * 100,
  );

  /**
   * RECOVERY RESILIENCE (0-100). What happens in the twenty seconds AFTER an
   * error. This is where athletes most often differ from each other, and it is
   * invisible to any average.
   */
  const recoveryRT = rtFor((e) => e.pace !== "normal");
  const rtInflation = recoveryRT && avgRT ? Math.max(0, (recoveryRT - avgRT) / avgRT) : 0;
  const recoveryResilience = Math.round(
    Math.max(0, (postRecoveryAccuracyPct / 100) * 0.6 + (1 - Math.min(1, rtInflation)) * 0.4) * 100,
  );

  /**
   * TRACKING LOAD CAPACITY. The highest number of simultaneously actionable
   * objects at which the athlete still held >=80% accuracy. This is an OBSERVED
   * ceiling, not a model — if they never faced 5 objects, it will not claim 5.
   */
  const byLoad = new Map<number, { n: number; ok: number }>();
  for (const e of scoreable) {
    const load = (e as AegisEvent & { load?: number }).load ?? 0;
    const b = byLoad.get(load) ?? { n: 0, ok: 0 };
    b.n++; if (e.correct) b.ok++;
    byLoad.set(load, b);
  }
  let trackingLoadCapacity = 0;
  for (const [load, b] of byLoad) {
    if (b.n >= 5 && b.ok / b.n >= 0.8 && load > trackingLoadCapacity) trackingLoadCapacity = load;
  }
  if (!trackingLoadCapacity) trackingLoadCapacity = Math.min(engine.peakSimultaneous, accuracyPct >= 80 ? engine.peakSimultaneous : 1);

  /**
   * PRESSURE STABILITY (0-100). Does performance hold as speed and density rise?
   * Compares the first third of the session against the last third. A low score
   * means the athlete is fast until pressed, which is a real and coachable thing.
   */
  const third = Math.floor(scoreable.length / 3) || 1;
  const early = scoreable.slice(0, third);
  const late = scoreable.slice(-third);
  const earlyAcc = pct(early.filter((e) => e.correct).length, early.length) / 100;
  const lateAcc = pct(late.filter((e) => e.correct).length, late.length) / 100;
  const earlyRT = mean(early.filter((e) => e.reactionMs).map((e) => e.reactionMs!));
  const lateRT = mean(late.filter((e) => e.reactionMs).map((e) => e.reactionMs!));
  const accDrop = Math.max(0, earlyAcc - lateAcc);
  const rtDrift = earlyRT ? Math.max(0, (lateRT - earlyRT) / earlyRT) : 0;
  const pressureStability = Math.round(Math.max(0, 1 - accDrop * 1.2 - Math.min(1, rtDrift) * 0.5) * 100);

  /**
   * MOVEMENT ECONOMY (0-100). Controller path length per valid response, against
   * a reference of ~1.1 m of travel per response. This is the term that makes
   * flailing expensive: a player who thrashes will resolve the same objects
   * while consuming three times the path, and will be scored accordingly.
   */
  const totalPath = path.left + path.right;
  const perResp = valid ? totalPath / valid : 0;
  const movementEconomy = perResp > 0
    ? Math.round(Math.max(0, Math.min(1, 1.1 / perResp)) * 100)
    : 0;

  /**
   * ELITE BREAKDOWN POINT. The bonus stage at which accuracy first fell below
   * 70% of the athlete's own main-round accuracy. Null if they never broke —
   * which for most athletes means the round ended on a single critical error
   * while they were still performing, and that is itself worth knowing.
   */
  let eliteBreakdownPoint: number | null = null;
  const bonusEv = ev.filter((e) => e.phase === "bonus" && e.cat !== "bomb" && e.cat !== "nogo");
  const stages = [...new Set(bonusEv.map((e) => e.bonusStage ?? 0))].sort((a, b) => a - b);
  for (const st of stages) {
    const s = bonusEv.filter((e) => e.bonusStage === st);
    if (s.length < 5) continue;
    const a = s.filter((e) => e.correct).length / s.length;
    if (a < (accuracyPct / 100) * 0.7) { eliteBreakdownPoint = st; break; }
  }

  /**
   * COMPOSITE LEADERBOARD RATING (§22) — one global board across every tier,
   * mode, and hand rule.
   *
   * The rating is deliberately NOT built from raw score. Raw score scales with
   * how many objects you happened to be shown and how the penalties happened to
   * land, which means an athlete can inflate it simply by playing an easy tier
   * flawlessly for a long time — and in testing, a perfect Beginner did exactly
   * that and out-ranked a strong GOAT. Raw score is a within-session number; it
   * is not a cross-session one.
   *
   * So the board ranks NORMALIZED QUALITY, and lets the difficulty coefficients
   * do the work they exist to do:
   *
   *   quality (0..1) = 0.34 accuracy
   *                  + 0.18 inhibition
   *                  + 0.16 correct-hand rate
   *                  + 0.14 reaction quality   (350 ms reference, capped at 1)
   *                  + 0.10 movement economy
   *                  + 0.08 pressure stability
   *
   *   rating = 1000 · quality^1.5
   *          · tierCoeff · modeCoeff · handRuleCoeff
   *          · bonusDepth
   *
   * Three properties fall out of this, and all three are load-bearing:
   *
   *   1. Quality is raised to 1.5, so sloppiness is punished super-linearly. A
   *      reckless run cannot buy rank with volume — every speed-linked term is
   *      already multiplied by a quality term, and the whole product is then
   *      exponentiated.
   *   2. Because quality is tier-independent and bounded at 1, the tier
   *      coefficient is genuinely decisive: equivalent quality at a harder tier
   *      always wins, and no amount of perfection at Beginner can reach GOAT.
   *   3. Reaction quality is capped at 1, so being faster than the reference
   *      cannot inflate rank — it can only prevent being slow from deflating it.
   *      Speed is never allowed to purchase accuracy.
   *
   * Custom Mode sessions are scored in-session but never ranked (§18).
   */
  const precision = profilePrecision(
    ev.filter((e) => e.precisionM !== undefined && e.radiusM !== undefined && e.correct)
      .map((e) => ({ distM: e.precisionM!, radiusM: e.radiusM!, dx: e.offX, dy: e.offY, dz: e.offZ })),
  );
  const gate = precisionGate(accuracyPct, precision.localizationIndex);

  const rtQuality = avgRT > 0 ? Math.min(1, 350 / avgRT) : 0;
  const quality =
    0.34 * (accuracyPct / 100) +
    0.18 * inhibRate +
    0.16 * handAcc +
    0.14 * rtQuality +
    0.10 * (movementEconomy / 100) +
    0.08 * (pressureStability / 100);
  // Localization is folded in as a MULTIPLIER, not another additive term. An
  // athlete who only ever grazes the edge of the target is not 92% as good as one
  // who finds the centre — they have a materially worse spatial model, and the
  // board should say so. The floor of 0.7 keeps it from being punitive.
  const localizationFactor = 0.7 + 0.3 * (precision.localizationIndex / 100);

  // Bonus depth is weighted BY TIER: surviving eight bonus stages at Beginner
  // and eight at GOAT are not the same achievement, and the board must not
  // pretend they are.
  const bonusDepth = 1 + Math.min(1.5, engine.bonusStage * 0.10 * (TIER_COEFF[settings.tier] / 2.2));

  const compositeRating = settings.custom
    ? 0
    : Math.max(0, Math.round(
      1000 * Math.pow(Math.max(0, quality), 1.5) * localizationFactor *
      TIER_COEFF[settings.tier] * MODE_COEFF[settings.mode] * HANDRULE_COEFF[settings.handRule] *
      bonusDepth,
    ));

  // ---- PERFORMANCE SCORE (athlete-facing)
  const totalHits = valid;
  const centringQuality = (precision.perfectPct * 1.0 + precision.goodPct * 0.5 + precision.poorPct * 0.1) / 100; // 0..1
  const streakFactor = 1 + Math.min(1.5, engine.longestStreak / 40); // longest streak, up to 2.5x
  const performanceScore = Math.round(totalHits * centringQuality * streakFactor * 10);

  return {
    performanceScore, totalHits,
    precision, advanceReady: gate.ready, advanceReason: gate.reason,
    valid, blocked, caught, released, missed, wrongHand, wrongAction,
    retentionFails, zoneFails, accuracyPct,
    avgRT, medianRT: Math.round(median(rts)),
    fastestRT: rts.length ? Math.round(Math.min(...rts)) : 0,
    slowestRT: rts.length ? Math.round(Math.max(...rts)) : 0,
    rtSD: Math.round(sd(rts)),
    leftRT, rightRT, eitherRT: rtFor((e) => e.requiredHand === "either"),
    recoveryRT, bonusRT: rtFor((e) => e.phase === "bonus"),
    bombsDodged, bombContacts, bombAvoidPct: pct(bombsDodged, bombs.length),
    nogoAvoided, nogoContacts, nogoAvoidPct: pct(nogoAvoided, nogos.length),
    hesitations,
    slowdowns: engine.slowdownTotal(), slowdownCauses: engine.slowdownCauses.map(String),
    postRecoveryAccuracyPct,
    leftCount, rightCount,
    handBalancePct: pct(Math.min(leftCount, rightCount), Math.max(1, Math.max(leftCount, rightCount))),
    handSelectionAccPct: Math.round(handAcc * 1000) / 10,
    pathLeftM: Math.round(path.left * 10) / 10,
    pathRightM: Math.round(path.right * 10) / 10,
    score: engine.score, mainScore: engine.mainScore, bonusScore: engine.bonusScore,
    longestStreak: engine.longestStreak,
    peakSimultaneous: engine.peakSimultaneous,
    peakSpeed: Math.round(engine.peakSpeed * 10) / 10,
    bonusStage: engine.bonusStage,
    bonusDurationMs: engine.bonusDurationMs(),
    failCause: engine.failCause,
    decisionEfficiency, bilateralCoordination, inhibitionControl, recoveryResilience,
    trackingLoadCapacity, pressureStability, movementEconomy, eliteBreakdownPoint,
    compositeRating,
  };
}
