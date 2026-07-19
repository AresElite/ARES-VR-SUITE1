import { readFileSync } from "node:fs";
import { ALL_DRILLS } from "@/drills/registry";
import {
  SELECTABLE_ENVIRONMENTS,
  resolveEnvironment,
  environmentLocked,
} from "@/ares/environments";
import { CORE_R } from "@/vr/VenueKit";
import type { EnvironmentId } from "@/ares/drillTypes";

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "  PASS" : "  FAIL"}  ${m}`);
  if (!c) fails++;
};

/* ------------------------------------------------------ 1. LOCKING ------- */
console.log("LOCKING — measurement drills must ignore the athlete's preference.");

const assessDrills = ALL_DRILLS.filter((d) => d.phase === "Assess");
ok(assessDrills.length > 0, `found ${assessDrills.length} Assess drills to check`);
ok(
  assessDrills.every((d) => environmentLocked(d)),
  "every Assess drill is environment-locked",
);

// The real test: try to override each locked drill with every selectable venue.
let overrides = 0;
for (const d of ALL_DRILLS.filter(environmentLocked)) {
  for (const e of SELECTABLE_ENVIRONMENTS) {
    if (resolveEnvironment(d, e.id) !== d.environment) overrides++;
  }
}
ok(overrides === 0, `no locked drill can be overridden (${overrides} leaks across all venue x drill pairs)`);

// And the inverse: unlocked drills MUST follow the preference, or the picker is a lie.
const unlocked = ALL_DRILLS.filter((d) => !environmentLocked(d));
let ignored = 0;
for (const d of unlocked) {
  for (const e of SELECTABLE_ENVIRONMENTS) {
    if (resolveEnvironment(d, e.id) !== e.id) ignored++;
  }
}
ok(ignored === 0, `all ${unlocked.length} unlocked drills follow the preference (${ignored} ignored it)`);

const visibility = ALL_DRILLS.filter((d) => d.environment === "visibility");
ok(
  visibility.every((d) => environmentLocked(d)),
  `visibility drills (${visibility.length}) stay locked — background luminance is the measurement`,
);

/* -------------------------------------------- 2. SURROUND-ONLY GEOMETRY -- */
console.log("\nSURROUND-ONLY — no venue geometry may sit inside the controlled core.");

const venueSrc = readFileSync(new URL("../src/vr/Venues.tsx", import.meta.url), "utf8");

// Origin-centred surround geometry (bowls, crowd bands, ground annuli) must
// start outside the controlled core.
const radii: { prop: string; value: number }[] = [];
for (const m of venueSrc.matchAll(/\b(innerR|outerR)=\{([\d.]+)\}/g)) {
  radii.push({ prop: m[1], value: Number(m[2]) });
}
for (const m of venueSrc.matchAll(/<CrowdBand[^>]*?\br=\{([\d.]+)\}/gs)) {
  radii.push({ prop: "CrowdBand.r", value: Number(m[1]) });
}
ok(radii.length > 10, `scanned ${radii.length} origin-centred radii in Venues.tsx`);
const tooClose = radii.filter((x) => x.prop !== "outerR" && x.value < CORE_R);
ok(
  tooClose.length === 0,
  `every inner radius clears CORE_R=${CORE_R}${tooClose.length ? ` — VIOLATIONS: ${tooClose.map((x) => `${x.prop}=${x.value}`).join(", ")}` : ""}`,
);

// Painted arcs may be offset (faceoff circles, the goal crease). What matters is
// their NEAREST approach to the origin, not their radius.
const arcs: { r: number; cx: number; cz: number; near: number }[] = [];
for (const m of venueSrc.matchAll(/<GroundArc\b([^>]*?)\/>/gs)) {
  const body = m[1];
  const rm = body.match(/\br=\{([\d.]+ ?[-+*/ \d.A-Z_]*)\}/);
  if (!rm) continue;
  const r = Number(rm[1].replace(/CORE_R/g, String(CORE_R)).match(/[-\d.]+/g)!
    .reduce((a, b) => a + Number(b), 0));
  const cm = body.match(/center=\{\[([^\]]+)\]\}/);
  let cx = 0;
  let cz = 0;
  if (cm) {
    const parts = cm[1].split(",").map((t) => {
      const nums = t.match(/[-\d.]+/g);
      if (!nums) return 0;
      return nums.map(Number).reduce((a, b) => a * b, 1);
    });
    cx = parts[0] ?? 0;
    cz = parts[1] ?? 0;
  }
  const d = Math.hypot(cx, cz);
  // If the arc encircles the origin its nearest point is r; otherwise d - r.
  const near = d > r ? d - r : r;
  arcs.push({ r, cx, cz, near });
}
ok(arcs.length > 0, `scanned ${arcs.length} painted ground arcs`);
const arcViolations = arcs.filter((a) => a.near < CORE_R - 0.01);
ok(
  arcViolations.length === 0,
  `every painted arc's nearest edge clears CORE_R${arcViolations.length ? ` — VIOLATIONS: ${arcViolations.map((a) => `r=${a.r}@(${a.cx},${a.cz}) near=${a.near.toFixed(1)}`).join(", ")}` : ""}`,
);

// Painted straight lines are placed by centre + length along one axis.
const lineViolations: string[] = [];
const behindStanceDecals: string[] = [];
for (const m of venueSrc.matchAll(/\{ x: (-?[\d.]+), z: (-?[\d.]+), len: ([\d.]+), axis: "([xz])"/g)) {
  const x = Number(m[1]);
  const z = Number(m[2]);
  const len = Number(m[3]);
  const axis = m[4];
  // Nearest approach of the segment to the origin.
  const near = axis === "x"
    ? (Math.abs(x) <= len / 2 ? Math.abs(z) : Math.hypot(Math.abs(x) - len / 2, z))
    : (Math.abs(z) <= len / 2 ? Math.abs(x) : Math.hypot(x, Math.abs(z) - len / 2));
  if (len === 0 || near >= CORE_R - 0.01) continue;
  // DOCUMENTED EXCEPTION: floor decals fully behind the stance line (z >= 0).
  // The speedway's brick stripe and start/finish line live here. They are
  // underfoot and never behind a target, because every target sits at z < 0.
  const behindStance = axis === "x" ? z >= 0 : z - len / 2 >= 0;
  if (behindStance) {
    behindStanceDecals.push(`(${x},${z}) axis ${axis}`);
    continue;
  }
  lineViolations.push(`(${x},${z}) len ${len} axis ${axis} near ${near.toFixed(1)}`);
}
ok(
  lineViolations.length === 0,
  `every painted line either clears CORE_R or sits behind the stance line${lineViolations.length ? ` — VIOLATIONS: ${lineViolations.join("; ")}` : ""}`,
);
ok(
  behindStanceDecals.length <= 2,
  `behind-stance floor decals are the documented exception only (${behindStanceDecals.join("; ") || "none"})`,
);

// The forward task cone (z < 0, within CORE_R) is where every target lives.
// Ground decals are the one thing that can legally sit near the athlete, so
// pin them: they must be at z >= 0, behind the stance line.
const decalZ: number[] = [];
for (const m of venueSrc.matchAll(/position=\{\[0, 0\.00\d, (-?[\d.]+)\]\}/g)) {
  decalZ.push(Number(m[1]));
}
ok(decalZ.length > 0, `found ${decalZ.length} near-floor decal(s) — the speedway bricks`);
ok(
  decalZ.every((z) => z >= 0),
  `every near-floor decal sits at z >= 0, behind the stance line (${decalZ.join(", ")})`,
);

/* ------------------------------------------------------- 3. THE PICKER --- */
console.log("\nPICKER — the menu must offer exactly what is implemented.");

const implemented: EnvironmentId[] = ["arena", "soccer", "hockey", "football", "baseball", "racing"];
ok(
  SELECTABLE_ENVIRONMENTS.length === implemented.length,
  `picker offers ${SELECTABLE_ENVIRONMENTS.length} environments`,
);
ok(
  SELECTABLE_ENVIRONMENTS.every((e) => implemented.includes(e.id)),
  "every offered environment has a venue implementation",
);
ok(
  !SELECTABLE_ENVIRONMENTS.some((e) => e.id === "visibility"),
  "the visibility world is never offered as a choice",
);
ok(
  SELECTABLE_ENVIRONMENTS.every((e) => e.label.length > 0 && e.blurb.length > 0),
  "every option is labelled and described",
);

/* -------------------------------------------------------- 4. LUMINANCE --- */
console.log("\nLUMINANCE — venue colours are clamped, not hand-picked.");
const rawMaterialHex = [
  ...venueSrc.matchAll(/<(?:meshBasicMaterial|lineBasicMaterial|pointsMaterial)[^>]*?color="(#[0-9A-Fa-f]{6})"/gs),
].map((m) => m[1]);
ok(
  rawMaterialHex.length === 0,
  `no material sets an unclamped colour${rawMaterialHex.length ? ` — VIOLATIONS: ${rawMaterialHex.join(", ")}` : ""}`,
);
const clamped = [...venueSrc.matchAll(/clampLuma\(/g)].length;
ok(clamped > 20, `${clamped} colours routed through clampLuma`);

console.log(`\n${fails === 0 ? "ALL CHECKS PASSED" : `${fails} CHECK(S) FAILED`}`);
process.exit(fails === 0 ? 0 : 1);
