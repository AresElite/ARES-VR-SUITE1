/**
 * AEGIS — the A.R.E.S. flagship eye-hand coordination drill.
 *
 * Named for Athena's shield: the primary verb is BLOCK, and the brand already
 * carries the Athena cue. This is not a rhythm game and not entertainment-first.
 * It is a measurement instrument that happens to be exhilarating to play.
 *
 * THE SHAPE OF A SESSION
 *   MAIN ROUND   exactly 5:00, continuous, standardized. Errors never end it —
 *                comparability across sessions is the whole point.
 *   BONUS ROUND  begins immediately, escalates in stages, runs until failure.
 *                Measures how long elite accuracy survives past the standard.
 *
 * REDUNDANT CODING (§7): identity is NEVER carried by color alone. Every
 * category owns colour + silhouette + geometry, each independently sufficient.
 * This is not an "accessibility mode" — it is THE mode, for every athlete, so
 * the drill measures eye-hand coordination and response selection rather than
 * colour discrimination.
 */

export type AegisCategory =
  | "left"   // TEAL   · CUBE      · must be taken with the LEFT
  | "right"  // PURPLE · OCTAHEDRON· must be taken with the RIGHT
  | "either" // WHITE  · SPHERE    · either hand; efficient selection rewarded
  | "bomb"   // BLACK  · SPIKED    · avoid with head/torso. Never touch.
  | "bonus"  // GOLD-PURPLE · STAR · optional; faster, smaller, more peripheral
  | "together" // DARK BLUE · SPHERE · take with BOTH hands brought close together
  | "rail"   // a guided PATH one hand must ride for a short window
  | "nogo";  // a stimulus-coloured SPHERE wearing contrast stripes. Do not touch.

export type AegisAction = "block" | "catch";
export type AegisMode = "block" | "catch" | "mixed";
export type HandRule = "symmetric" | "asymmetric" | "adaptive";
export type AegisTier = "beginner" | "intermediate" | "advanced" | "pro" | "goat";

/** Session phase — the state machine's authoritative position. */
export type AegisPhase =
  | "countdown"
  | "main"      // the standardized 5:00
  | "bonus"     // escalating, until failure
  | "complete";

/** Pace state — orthogonal to phase. A critical error drops pace, not phase. */
export type AegisPace = "normal" | "slowdown" | "recovery";

export type RequiredHand = "left" | "right" | "either";

/**
 * VISUAL LANGUAGE. Shape carries as much information as colour, and the
 * silhouettes are chosen to stay separable in the far periphery at speed:
 * a cube reads as flat-edged, an octahedron as pointed, a sphere as round,
 * a spiked form as dangerous, a star as special, a hollow ring as empty.
 * No category is dramatically more salient than another (§7).
 */
export const CATEGORY_VISUAL: Record<AegisCategory, { color: string; shape: string; label: string }> = {
  // Hit targets are all SPHERES, told apart by COLOUR: teal = left hand, purple = right/either.
  left:     { color: "#2998AA", shape: "sphere", label: "LEFT" },
  right:    { color: "#8B5CF6", shape: "sphere", label: "RIGHT" },
  either:   { color: "#8B5CF6", shape: "sphere", label: "EITHER" },
  // Bombs are GRAY CUBES to be dodged.
  bomb:     { color: "#8A90A6", shape: "box",    label: "BOMB" },
  bonus:    { color: "#C9A6FF", shape: "pyramid", label: "BONUS" },
  // Bring BOTH hands together for the dark-blue sphere.
  together: { color: "#2563EB", shape: "sphere", label: "TOGETHER" },
  // Ride the rail: a marker the assigned hand must FOLLOW along a short path.
  rail:     { color: "#8B5CF6", shape: "sphere", label: "RAIL" },
  // A stimulus-coloured sphere wearing contrast stripes — salient, but do NOT take it.
  nogo:     { color: "#8B5CF6", shape: "sphere", label: "NO-GO" },
};

/** A live object in flight. */
export interface AegisObject {
  id: string;
  cat: AegisCategory;
  /** block or catch — in mixed mode this is independent of hand assignment */
  action: AegisAction;
  requiredHand: RequiredHand;

  spawnT: number;      // engine ms at spawn
  actionableT: number; // ms at which it becomes actionable — the RT baseline (§16)
  arriveT: number;     // ms at which it reaches the strike plane
  failT: number;       // ms at which it crosses the failure plane unresolved

  /** quadratic-bezier control points: p0 -> ctrl -> p1 */
  p0: [number, number, number];
  ctrl: [number, number, number];
  p1: [number, number, number];
  scale: number;

  /** catch state */
  heldBy?: "left" | "right";
  heldSince?: number;
  releaseZone?: [number, number, number];

  /** per-object colour override (no-go borrows a stimulus colour; together is dark blue) */
  color?: string;
  /** contrast-stripe apparentness for no-go, 0..1 — very apparent early, subtle later */
  stripes?: number;
  /** together: the object is only taken when BOTH hands are on it, close together */
  needsBothHands?: boolean;
  /** rail: ms the assigned hand has stayed ON the moving marker (drives success) */
  onRailMs?: number;

  resolved: boolean;
  /** set once resolved — drives scoring and the event log */
  outcome?: AegisOutcome;
  /** first frame the athlete's hand entered the bomb danger radius (§15) */
  hesitationAt?: number;
  /** internal: has movement initiation been logged for this object */
  moveInitAt?: number;
}

export type AegisOutcome =
  | "blocked"
  | "caught"
  | "released"        // caught, retained, delivered to the release zone
  | "avoided"         // bomb or no-go correctly left alone
  | "miss"            // crossed the failure plane unresolved
  | "wrongHand"       // CRITICAL
  | "wrongAction"     // CRITICAL — blocked something that had to be caught
  | "bombContact"     // CRITICAL
  | "nogoContact"     // CRITICAL — inhibition failure
  | "dropped"         // retention failed
  | "lateGrip"
  | "earlyGrip"
  | "missedZone";     // released outside the zone, or too late

export const CRITICAL_OUTCOMES: AegisOutcome[] = [
  "wrongHand", "wrongAction", "bombContact", "nogoContact",
];

/** One recorded event. Every field the analytics layer needs (§35). */
export interface AegisEvent {
  t: number;                 // ms from session start
  phase: AegisPhase;
  pace: AegisPace;
  objectId: string;
  cat: AegisCategory;
  action: AegisAction;
  requiredHand: RequiredHand;
  responseHand?: "left" | "right";
  responseAction?: AegisAction;
  outcome: AegisOutcome;
  correct: boolean;
  critical: boolean;
  /** PRIMARY RT (§16): actionable -> valid response. The headline number. */
  reactionMs?: number;
  /** spawn -> response. Includes the read-and-wait, so it is NOT the headline. */
  spawnToResponseMs?: number;
  /** movement initiation latency — actionable -> first meaningful hand motion */
  moveInitMs?: number;
  /** contact-point distance from object centre (m) — spatial accuracy */
  precisionM?: number;
  /** the object's contact radius at that moment — precisionM is normalized by it */
  radiusM?: number;
  /** signed hand-minus-centre offset (m) — separates systematic bias from noise */
  offX?: number; offY?: number; offZ?: number;
  /** perfect (centre 10%) / good / poor (outer 30%) */
  precisionZone?: import("@/ares/precision").PrecisionZone;
  /** controller speed at contact (m/s) — separates a controlled block from a flail */
  contactSpeed?: number;
  /** dot(approach vector, controller velocity) — was the block driven INTO the object */
  directionQuality?: number;
  /** hand path length consumed resolving this object (m) — movement economy */
  pathM?: number;
  scoreDelta: number;
  bonusStage?: number;
}

export interface AegisSettings {
  tier: AegisTier;
  mode: AegisMode;
  handRule: HandRule;
  /** Custom Mode overrides — when present, the session is NOT standardized (§18) */
  custom?: Partial<AegisTuning>;
  bonusEnabled: boolean;
}

/** Every knob Custom Mode is allowed to touch (§18). */
export interface AegisTuning {
  speed: number;              // m/s along the trajectory
  targetSize: number;         // metres
  spawnIntervalMs: number;    // action density
  maxSimultaneous: number;    // tracking load
  bombRate: number;
  nogoRate: number;
  bonusRate: number;
  togetherRate: number;      // dark-blue both-hands targets (asymmetric only)
  railRate: number;          // "ride the rail" follow-the-path segments
  eitherRate: number;
  curveAmount: number;        // 0 = straight lanes, 1 = full 3D adaptive
  lateVectorChange: number;   // probability of a deceptive late course change
  timingWindowMs: number;     // catch/block window half-width
  minBlockSpeed: number;      // m/s — below this a "block" is passive contact
  requireDirection: boolean;  // does the block vector have to be correct
  retentionMs: number;        // how long a catch must be held
  requireRelease: boolean;    // must the catch be delivered to a zone
  slowdownMs: number;         // max slowdown duration
  slowdownFactor: number;     // speed multiplier while slowed
  recoveryStreak: number;     // correct responses needed to clear a slowdown
  failPlaneZ: number;         // metres behind the athlete
  ruleSwitchRate: number;     // adaptive hand-rule switches per minute
  hesitationPenalty: boolean; // Pro/GOAT only
  feedbackIntensity: number;  // 0..1 — tiered down as skill rises
  hapticIntensity: number;    // 0..1
  durationMs: number;         // main round; standardized at 300000
}
