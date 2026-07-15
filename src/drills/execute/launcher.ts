import type { TrialSpec } from "@/ares/drillTypes";

/**
 * LAUNCHER HOLES — the shared "balls shoot out of holes" model for Raw-Reaction, Choice-RT
 * and Go/No-Go.
 *
 * A stimulus fires from one of several holes downfield and flies straight at the athlete. The
 * number of holes grows every five levels — one hole (dead centre) at levels 1-5, two at 6-10,
 * three at 11-15, and so on up to ten — and each shot comes from a RANDOM active hole, so the
 * athlete cannot pre-load a fixation point. Within each five-level band the stimulus starts
 * large and shrinks, then the next band adds a hole and resets the size, so difficulty climbs
 * on two independent axes: spatial uncertainty (holes) and acuity (size).
 */

export const LAUNCH_Z = -6;
const AIM = [0, 1.4, -0.2] as const;   // balls converge on the athlete's reach zone

/** Ten hole positions, ordered centre-outward, so band N lights the N most-central holes. */
export const HOLES: [number, number][] = (() => {
  const grid: [number, number][] = [];
  for (const y of [1.45, 1.15, 1.75]) for (const x of [0, -0.7, 0.7, -1.4, 1.4]) grid.push([x, y]);
  grid.sort((a, b) => Math.hypot(a[0], a[1] - 1.45) - Math.hypot(b[0], b[1] - 1.45));
  return grid.slice(0, 10);
})();

/** holes active at a level: one per five-level band, capped at ten. */
export function holeCount(level: number): number {
  return Math.min(HOLES.length, Math.max(1, Math.ceil(level / 5)));
}

/** per-band size sawtooth: large at the band's first level, shrinking to its last. */
export function sizeSawtooth(level: number, big = 0.10, small = 0.055): number {
  const pos = (Math.max(1, level) - 1) % 5;   // 0..4 within the band
  return big + (small - big) * (pos / 4);
}

/** the aimed launch velocity from a hole toward the athlete, at a given speed (m/s). */
export function launchVelocity(hole: [number, number], speed: number): [number, number, number] {
  const dx = AIM[0] - hole[0], dy = AIM[1] - hole[1], dz = AIM[2] - LAUNCH_Z;
  const m = Math.hypot(dx, dy, dz) || 1;
  return [(dx / m) * speed, (dy / m) * speed, (dz / m) * speed];
}

/** travel time (ms) for a ball fired from a hole at a given speed. */
export function travelMsFor(hole: [number, number], speed: number): number {
  const dx = AIM[0] - hole[0], dy = AIM[1] - hole[1], dz = AIM[2] - LAUNCH_Z;
  return (Math.hypot(dx, dy, dz) / speed) * 1000;
}

/** persistent decor rings marking every active hole, so the athlete can see where shots come
 *  from. They are decor — never hittable — and last the whole session. */
export function holeMarkers(level: number, sessionMs: number, idp: string): TrialSpec[] {
  const n = holeCount(level);
  return HOLES.slice(0, n).map((h, i) => ({
    id: `${idp}-hole${i}`, spawnAt: 200, duration: sessionMs,
    kind: "distractor" as const, decor: true, zone: "center" as const,
    position: [h[0], h[1], LAUNCH_Z] as [number, number, number],
    color: "#141826", emissive: "#2A2F45", shape: "ring" as const, scale: 0.16,
    meta: { decor: true },
  }));
}

/** pick a random active hole for a shot. */
export function pickHole(level: number, rng: () => number): [number, number] {
  return HOLES[Math.floor(rng() * holeCount(level))];
}
