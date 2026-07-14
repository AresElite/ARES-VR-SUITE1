import type { TargetZone } from "@/ares/drillTypes";

export const EYE_Y = 1.5;

/**
 * STRIKE_REACH — the physical interaction shell.
 * The suite is an eye-hand coordination system: athletes REACH OUT AND
 * STRIKE targets with their hands/controllers. Targets therefore live on a
 * shell ~0.55–0.75 m from the athlete's chest — always within arm's reach,
 * never requiring a step.
 */
export const STRIKE_REACH = 0.68;

/**
 * THE REACH CEILING — a hard guarantee, not a convention.
 *
 * Shoulders sit ~0.19 m either side of the midline at ~1.42 m. A strike inside
 * ~0.82 m of the relevant shoulder is a reach; past that it becomes a lunge, and
 * a planted athlete simply cannot get there without stepping.
 *
 * Individual drills were passing their own `reach` values — 0.92, 0.98 — and
 * high-eccentricity peripheral zones then pushed the result further still. Six
 * drills ended up with targets that were physically unstrikeable, and the failure
 * was silent: the athlete swings, nothing registers, the target expires, and the
 * drill records a miss that was never theirs. Focus-Frenzy was the extreme case.
 *
 * So the ceiling is enforced HERE, at the one function every strike target goes
 * through. A drill may ask for whatever eccentricity it likes; it may not ask for
 * an eccentricity the athlete's arm cannot satisfy.
 */
export const MAX_STRIKE_DIST = 0.82;
const SHOULDER_Y = 1.42;
const SHOULDER_X = 0.19;

/**
 * Pull a commanded position back inside the athlete's arm, preserving direction.
 *
 * HAND-AWARE. If a target is assigned to a specific hand, reach is measured from
 * THAT hand's shoulder — not the nearest one. A right-hand target sitting at
 * x = -0.74 is 0.98 m from the right shoulder: a full cross-body lunge that a
 * planted athlete simply cannot make. It looked reachable to a naive check
 * because it was close to the LEFT shoulder — the shoulder that is forbidden from
 * taking it. Depth Slice and Chaos Arena were both doing this, and the athlete ate
 * a wrong-hand error or a miss for a target no correct hand could ever have met.
 */
export function clampToReach(
  p: [number, number, number],
  hand?: "left" | "right" | "either" | "both",
): [number, number, number] {
  const sx = hand === "left" ? -SHOULDER_X
    : hand === "right" ? SHOULDER_X
    : p[0] >= 0 ? SHOULDER_X : -SHOULDER_X;
  const dx = p[0] - sx, dy = p[1] - SHOULDER_Y, dz = p[2];
  const d = Math.hypot(dx, dy, dz);
  if (d <= MAX_STRIKE_DIST || d < 1e-6) return p;
  const k = MAX_STRIKE_DIST / d;
  return [sx + dx * k, SHOULDER_Y + dy * k, dz * k];
}

const DEG = Math.PI / 180;

/** Unit offsets per zone (x = right, y = up) on the view plane. */
const ZONE_DIR: Record<TargetZone, [number, number]> = {
  center: [0, 0],
  left: [-1, 0],
  right: [1, 0],
  up: [0, 1],
  down: [0, -1],
  upLeft: [-0.707, 0.707],
  upRight: [0.707, 0.707],
  downLeft: [-0.707, -0.707],
  downRight: [0.707, -0.707],
};

export const PERIPHERAL_ZONES: TargetZone[] = [
  "left",
  "right",
  "up",
  "down",
  "upLeft",
  "upRight",
  "downLeft",
  "downRight",
];

export const LATERAL_ZONES: TargetZone[] = ["left", "right", "upLeft", "upRight", "downLeft", "downRight"];

/**
 * Position a target in a zone at a visual eccentricity (degrees from central
 * fixation) on the strike shell. The athlete stands at origin facing -Z.
 * Vertical spread is compressed and clamped to a comfortable strike band.
 */
export function strikePosition(
  zone: TargetZone,
  eccentricityDeg: number,
  jitter = 0,
  rng?: () => number,
  reach = STRIKE_REACH,
): [number, number, number] {
  const [dx, dy] = ZONE_DIR[zone];
  const ecc = eccentricityDeg * DEG;
  const jx = jitter && rng ? (rng() - 0.5) * jitter : 0;
  const jy = jitter && rng ? (rng() - 0.5) * jitter : 0;
  const x = Math.sin(ecc) * reach * dx + jx;
  const y = EYE_Y - 0.15 + Math.sin(ecc) * reach * 0.62 * dy + jy;
  const z = -Math.cos(ecc * 0.55) * reach;
  /**
   * The vertical floor is 1.05 m, not 0.95 m. On the strike shell (~0.6 m out) a
   * target at 0.95 m sits 47 degrees below the horizon — and to strike it the athlete
   * must LOOK 47 degrees down, which is deep enough to arm the control dock and bury
   * the target behind a menu. Below the hip a strike is an awkward, low-value rep
   * anyway; raising the floor 10 cm costs nothing and keeps every target above the
   * dock's sightline.
   */
  return clampToReach([x, Math.min(1.85, Math.max(1.05, y)), z]);
}

/** Legacy far-field position (visual anchors, decorative movers). */
export function zonePosition(
  zone: TargetZone,
  eccentricityDeg: number,
  distance: number,
  jitter = 0,
  rng?: () => number,
): [number, number, number] {
  const [dx, dy] = ZONE_DIR[zone];
  const r = Math.tan(eccentricityDeg * DEG) * distance;
  const jx = jitter && rng ? (rng() - 0.5) * jitter : 0;
  const jy = jitter && rng ? (rng() - 0.5) * jitter : 0;
  return [dx * r + jx, EYE_Y + dy * r * 0.6 + jy, -distance];
}
