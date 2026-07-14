import { ALL_DRILLS } from "@/drills/registry";
import { levelFor } from "@/drills/shared/ProgressionEngine";
import { makeRng } from "@/utils/rng";

/**
 * NOTHING MAY OCCUPY THE HUD VOLUME.
 *
 * The old HUD was a scoreboard panel at [0, 0.78, -1.75], and the Schulte grid sat at
 * z = -1.5 — so the grid rendered IN FRONT of the menu and the athlete read cells
 * through a scoreboard. Nobody caught it because no harness had ever asked whether a
 * drill's targets and the drill's own UI were fighting for the same cubic metre.
 *
 * The dock now lives in the bottom quarter, below y = 0.95, tilted up. This asserts
 * that no drill puts a target down there — and, separately, that no drill's targets
 * sit so close to the athlete that the armed dock would render through them.
 */
/**
 * OCCLUSION IS ANGULAR. My first version of this check tested a Cartesian box, which
 * is simply the wrong physics — a panel does not hide a target by being NEAR it, it
 * hides it by being on the same ray from the eye. The dock sits ~47deg below the
 * horizon and subtends ~7deg; anything within that cone is behind it.
 */
const EYE: [number, number, number] = [0, 1.6, 0];
const ARM_ELEV = -49;      // the dock springs open when the gaze drops past this
const CLEARANCE = 5;       // and no target may sit within this of it
const elevOf = (p: readonly number[]) =>
  (Math.atan2(p[1] - EYE[1], Math.hypot(p[0] - EYE[0], p[2] - EYE[2])) * 180) / Math.PI;

const issues: string[] = [];
const flag = (s: string) => { if (!issues.includes(s)) issues.push(s); };

for (const d of ALL_DRILLS) {
  for (const lvl of [1, Math.ceil(d.levels.length / 2), d.levels.length]) {
    const specs = d.buildTrials(levelFor(d, lvl).parameters, makeRng(lvl * 5 + 2));
    for (const s of specs) {
      if (s.decor || s.meta?.decor) continue;
      /**
       * The real invariant is not "is the target near the dock" — it is: LOOKING AT
       * THIS TARGET MUST NOT ARM THE DOCK. An athlete looks at what they are about to
       * hit, so any target below the arm threshold would spring the menu open in the
       * middle of the rep and hide itself behind it.
       */
      const e = elevOf(s.position);
      if (e < ARM_ELEV + CLEARANCE) {
        flag(`${d.shortName} L${lvl}: target at ${e.toFixed(0)}deg elevation — looking at it would arm the control dock (arms at ${ARM_ELEV}deg)`);
      }
    }
  }
}

// Schulte specifically: the grid must sit BEHIND the dock, not in front of it.
const sch = ALL_DRILLS.find((d) => d.id === "schulte-table");
if (sch) {
  const specs = sch.buildTrials(levelFor(sch, 1).parameters, makeRng(1));
  const z = Math.max(...specs.map((s) => s.position[2]));
  const lowest = Math.min(...specs.map((s) => elevOf(s.position)));
  console.log(`Schulte grid: z = ${z.toFixed(2)} (was -1.50), lowest cell ${lowest.toFixed(0)}deg elevation`);
  if (z > -1.7) flag(`Schulte grid at z=${z.toFixed(2)} was not pushed back`);
}

console.log("");
console.log(issues.length ? "ISSUES:\n" + issues.map((i) => "  " + i).join("\n")
  : "0 ISSUES — no drill places a target behind the control dock's line of sight");
if (issues.length) process.exit(1);
