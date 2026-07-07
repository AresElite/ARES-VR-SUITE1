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
  optionSelections?: Record<string, string>,
): DrillEngine {
  const lvl = levelFor(def, level);
  const rng = makeRng(seed);
  // trainer dropdown selections (or defaults) merge into the build params
  const opts: Record<string, string> = {};
  for (const o of def.options ?? []) opts[o.id] = optionSelections?.[o.id] ?? o.defaultValue;
  const parameters = { ...lvl.parameters, ...opts };
  const trials = def.buildTrials(parameters, rng);
  return new DrillEngine(def, parameters, trials, poolSize);
}
