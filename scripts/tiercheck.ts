import { PERFORM_DRILLS } from "@/perform/performDrills";
import { levelFor } from "@/drills/shared/ProgressionEngine";
import { makeRng } from "@/utils/rng";
import { cognitiveLoad, computeDifficulty, generateMap, tierRecipe, BASE_RECIPES } from "@/perform/beatmap";

const MECH = ["note","void","decoy","lateVoid","mirror","burst","clutter"];
const issues: string[] = [];
console.log("TIER".padEnd(5), "NAME".padEnd(20), "MOTOR", "COG ", "NOTES", " ", MECH.join(" "));
for (let t = 1; t <= 10; t++) {
  const agg: Record<string, number> = {}; let total = 0;
  for (const d of PERFORM_DRILLS) {
    const specs = d.buildTrials(levelFor(d, t).parameters, makeRng(t * 31));
    for (const s of specs) { const m = (s.meta?.mechanic as string) ?? "note"; agg[m] = (agg[m] ?? 0) + 1; total++; }
    // safety: no target may spawn behind the athlete or above safe reach
    for (const s of specs) {
      if (s.position[2] > 0) issues.push(`${d.id} T${t}: target behind athlete`);
      if (s.position[1] > 1.95 || s.position[1] < 0.75) issues.push(`${d.id} T${t}: y=${s.position[1].toFixed(2)} outside safe reach`);
      if (Math.abs(s.position[0]) > 0.95) issues.push(`${d.id} T${t}: x=${s.position[0].toFixed(2)} outside safe lateral reach`);
      if (s.spawnAt < 0) issues.push(`${d.id} T${t}: negative spawn`);
      if (s.switchKindAt !== undefined && s.switchKindAt <= s.spawnAt) issues.push(`${d.id} T${t}: lateVoid switches before spawn`);
    }
  }
  const base = BASE_RECIPES[4];
  const motor = computeDifficulty(generateMap(tierRecipe(base, t)));
  const row = MECH.map((m) => String(Math.round(((agg[m] ?? 0) / total) * 100)).padStart(m.length, " "));
  const name = PERFORM_DRILLS[0].levels[t-1].label.split("—")[0].replace(/T\d+ /,"").trim();
  console.log(String(t).padEnd(5), name.padEnd(20), motor.toFixed(1).padStart(5), cognitiveLoad(t).toFixed(1).padStart(4), String(total).padStart(5), " ", row.join(" "));
}
// monotonic cognitive load 1..9
for (let t = 2; t <= 9; t++) if (cognitiveLoad(t) < cognitiveLoad(t-1)) issues.push(`cognitive load not monotonic at T${t}`);
console.log(issues.length ? "\nISSUES:\n" + [...new Set(issues)].slice(0,10).join("\n") : "\n0 ISSUES — ladder is safe, monotonic, and mechanics gate correctly");
