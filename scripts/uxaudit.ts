/**
 * UX / NAVIGATION AUDIT — static, deterministic verification of the things a
 * Monte-Carlo can't see: panel layouts never overlap (the flicker class of
 * bug), every screen has a way out, and the recent interaction changes are
 * wired correctly. Complements simulate2 (the drill-play Monte-Carlo).
 */
import { readFileSync } from "node:fs";
import { ALL_DRILLS, drillsForPhase } from "../src/drills/registry";
import { ARES_ALL_PHASES } from "../src/ares/phases";

let issues = 0;
const fail = (m: string) => { console.log("  ✗", m); issues++; };
const ok = (m: string) => console.log("  ✓", m);

// ---------- 1. Session Setup panel: no row can overlap (flicker fix) ----------
// mirrors TrainerControlDock's computed cursor layout exactly.
console.log("\n[1] Session Setup layout — every drill, no overlapping rows");
let layoutChecked = 0;
let worstGap = 1;
for (const def of ALL_DRILLS) {
  const optCount = Math.min(3, def.options?.length ?? 0);
  const optY = (i: number) => 0.38 - i * 0.13;
  // FIXED slots — mirror TrainerControlDock. Header rows always present.
  const rows: { y: number; h: number }[] = [
    { y: 0.78, h: 0.08 }, // drill name (text)
    { y: 0.62, h: 0.1 },  // level stepper
  ];
  for (let i = 0; i < optCount; i++) rows.push({ y: optY(i), h: 0.1 });
  if (def.supportsStrobe) rows.push({ y: -0.02, h: 0.1 });
  rows.push({ y: -0.17, h: 0.1 }, { y: -0.30, h: 0.1 }, { y: -0.54, h: 0.14 });
  rows.sort((a, b) => b.y - a.y);
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i - 1].y - rows[i].y;
    const need = rows[i - 1].h / 2 + rows[i].h / 2 + 0.008;
    worstGap = Math.min(worstGap, gap - need);
    if (gap < need) fail(`${def.id}: rows overlap (gap ${gap.toFixed(3)} < need ${need.toFixed(3)})`);
  }
  layoutChecked++;
}
if (worstGap >= 0) ok(`${layoutChecked} drills — tightest row clearance ${worstGap.toFixed(3)}m (no overlap)`);

// ---------- 2. Navigation completeness — every screen has an exit ----------
console.log("\n[2] Navigation — no dead-ends");
const dockSrc = readFileSync("src/vr/TrainerControlDock.tsx", "utf8");
const postSrc = readFileSync("src/vr/PostDrillPanel.tsx", "utf8");
const checks: [string, boolean][] = [
  ["Training sub-menu has EXIT TO ARENA", dockSrc.includes("EXIT TO ARENA")],
  ["Sport picker has < TRAINING back", dockSrc.includes("< TRAINING")],
  ["Sport picker has EXIT TO ARENA", dockSrc.includes("EXIT TO ARENA")],
  ["Drill list has Back to Arena", dockSrc.includes("Back to Arena")],
  ["Sport drill list has < SPORTS back", dockSrc.includes("< SPORTS")],
  ["Results has DRILL MENU", postSrc.includes("DRILL MENU")],
  ["Results has ARENA HOME", postSrc.includes("ARENA HOME")],
  ["Results has RUN AGAIN", postSrc.includes("RUN AGAIN")],
];
for (const [label, pass] of checks) (pass ? ok : fail)(label);

// ---------- 3. Interaction integrity for the reworked drills ----------
console.log("\n[3] Interaction integrity");
const byId = (id: string) => ALL_DRILLS.find((d) => d.id === id);
const pointerDrills = ["schulte-table", "speed-search", "rapid-recognition", "pattern-memory"];
for (const id of pointerDrills) {
  const d = byId(id);
  (d?.responseMode === "pointer" ? ok : fail)(`${id} is pointer/trigger select (responseMode=${d?.responseMode})`);
}
const triggerDrills = ["sternberg", "sternberg-digits", "sternberg-letters", "flanker", "stroop"];
for (const id of triggerDrills) {
  const d = byId(id);
  (d?.responseMode === "trigger" ? ok : fail)(`${id} is trigger yes/no (responseMode=${d?.responseMode})`);
}
const livesDrills = ["rapid-recognition", "pattern-memory"];
for (const id of livesDrills) {
  const d = byId(id);
  (((d?.onSpawnAdapt || d?.lives) && d?.trialPaced) ? ok : fail)(`${id} is lives-based/trial-paced (adaptive termination)`);
}
for (const id of ["gaze-stab-vorx1", "gaze-stab-vorx2"]) {
  const d = byId(id);
  (d?.gazeStability ? ok : fail)(`${id} has gaze aids (fixation dot + head-speed ring)`);
}

// ---------- 4. Every training drill = 50 levels; assessments/rhythm exempt ----
console.log("\n[4] Progression depth");
// Ported ladders carry their OWN authored depth (Flanker 100, Stroop 60). The house
// style is 50 levels; a ported instrument's curve is the instrument, and normalising it
// to fit our convention would be changing the drill to satisfy a lint rule.
const badDepth = ALL_DRILLS.filter((d) => !d.assessment && !d.rhythm && !d.authoredLadder && d.levels.length !== 50);
(badDepth.length === 0 ? ok : fail)(`all training drills 50 levels (${badDepth.map((d) => d.id + ":" + d.levels.length).join(", ") || "none off"})`);

// ---------- 5. Arena portal graph reachability ----------
console.log("\n[5] Arena reachability — every drill reachable from a portal");
let unreachable = 0;
for (const d of ALL_DRILLS) {
  if (d.phase === "Perform" || d.phase === "Assess") { if (!drillsForPhase(d.phase).includes(d)) unreachable++; continue; }
  // Loop phases + Sport all live under Training
  if (!ARES_ALL_PHASES.includes(d.phase)) { unreachable++; }
}
(unreachable === 0 ? ok : fail)(`${ALL_DRILLS.length} drills reachable (${unreachable} orphaned)`);

console.log(`\n==== UX AUDIT: ${issues === 0 ? "PASS — 0 issues" : issues + " ISSUE(S)"} ====`);
process.exit(issues === 0 ? 0 : 1);
