/**
 * HAND LOCALIZATION PRECISION.
 *
 * Hitting a target and MEETING IT AT ITS CENTRE are different skills. An athlete
 * who consistently catches the ball on the outer edge is not merely "less neat" —
 * they have a systematically biased internal model of where their hand is in
 * space, and that bias is invisible to accuracy. Two athletes can both score 95%
 * and have completely different proprioceptive maps.
 *
 * So every contact is classified by its RADIAL distance from the target centre,
 * normalized to the target's own radius — a 7 cm miss on a big pad and a 7 cm
 * miss on a small one are not the same error, and normalizing is what makes the
 * measure comparable across tiers, drills, and target sizes.
 *
 *   PERFECT   r <= 0.25    the middle 25%. Dead centre.
 *   GOOD      0.25 < r <= 0.75  solidly on the target.
 *   POOR      r > 0.75     the outer 25%. Caught it, but barely.
 *
 * This is a spatial-localization measure, not a timing one. It is deliberately
 * scored SEPARATELY from accuracy so that neither can hide the other.
 */

export type PrecisionZone = "perfect" | "good" | "poor";

export const PERFECT_R = 0.25;   // the middle 25% of the target — "dead centre"
export const GOOD_R = 0.75;      // 26%-75% — solidly on it

/**
 * @param distM   hand-to-target-centre distance at contact, metres
 * @param radiusM the target's contact radius, metres
 */
export function classifyPrecision(distM: number, radiusM: number): PrecisionZone {
  const r = radiusM > 0 ? distM / radiusM : 1;
  // Epsilon matters here. A hit exactly ON the 10% line divides to
  // 0.10000000000000002 in binary floating point and would fall out of PERFECT —
  // an athlete would be told they missed the centre by 2e-17 of a target radius.
  const EPS = 1e-9;
  if (r <= PERFECT_R + EPS) return "perfect";
  if (r <= GOOD_R + EPS) return "good";
  return "poor";
}

export interface PrecisionProfile {
  perfectPct: number;
  goodPct: number;
  poorPct: number;
  /** mean normalized radial offset, 0 = dead centre, 1 = the very edge */
  meanRadial: number;
  /**
   * LOCALIZATION INDEX (0–100). A single number for how well the athlete knows
   * where their hands are. Weighted so that PERFECT is worth substantially more
   * than GOOD — because the gap between "on the target" and "on the centre of the
   * target" is exactly the skill being measured, and a linear weighting would let
   * an athlete who never once found the centre still score respectably.
   */
  localizationIndex: number;
  /**
   * DIRECTIONAL BIAS, metres. If an athlete's misses are randomly scattered they
   * have a NOISE problem; if they all land low-and-left they have a CALIBRATION
   * problem, and the coaching response is completely different. The mean signed
   * offset separates the two — a large bias with a small spread is systematic.
   */
  biasX: number;
  biasY: number;
  biasZ: number;
  /** spread of the offsets — high spread + low bias = noisy, not miscalibrated */
  spreadM: number;
  contacts: number;
}

export interface PrecisionSample {
  distM: number;
  radiusM: number;
  /** signed offset of the HAND from the target centre, metres */
  dx?: number;
  dy?: number;
  dz?: number;
}

export function profilePrecision(samples: PrecisionSample[]): PrecisionProfile {
  const n = samples.length;
  if (!n) {
    return {
      perfectPct: 0, goodPct: 0, poorPct: 0, meanRadial: 0,
      localizationIndex: 0, biasX: 0, biasY: 0, biasZ: 0, spreadM: 0, contacts: 0,
    };
  }
  let p = 0, g = 0, b = 0, radialSum = 0;
  let sx = 0, sy = 0, sz = 0;
  for (const s of samples) {
    const z = classifyPrecision(s.distM, s.radiusM);
    if (z === "perfect") p++; else if (z === "good") g++; else b++;
    radialSum += s.radiusM > 0 ? Math.min(1.5, s.distM / s.radiusM) : 1;
    sx += s.dx ?? 0; sy += s.dy ?? 0; sz += s.dz ?? 0;
  }
  const biasX = sx / n, biasY = sy / n, biasZ = sz / n;

  // spread = RMS deviation of each offset from the MEAN offset (i.e. after the
  // systematic bias is removed). This is what distinguishes noise from bias.
  let varSum = 0;
  for (const s of samples) {
    const ex = (s.dx ?? 0) - biasX, ey = (s.dy ?? 0) - biasY, ez = (s.dz ?? 0) - biasZ;
    varSum += ex * ex + ey * ey + ez * ez;
  }
  const spreadM = Math.sqrt(varSum / n);

  const pct = (x: number) => Math.round((x / n) * 1000) / 10;
  const localizationIndex = Math.round(((p * 1.0 + g * 0.45 + b * 0.05) / n) * 100);

  return {
    perfectPct: pct(p), goodPct: pct(g), poorPct: pct(b),
    meanRadial: Math.round((radialSum / n) * 1000) / 1000,
    localizationIndex,
    biasX: Math.round(biasX * 1000) / 1000,
    biasY: Math.round(biasY * 1000) / 1000,
    biasZ: Math.round(biasZ * 1000) / 1000,
    spreadM: Math.round(spreadM * 1000) / 1000,
    contacts: n,
  };
}

/**
 * PROGRESSION GATE. Precision is a SEPARATE axis from completion — an athlete who
 * completes everything but only ever grazes the edge of the target has not earned
 * the next tier, they have just learned to be adequate. Advancement requires BOTH.
 */
export function precisionGate(accuracyPct: number, localizationIndex: number): {
  ready: boolean;
  reason: string;
} {
  if (accuracyPct < 85) {
    return { ready: false, reason: "Completion is not yet consistent enough to advance." };
  }
  if (localizationIndex < 55) {
    return {
      ready: false,
      reason: "Completion is there, but the hand is not finding the centre. Hold this tier and tighten localization before adding speed.",
    };
  }
  return { ready: true, reason: "Completion and localization are both holding. Ready to advance." };
}
