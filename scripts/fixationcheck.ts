import { ALL_DRILLS } from "@/drills/registry";

/**
 * FIXATION-CUE UNIQUENESS.
 *
 * A drill must never present two fixation cues at once — and it must certainly
 * never present a MOVING one next to a stationary one the athlete is being scored
 * on holding. Gaze Stabilization was doing exactly that: the generic Acquire
 * marker (a rotating diamond) rendered on top of the drill's own fixation dot.
 */
const issues: string[] = [];
for (const d of ALL_DRILLS) {
  const genericMarker = !d.gazeStability
    && (d.phase === "Acquire" || d.levels.some((l) => l.parameters.fixationLoad === true));
  const ownMarker = Boolean(d.gazeStability);
  if (genericMarker && ownMarker) {
    issues.push(`${d.shortName}: renders BOTH the generic fixation marker and its own`);
  }
}
const gaze = ALL_DRILLS.filter((d) => d.gazeStability);
console.log(`gaze-stabilization drills: ${gaze.map((d) => d.shortName).join(", ") || "none"}`);
for (const d of gaze) {
  const generic = d.phase === "Acquire" && !d.gazeStability;
  console.log(`  ${d.shortName.padEnd(26)} own fixation dot: yes   generic diamond: ${generic ? "YES (BUG)" : "no"}`);
}
console.log("");
console.log(issues.length ? "ISSUES:\n" + issues.map((i) => "  " + i).join("\n")
  : "0 ISSUES — no drill presents competing fixation cues");
if (issues.length) process.exit(1);
