import type { TargetZone } from "@/ares/drillTypes";

export const EYE_Y = 1.5;

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
 * Position a target in a zone at a given visual eccentricity (degrees from
 * central fixation) and viewing distance (m). The athlete stands at origin
 * facing -Z; fixation lives at (0, EYE_Y, -distance).
 */
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
  // Vertical eccentricity is compressed to keep targets in comfortable view
  return [dx * r + jx, EYE_Y + dy * r * 0.6 + jy, -distance];
}
