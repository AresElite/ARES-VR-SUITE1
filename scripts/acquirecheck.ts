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

// ============================================ 2. THE CONTRAST STAIRCASE ACTUALLY WORKS
console.log("");
console.log("LOW-CONTRAST — does the staircase converge on a threshold?");
function runStaircase(level: number, trueThreshold: number, seed: number) {
  const specs = ContrastAssessment.buildTrials(levelFor(ContrastAssessment, level).parameters, makeRng(seed))
    .filter((s) => !s.decor);
  const rng = makeRng(seed + 1);
  let lastCorrect: boolean | undefined;
  const seen: number[] = [];
  for (const spec of specs) {
    ContrastAssessment.onSpawnAdapt?.(spec, { streak: 0, hits: 0, errors: 0, lastEventCorrect: lastCorrect },
      { finishEarly: () => {} });
    const c = spec.landolt!.contrastPct;
    seen.push(c);
    // a synthetic athlete: sees it reliably above threshold, guesses (25%, 4AFC) below
    const p = c >= trueThreshold ? 0.95 : 0.25;
    lastCorrect = rng() < p;
  }
  return seen;
}
for (const [lvl, thr] of [[1, 30], [25, 12], [50, 5]] as [number, number][]) {
  const seen = runStaircase(lvl, thr, 11);
  const start = seen[0];
  const settled = seen.slice(-10);
  const mean = settled.reduce((a, b) => a + b, 0) / settled.length;
  console.log(`  L${String(lvl).padStart(2)}  athlete threshold ${thr}%  ->  started ${start.toFixed(0)}%, settled ${mean.toFixed(1)}%  (${seen.length} trials)`);

  // A staircase that never moves is not a staircase.
  if (new Set(seen.map((c) => c.toFixed(1))).size < 4) {
    flag(`L${lvl}: contrast never moved — this is a fixed-contrast block, not a staircase`);
  }
  // It must land NEAR the athlete's real threshold, not at the level's start value.
  if (Math.abs(mean - thr) > thr * 1.4 + 6) {
    flag(`L${lvl}: staircase settled at ${mean.toFixed(1)}% but the athlete's threshold is ${thr}% — it is not converging`);
  }
  // and it must re-arm: a second run cannot inherit the first athlete's endpoint
  const again = runStaircase(lvl, thr, 11);
  if (Math.abs(again[0] - start) > 0.01) flag(`L${lvl}: staircase did not re-arm — run 2 started at ${again[0].toFixed(1)}% instead of ${start.toFixed(1)}%`);
}

// ================================================ 3. THE STIMULUS IS PHYSICALLY VALID
for (const lvl of [1, 25, 50]) {
  const specs = ContrastAssessment.buildTrials(levelFor(ContrastAssessment, lvl).parameters, makeRng(5))
    .filter((s) => !s.decor);
  for (const s of specs) {
    if (s.shape !== "landolt" || !s.landolt) flag(`L${lvl}: contrast stimulus is not a Landolt C`);
    const c = s.landolt!.contrastPct;
    if (c <= 0 || c > 100) flag(`L${lvl}: Michelson contrast ${c} is outside 0-100`);
    if (![0, 90, 180, 270].includes(s.landolt!.gapDeg)) flag(`L${lvl}: gap bearing ${s.landolt!.gapDeg} is not one of the 4 alternatives`);
    if (!s.requiredDirection) flag(`L${lvl}: no required response direction`);
  }
  if (ContrastAssessment.responseMode !== "joystick") {
    flag("contrast drill is not a joystick 4AFC — a perception threshold must not be gated on the arm");
  }
}

console.log("");
console.log(issues.length ? "ISSUES:\n" + issues.map((i) => "  " + i).join("\n")
  : "0 ISSUES — x1 is foveal, x2 is genuinely peripheral, and the contrast staircase converges on the athlete's own threshold");
if (issues.length) process.exit(1);
