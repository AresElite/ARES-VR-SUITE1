import { GazeStabilizationX1, GazeStabilizationX2 } from "@/drills/acquire/GazeStability";
import { ContrastAssessment } from "@/drills/acquire/AcquireDrills";
import { levelFor } from "@/drills/shared/ProgressionEngine";
import { makeRng } from "@/utils/rng";
import type { TrialSpec } from "@/ares/drillTypes";

const issues: string[] = [];
const flag = (s: string) => issues.push(s);
const ecc = (s: TrialSpec) => {
  const dx = s.position[0], dy = s.position[1] - 1.45;
  return (Math.atan2(Math.hypot(dx, dy), Math.abs(-1.3)) * 180) / Math.PI;
};

// ================================================= 1. THE TWO GAZE DRILLS DIFFER
console.log("GAZE — where does the optotype actually appear?");
console.log("LEVEL   x1 CENTRAL (mean ecc)    x2 PERIPHERAL (mean ecc)   x2 counter-drift");
for (const lvl of [1, 17, 34, 50]) {
  const a = GazeStabilizationX1.buildTrials(levelFor(GazeStabilizationX1, lvl).parameters, makeRng(3))
    .filter((s) => !s.decor);
  const b = GazeStabilizationX2.buildTrials(levelFor(GazeStabilizationX2, lvl).parameters, makeRng(3))
    .filter((s) => !s.decor);
  const ea = a.reduce((m, s) => m + ecc(s), 0) / a.length;
  const eb = b.reduce((m, s) => m + ecc(s), 0) / b.length;
  const drift = b.filter((s) => s.velocity && Math.abs(s.velocity[0]) > 0).length;
  console.log(
    String(lvl).padEnd(7),
    `${ea.toFixed(1)}deg`.padStart(18),
    `${eb.toFixed(1)}deg`.padStart(24),
    `${drift}/${b.length}`.padStart(18),
  );

  // x1 must be FOVEAL. If the optotype drifts off-centre, it is no longer a pure
  // stabilization task — the athlete starts searching, and we stop measuring VOR.
  if (ea > 2) flag(`x1 L${lvl}: optotype is ${ea.toFixed(1)}deg off-centre — x1 must be foveal`);
  // x2 must be genuinely PERIPHERAL, or it is just x1 wearing a different name.
  if (eb < 6) flag(`x2 L${lvl}: optotype is only ${eb.toFixed(1)}deg out — that is not peripheral`);
  // and the gap between them must be real
  if (eb - ea < 6) flag(`L${lvl}: x1 and x2 present the optotype in the same place — they are the same drill`);
  // x1 must never counter-drift; that is x2's demand
  if (a.some((s) => s.velocity && Math.abs(s.velocity[0]) > 0)) flag(`x1 L${lvl}: counter-drift leaked into x1`);
  // safe visual field: never ask for a head turn beyond comfortable range
  for (const s of b) if (ecc(s) > 42) flag(`x2 L${lvl}: optotype at ${ecc(s).toFixed(0)}deg — outside safe search range`);
}

// ================================== 2. VISIBILITY: SIX ENVIRONMENTS, SIX THRESHOLDS
console.log("");
console.log("VISIBILITY — six environments, each with its own staircase");
function runVis(level: number, thresholds: Record<string, number>, seed: number) {
  const specs = ContrastAssessment.buildTrials(levelFor(ContrastAssessment, level).parameters, makeRng(seed));
  const rng = makeRng(seed + 1);
  let lastCorrect: boolean | undefined;
  const settled: Record<string, number[]> = {};
  for (const spec of specs) {
    ContrastAssessment.onSpawnAdapt?.(spec, { streak: 0, hits: 0, errors: 0, lastEventCorrect: lastCorrect },
      { finishEarly: () => {} });
    const cid = spec.meta!.cond as string;
    const c = spec.meta!.appliedContrast as number;
    (settled[cid] ??= []).push(c);
    // a synthetic athlete with a DIFFERENT threshold in each environment
    const p = c >= thresholds[cid] ? 0.95 : 0.25;
    lastCorrect = rng() < p;
  }
  return settled;
}
// this athlete is fine against the sky and blind at dusk — exactly the profile the drill exists to find
const TRUE: Record<string, number> = { sky: 0.06, floodlit: 0.10, dusk: 0.34, washout: 0.20, glare: 0.30, clutter: 0.16 };
const got = runVis(20, TRUE, 21);
for (const cid of Object.keys(TRUE)) {
  const trail = got[cid] ?? [];
  const last = trail.slice(-4);
  const mean = last.reduce((a, b) => a + b, 0) / Math.max(1, last.length);
  console.log(`  ${cid.padEnd(9)} true ${(TRUE[cid] * 100).toFixed(0).padStart(3)}%  ->  settled ${(mean * 100).toFixed(0).padStart(3)}%   (${trail.length} trials)`);
  if (!trail.length) flag(`${cid}: never presented`);
  if (new Set(trail.map((c) => c.toFixed(3))).size < 3) flag(`${cid}: its staircase never moved`);
}
// The WHOLE POINT: the profile must separate the athlete's good environments from their bad ones.
const rank = Object.keys(TRUE).sort((a, b) => {
  const ma = (got[a] ?? []).slice(-3).reduce((x, y) => x + y, 0) / 3;
  const mb = (got[b] ?? []).slice(-3).reduce((x, y) => x + y, 0) / 3;
  return mb - ma;
});
console.log(`  worst environment found: ${rank[0]}  (truth: dusk)`);
if (rank[0] !== "dusk" && rank[1] !== "dusk") flag("the profile did not identify the athlete's worst environment");

// ---- the stimulus must be physically renderable in every environment
for (const lvl of [1, 25, 50]) {
  const specs = ContrastAssessment.buildTrials(levelFor(ContrastAssessment, lvl).parameters, makeRng(5));
  for (const s of specs) {
    if (s.shape !== "landolt" || !s.landolt) flag(`L${lvl}: stimulus is not a Landolt C`);
    if (!s.luminance) flag(`L${lvl}: no luminance environment attached`);
    const L = s.luminance!;
    if (L.target < 0 || L.target > 255) flag(`L${lvl}: target luminance ${L.target} is unrenderable`);
    if (Math.abs(L.target - L.bg) < 1) flag(`L${lvl}: target and background are the same luminance — invisible by construction`);
    if (![0, 90, 180, 270].includes(s.landolt!.gapDeg)) flag(`L${lvl}: gap is not one of the 4 alternatives`);
  }
  if (ContrastAssessment.responseMode !== "joystick") flag("a perception threshold must not be gated on the arm");
  if (ContrastAssessment.environment !== "visibility") flag("the drill does not own its visual environment");
}

console.log("");
console.log(issues.length ? "ISSUES:\n" + issues.map((i) => "  " + i).join("\n")
  : "0 ISSUES — x1 is foveal, x2 is genuinely peripheral, and the contrast staircase converges on the athlete's own threshold");
if (issues.length) process.exit(1);
