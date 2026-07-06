import type { DrillDefinition } from "@/ares/drillTypes";
import { makeRng } from "@/utils/rng";
import { DrillEngine } from "./DrillEngine";
import { levelFor } from "./ProgressionEngine";

/**
 * DrillSession — factory that turns (definition, level) into a live engine.
 * Trial plans are seeded per session so a run is reproducible from its seed.
 */
export function createDrillSession(
  def: DrillDefinition,
  level: number,
  poolSize: number,
  seed = Date.now() % 2147483647,
): DrillEngine {
  const lvl = levelFor(def, level);
  const rng = makeRng(seed);
  const trials = def.buildTrials(lvl.parameters, rng);
  return new DrillEngine(def, lvl.parameters, trials, poolSize);
}
