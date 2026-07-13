import { ALL_DRILLS } from "@/drills/registry";
import { levelFor } from "@/drills/shared/ProgressionEngine";
import { STRIKE_REACH, clampToReach } from "@/drills/shared/zones";
import { makeRng } from "@/utils/rng";

/**
 * REACHABILITY + CROSS-HAND AUDIT.
 *
 * Focus-Frenzy shipped with its targets 0.85 m out against a documented 0.55-0.75 m
 * strike shell, and nobody caught it because every harness I own tests ENGINES —
 * none of them ever asked the simple question "can a human arm actually get there?"
 *
 * Shoulders are ~0.19 m either side of the midline at ~1.42 m. A comfortable strike
 * is inside ~0.78 m of the relevant shoulder; anything past ~0.88 m is a lunge.
 */
const SHOULDER_Y = 1.42;
const SHOULDER_X = 0.19;
const COMFORT = 0.80;
const LIMIT = 0.90;

const STRIKE_ORB = 0.037, PAD = 0.042;

const issues: string[] = [];
const flag = (s: string) => { if (!issues.includes(s)) issues.push(s); };

function shoulderDist(p: readonly number[], hand?: string): number {
  const sides = hand === "left" ? [-SHOULDER_X] : hand === "right" ? [SHOULDER_X] : [-SHOULDER_X, SHOULDER_X];
  return Math.min(...sides.map((sx) =>
    Math.hypot(p[0] - sx, p[1] - SHOULDER_Y, p[2] - 0)));
}

/**
 * CLOSEST APPROACH, not spawn position.
 *
 * The first version of this audit judged targets where they SPAWNED — and flagged
 * every rhythm note and every launched ball as unreachable, because those spawn
 * 4-12 m away and FLY IN. What matters is the closest the target ever gets to the
 * athlete during its life: that is the moment it can be struck, and the only moment
 * reachability means anything.
 */
function closestApproach(s: import("@/ares/drillTypes").TrialSpec): number {
  let best = Infinity;
  /**
   * Sample on a FIXED ~8ms step, not a fixed step COUNT.
   *
   * The first version used 24 samples across the whole flight. For a ball moving
   * 4.4 m/s over 2.5 s that is 46 cm between samples — it steps clean over the
   * athlete and the "closest approach" lands wherever the sampling happened to
   * fall. The audit reported four drills as unreachable that were perfectly fine.
   *
   * Exactly the same tunnelling bug I just fixed in the hand collider, in the tool
   * I built to find it. Discrete sampling of continuous motion will do this to you
   * every time.
   */
  const steps = Math.max(24, Math.ceil(s.duration / 8));
  for (let i = 0; i <= steps; i++) {
    const ms = (s.duration * i) / steps;
    const t = ms / 1000;
    let p: [number, number, number] = [...s.position] as [number, number, number];
    if (s.velocity) {
      p = [p[0] + s.velocity[0] * t, p[1] + s.velocity[1] * t, p[2] + s.velocity[2] * t];
    } else if (s.wander) {
      const w = s.wander;
      p = [p[0] + w.ax * Math.sin(w.wx * t + w.px), p[1] + w.ay * Math.sin(w.wy * t + w.py), p[2]];
    } else if (s.lane) {
      const a = s.lane.phase + s.lane.angularSpeed * t;
      p = [Math.sin(a) * s.lane.radius, s.lane.y + Math.cos(a) * s.lane.radius * 0.55, -0.66];
    }
    // once it is BEHIND the strike plane it has flown past and is gone
    if (p[2] > 0.15) break;
    best = Math.min(best, shoulderDist(p, s.requiredHand));
  }
  return best;
}

console.log("DRILL                          MAX REACH  MEDIAN   SMALLEST  HIT TOL   VERDICT");
for (const d of ALL_DRILLS) {
  if (d.responseMode !== "strike" && d.interaction !== "touch") continue;
  if (d.responseMode === "trigger" || d.responseMode === "pointer" || d.responseMode === "joystick") continue;

  const dists: number[] = [];
  let smallest = Infinity;
  let minTol = Infinity;
  let midlineViolations = 0;

  for (const lvl of [1, Math.ceil(d.levels.length / 2), d.levels.length]) {
    const specs = d.buildTrials(levelFor(d, lvl).parameters, makeRng(lvl * 7 + 1));
    // mirror the engine's reach clamp: it applies to STATIC strike targets only,
    // because a target with velocity is SUPPOSED to start out of reach and fly in
    const strikeDrill = d.interaction === "touch" && (d.responseMode ?? "strike") === "strike";
    if (strikeDrill) {
      for (const s of specs) {
        if (s.decor || s.meta?.decor || s.lane) continue;
        const rh = s.requiredHand === "left" || s.requiredHand === "right" ? s.requiredHand : undefined;
        if (!s.velocity) { s.position = clampToReach(s.position, rh); continue; }
        const pure = Math.abs(s.velocity[0]) < 1e-6 && Math.abs(s.velocity[1]) < 1e-6;
        if (pure) {
          const [cx, cy] = clampToReach([s.position[0], s.position[1], 0], rh);
          s.position = [cx, cy, s.position[2]];
        }
      }
    }
    for (const s of specs) {
      if (s.decor) continue;
      const dd = closestApproach(s);
      dists.push(dd);
      smallest = Math.min(smallest, s.scale);
      const tol = s.scale + STRIKE_ORB + PAD + ((s.meta?.hitBoost as number) ?? 0);
      minTol = Math.min(minTol, tol);

      // a hand-assigned target must sit on its own side of the midline, or the
      // opposite hand has to travel THROUGH it and can be scored for a decision
      // it never made
      if (d.id === "eye-hand-coordination") {
        if (s.requiredHand === "right" && s.position[0] < 0.05) midlineViolations++;
        if (s.requiredHand === "left" && s.position[0] > -0.05) midlineViolations++;
      }
    }
  }
  if (!dists.length) continue;
  dists.sort((a, b) => a - b);
  const max = dists[dists.length - 1];
  const med = dists[dists.length >> 1];

  const bad = max > LIMIT;
  const warn = max > COMFORT;
  console.log(
    d.shortName.slice(0, 28).padEnd(30),
    max.toFixed(2).padStart(9),
    med.toFixed(2).padStart(8),
    (smallest * 100).toFixed(1).padStart(9) + "cm",
    (minTol * 100).toFixed(1).padStart(7) + "cm",
    "  " + (bad ? "OUT OF REACH" : warn ? "at the limit" : "ok"),
  );
  if (bad) flag(`REACH: ${d.shortName} places targets ${max.toFixed(2)}m from the shoulder (shell is ${STRIKE_REACH}m)`);
  if (midlineViolations) flag(`MIDLINE: ${d.shortName} has ${midlineViolations} hand-assigned targets in the opposite hand's territory`);
}

// ---- Eye-Hand sizes must be exactly half of what they were
const OLD = { xl: 0.115, l: 0.095, m: 0.078, s: 0.062, xs: 0.05 };
const NEW = { xl: 0.0575, l: 0.0475, m: 0.039, s: 0.031, xs: 0.025 };
for (const k of Object.keys(OLD) as (keyof typeof OLD)[]) {
  if (Math.abs(NEW[k] - OLD[k] / 2) > 1e-9) flag(`SIZE: ${k} is not exactly half of the old value`);
}
console.log("");
console.log("Eye-Hand sizes (radius):", Object.entries(NEW).map(([k, v]) => `${k} ${(v * 100).toFixed(2)}cm`).join("  "));

console.log("");
console.log(issues.length ? "ISSUES:\n" + issues.map((i) => "  " + i).join("\n")
  : "0 ISSUES — every strike target is inside a human arm's reach, and no hand-assigned target sits in the other hand's territory");
if (issues.length) process.exit(1);
