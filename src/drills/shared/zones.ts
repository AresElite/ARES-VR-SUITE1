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
  return [x, Math.min(1.85, Math.max(0.95, y)), z];
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
