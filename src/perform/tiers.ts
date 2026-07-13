/**
 * PERFORM — THE TEN-TIER PERFORMANCE LADDER
 *
 * The governing principle: higher tiers are NOT merely faster.
 *
 * A track that only speeds up trains one thing — motor throughput. It hits a
 * ceiling the moment the hands can no longer physically keep up, and everything
 * above that ceiling is noise. So the ladder scales two orthogonal families:
 *
 *   MOTOR AXES      density · approach speed · target size · spatial spread ·
 *                   crossovers · doubles · syncopation
 *
 *   COGNITIVE AXES  inhibition (voids) · decoys · late rule-changes ·
 *                   mirrored hand mapping · unstable flight (pursuit) ·
 *                   ordered memory bursts · visual clutter · occlusion
 *
 * Tiers 1-3 are pure motor. Tier 4 introduces the first suppression demand.
 * From there each tier adds ONE new cognitive layer while the motor axes creep
 * — so the athlete always knows exactly what is new, and failure is diagnostic
 * rather than diffuse. Tier 10 stops being a fixed rung: it is a live staircase
 * that finds the athlete's edge and holds them on it.
 *
 * Every mechanic is expressed with primitives the DrillEngine already owns
 * (noGo / distractor / switchKindAt / requiredHand / wander / groupMode / decor
 * / onSpawnAdapt), so tiers compose with strobe, seated mode, and the
 * prescription engine for free.
 */

export interface TierSpec {
  tier: number;
  name: string;
  /** one-line statement of the NEW demand this tier introduces */
  adds: string;

  // ---- motor axes
  /** note-density multiplier on the track's base fill */
  fillMul: number;
  /** absolute offbeat (eighth-note) probability */
  offbeat: number;
  /** absolute doubles (both hands, same beat) probability */
  doubles: number;
  /** absolute crossover (strike across the midline) probability */
  crossover: number;
  /** 0 = midline-hugging, 1 = full peripheral field */
  spread: number;
  /** approach-time multiplier — >1 = longer read, <1 = shorter read */
  approachMul: number;
  /** target-scale multiplier — bigger targets are more forgiving */
  sizeMul: number;

  // ---- cognitive axes (0 = mechanic absent at this tier)
  /** VOID: a target that must NOT be struck (inhibition) */
  suppress: number;
  /** DECOY: a lookalike that carries no score and punishes on contact */
  decoy: number;
  /** LATE VOID: arms as a live note, then disarms mid-flight (rule change under load) */
  lateVoid: number;
  /** MIRROR: hand mapping inverts — a purple note must be taken with the LEFT */
  mirror: number;
  /** DRIFT: the note wanders in flight — pursuit-to-strike, not ballistic */
  unstable: number;
  /** BURST: an ordered 2-3 note cluster struck in sequence (working memory) */
  burst: number;
  /** CLUTTER: inert decorative traffic that must be visually filtered out */
  clutter: number;
  /** tier 10 only — live staircase instead of a fixed rung */
  adaptive: boolean;
}

export const TIERS: TierSpec[] = [
  { tier: 1,  name: "Orientation",        adds: "Learn the strike. Nothing else.",
    fillMul: 0.50, offbeat: 0.00, doubles: 0.00, crossover: 0.00, spread: 0.08, approachMul: 1.50, sizeMul: 1.40,
    suppress: 0,    decoy: 0,    lateVoid: 0,    mirror: 0,    unstable: 0,    burst: 0,    clutter: 0,    adaptive: false },
  { tier: 2,  name: "Beginner",           adds: "Hand identity under a steady pulse.",
    fillMul: 0.66, offbeat: 0.02, doubles: 0.00, crossover: 0.00, spread: 0.20, approachMul: 1.32, sizeMul: 1.28,
    suppress: 0,    decoy: 0,    lateVoid: 0,    mirror: 0,    unstable: 0,    burst: 0,    clutter: 0,    adaptive: false },
  { tier: 3,  name: "Foundation",         adds: "Bilateral doubles and the first offbeats.",
    fillMul: 0.80, offbeat: 0.07, doubles: 0.04, crossover: 0.00, spread: 0.36, approachMul: 1.18, sizeMul: 1.16,
    suppress: 0,    decoy: 0,    lateVoid: 0,    mirror: 0,    unstable: 0,    burst: 0,    clutter: 0,    adaptive: false },
  { tier: 4,  name: "Intermediate",       adds: "VOIDS - targets you must NOT strike. Inhibition begins.",
    fillMul: 0.90, offbeat: 0.12, doubles: 0.06, crossover: 0.08, spread: 0.50, approachMul: 1.08, sizeMul: 1.06,
    suppress: 0.11, decoy: 0,    lateVoid: 0,    mirror: 0,    unstable: 0,    burst: 0,    clutter: 0,    adaptive: false },
  { tier: 5,  name: "Advanced",           adds: "DECOYS - lookalikes that punish a careless hand.",
    fillMul: 1.00, offbeat: 0.17, doubles: 0.08, crossover: 0.15, spread: 0.64, approachMul: 1.00, sizeMul: 1.00,
    suppress: 0.12, decoy: 0.15, lateVoid: 0,    mirror: 0,    unstable: 0,    burst: 0,    clutter: 0.18, adaptive: false },
  { tier: 6,  name: "Expert",             adds: "LATE VOIDS - a live note disarms in flight. Cancel the swing.",
    fillMul: 1.06, offbeat: 0.22, doubles: 0.10, crossover: 0.21, spread: 0.74, approachMul: 0.95, sizeMul: 0.96,
    suppress: 0.10, decoy: 0.16, lateVoid: 0.14, mirror: 0,    unstable: 0,    burst: 0,    clutter: 0.25, adaptive: false },
  { tier: 7,  name: "Elite",              adds: "MIRROR + DRIFT - the rule inverts and the target refuses to fly straight.",
    fillMul: 1.12, offbeat: 0.27, doubles: 0.12, crossover: 0.26, spread: 0.84, approachMul: 0.90, sizeMul: 0.92,
    suppress: 0.10, decoy: 0.16, lateVoid: 0.15, mirror: 0.16, unstable: 0.18, burst: 0,    clutter: 0.32, adaptive: false },
  { tier: 8,  name: "Pro",                adds: "BURSTS - numbered clusters struck in order. Working memory joins the swing.",
    fillMul: 1.16, offbeat: 0.31, doubles: 0.14, crossover: 0.30, spread: 0.90, approachMul: 0.86, sizeMul: 0.88,
    suppress: 0.10, decoy: 0.17, lateVoid: 0.16, mirror: 0.18, unstable: 0.22, burst: 0.14, clutter: 0.40, adaptive: false },
  { tier: 9,  name: "World-Class",        adds: "Every mechanic live at full field, full pace. No safe lane.",
    fillMul: 1.20, offbeat: 0.35, doubles: 0.17, crossover: 0.34, spread: 1.00, approachMul: 0.80, sizeMul: 0.84,
    suppress: 0.11, decoy: 0.19, lateVoid: 0.18, mirror: 0.20, unstable: 0.26, burst: 0.18, clutter: 0.50, adaptive: false },
  // T10 STARTS AT WORLD-CLASS. It is not an easier rung with a gimmick bolted
  // on — it is T9 with the ceiling removed. The staircase then moves in BOTH
  // directions: a clean streak tightens speed and shrinks targets past anything
  // on the fixed ladder; a stumble immediately backs it off. The athlete is held
  // at their edge instead of being run into a wall.
  { tier: 10, name: "Adaptive Unlimited", adds: "The ladder ends. The staircase begins - it finds your edge and holds you there.",
    fillMul: 1.20, offbeat: 0.35, doubles: 0.17, crossover: 0.34, spread: 1.00, approachMul: 0.80, sizeMul: 0.84,
    suppress: 0.11, decoy: 0.19, lateVoid: 0.18, mirror: 0.20, unstable: 0.26, burst: 0.18, clutter: 0.50, adaptive: true },
];

export const PERFORM_TIERS = TIERS.length;

export function tierAt(level: number): TierSpec {
  return TIERS[Math.max(0, Math.min(TIERS.length - 1, level - 1))];
}

/** Tiers 7+ are eligible for stroboscopic occlusion (visual-interruption load). */
export const STROBE_ELIGIBLE_TIER = 7;

/**
 * TIER GATE - a rung unlocks only when the one below it has been HELD, not
 * merely survived. 85% is high enough that the athlete has genuinely absorbed
 * the new mechanic, low enough that it is not a wall. Tiers 1-3 are ungated so
 * a new athlete is never blocked from a real workout on day one.
 */
export const TIER_GATE_ACCURACY = 85;
export const UNGATED_TIERS = 3;
