import type { AegisTuning, AegisCategory } from "./types";

export type Vec3 = [number, number, number];

/**
 * THE TRAJECTORY SYSTEM (§9) — hybrid. Low tiers fly straight down three fixed
 * lanes so the athlete can build a clean internal model of the space. High tiers
 * curve, accelerate, cross, and change vector late. GOAT trajectories are
 * generated fresh against live performance.
 *
 * Objects travel a quadratic Bezier p0 -> ctrl -> p1. A straight lane is simply
 * the degenerate case where ctrl sits on the midpoint, so ONE evaluator covers
 * every tier and there is no second code path to get wrong.
 *
 * SAFETY IS A CONSTRUCTION CONSTRAINT, NOT A FILTER (§33). Every candidate is
 * clamped into the safe envelope at generation time rather than generated freely
 * and rejected afterward — a rejection loop can starve, a clamp cannot.
 */

// The athlete stands at the origin, facing -Z. Head at ~1.6m.
export const HEAD: Vec3 = [0, 1.6, 0];

/** SAFE ENVELOPE — derived from calibration; these are the un-calibrated defaults. */
export const SAFE = {
  /** never reach across further than this (shoulder-safe lateral limit) */
  maxLateral: 0.78,
  /** no extreme overhead reach; no floor-scraping targets */
  minY: 0.95,
  maxY: 2.02,
  /** nothing spawns behind the athlete, ever */
  minZ: -9.0,
  maxZ: 0.2,
  /** a target may not pass through this sphere around the head (§33 face-crossing) */
  headClearance: 0.22,
  /** bombs must arrive far enough off the midline that a torso lean clears them */
  bombLateralMin: 0.16,
  bombLateralMax: 0.52,
  /** two objects arriving together must be this far apart or the controllers collide */
  minPairSeparation: 0.30,
};

/** Fixed lanes for the low tiers: front-left, centre, front-right (§9). */
const LANES: Vec3[] = [
  [-0.42, 1.42, -0.5],
  [0.0, 1.5, -0.5],
  [0.42, 1.42, -0.5],
];

function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)); }

export function bezier(p0: Vec3, c: Vec3, p1: Vec3, t: number): Vec3 {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
    u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
    u * u * p0[2] + 2 * u * t * c[2] + t * t * p1[2],
  ];
}

/** Distance from a point to the segment p0->p1, used for the head-clearance test. */
function distToSeg(p: Vec3, a: Vec3, b: Vec3): number {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap: Vec3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-6;
  const t = clamp((ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / len2, 0, 1);
  const c: Vec3 = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  return Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
}

/**
 * SAFETY VALIDATOR — the single gate every trajectory must pass. Exported so the
 * test harness can assert it directly against millions of generated paths.
 */
export function validate(p0: Vec3, ctrl: Vec3, p1: Vec3, cat: AegisCategory): string[] {
  const bad: string[] = [];
  for (const [name, p] of [["p0", p0], ["ctrl", ctrl], ["p1", p1]] as [string, Vec3][]) {
    if (p[2] > SAFE.maxZ) bad.push(`${name}: behind the athlete`);
  }
  if (Math.abs(p1[0]) > SAFE.maxLateral) bad.push("arrival outside safe lateral reach");
  if (p1[1] < SAFE.minY || p1[1] > SAFE.maxY) bad.push("arrival outside safe vertical reach");

  // No path may cross the face. Sample the curve rather than trusting the hull.
  for (let i = 0; i <= 12; i++) {
    const q = bezier(p0, ctrl, p1, i / 12);
    if (q[2] < 0.05 && Math.hypot(q[0] - HEAD[0], q[1] - HEAD[1], q[2] - HEAD[2]) < SAFE.headClearance) {
      // A BOMB is *supposed* to threaten the head — that is the dodge. But it must
      // never arrive so centrally that a torso lean cannot clear it.
      if (cat !== "bomb") bad.push("path crosses the face");
      else if (Math.abs(p1[0]) < SAFE.bombLateralMin) bad.push("bomb unavoidable by torso lean");
      break;
    }
  }
  if (distToSeg(HEAD, p0, p1) < 0.02) bad.push("path passes through the head");
  return bad;
}

/**
 * Generate one trajectory. `t` is a normalized difficulty/complexity scalar that
 * the adaptive engine can raise on a streak and lower during recovery (§9).
 */
export function makeTrajectory(
  cat: AegisCategory,
  tune: AegisTuning,
  rng: () => number,
  complexity: number,
): { p0: Vec3; ctrl: Vec3; p1: Vec3 } {
  const c = clamp(tune.curveAmount * complexity, 0, 1);

  // ---- ARRIVAL POINT
  let ax: number, ay: number;
  if (c < 0.2) {
    // fixed lanes — a clean, learnable model of the space
    const lane = LANES[Math.floor(rng() * 3)];
    ax = lane[0]; ay = lane[1];
  } else {
    // varied lateral / height / depth, widening with complexity
    ax = (rng() * 2 - 1) * (0.30 + c * 0.46);
    ay = 1.20 + rng() * (0.34 + c * 0.42);
  }

  if (cat === "bomb") {
    // A bomb must arrive in the dodge corridor: close enough to the midline to
    // demand a real torso commitment, far enough out that leaning clears it.
    const side = rng() < 0.5 ? -1 : 1;
    ax = side * (SAFE.bombLateralMin + rng() * (SAFE.bombLateralMax - SAFE.bombLateralMin));
    ay = 1.34 + rng() * 0.36; // head/upper-torso band — never a crouch, never a jump
  }
  if (cat === "bonus") {
    // bonus targets are deliberately more peripheral — that is what makes them
    // worth something, and what makes missing one acceptable (§6)
    ax = (rng() * 2 - 1) * (0.52 + c * 0.24);
    ay = 1.12 + rng() * 0.72;
  }

  ax = clamp(ax, -SAFE.maxLateral, SAFE.maxLateral);
  ay = clamp(ay, SAFE.minY + 0.02, SAFE.maxY - 0.02);
  const p1: Vec3 = [ax, ay, -0.5];

  // ---- ORIGIN: far field, roughly ahead, spread out with complexity
  const depth = -(5.0 + rng() * 2.5);
  const ox = clamp(ax * (0.2 + rng() * 0.5) + (rng() * 2 - 1) * (0.5 + c * 1.5), -2.6, 2.6);
  const oy = clamp(1.35 + (rng() * 2 - 1) * (0.25 + c * 0.7), 0.7, 2.6);
  const p0: Vec3 = [ox, oy, depth];

  // ---- CONTROL POINT: the curve. At c=0 it sits on the midpoint (straight line).
  const mid: Vec3 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
  const bend = c * (0.8 + rng() * 1.5);
  const side = rng() < 0.5 ? -1 : 1;
  let ctrl: Vec3 = [
    mid[0] + side * bend * (0.5 + rng() * 0.6),
    mid[1] + (rng() * 2 - 1) * bend * 0.5,
    mid[2] + (rng() - 0.5) * bend * 0.5,
  ];

  // Clamp the control point out of the face. A curve that swings through the
  // athlete's head is not a difficulty feature, it is a defect.
  const dh = Math.hypot(ctrl[0] - HEAD[0], ctrl[1] - HEAD[1], ctrl[2] - HEAD[2]);
  if (ctrl[2] > -0.6 && dh < 0.5) {
    ctrl = [ctrl[0] + Math.sign(ctrl[0] || 1) * 0.6, ctrl[1], -0.9];
  }
  if (ctrl[2] > SAFE.maxZ) ctrl[2] = SAFE.maxZ - 0.1;

  return { p0, ctrl, p1 };
}

/** Arc length (sampled) — used to convert tuning speed into a flight duration. */
export function arcLength(p0: Vec3, ctrl: Vec3, p1: Vec3): number {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= 16; i++) {
    const q = bezier(p0, ctrl, p1, i / 16);
    len += Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]);
    prev = q;
  }
  return len;
}

/** Do two simultaneous arrivals force the controllers into each other? (§9, §33) */
export function pairSafe(a: Vec3, b: Vec3): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) >= SAFE.minPairSeparation;
}
