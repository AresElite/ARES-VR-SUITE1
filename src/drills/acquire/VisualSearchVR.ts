import type { DrillDefinition, TrialSpec, TargetZone } from "@/ares/drillTypes";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { pick } from "@/utils/rng";
import { PERIPHERAL_ZONES, zonePosition } from "../shared/zones";

/**
 * ACQUIRE — Visual Search VR (scaffolded prototype)
 * A field of distractors appears at once; find and strike the single target
 * (odd shape/color) as fast as possible.
 */
interface Params {
  searches: number;
  fieldSize: number;
  exposureMs: number;
  gapMs: number;
  [k: string]: unknown;
}

export const VisualSearchVR: DrillDefinition = {
  id: "visual-search",
  name: "Visual Search VR",
  shortName: "Visual Search",
  phase: "Acquire",
  description:
    "A field of decoys floods the arena — find the single teal sphere among graphite boxes before the field collapses.",
  purpose: "Visual search speed, filtering, and target discrimination.",
  interaction: "ray",
  environment: "arena",
  mvp: false,
  levels: [
    { level: 1, label: "Level 1 — Field of 6", parameters: { searches: 10, fieldSize: 6, exposureMs: 2600, gapMs: 1200 } },
    { level: 2, label: "Level 2 — Field of 10", parameters: { searches: 12, fieldSize: 10, exposureMs: 2300, gapMs: 1000 } },
    { level: 3, label: "Level 3 — Field of 14", parameters: { searches: 14, fieldSize: 14, exposureMs: 2000, gapMs: 900 } },
  ],
  buildTrials: (params, rng) => {
    const p = params as Params;
    const trials: TrialSpec[] = [];
    let t = 1200;
    for (let s = 0; s < p.searches; s++) {
      const groupId = `vs-g${s}`;
      const targetIdx = Math.floor(rng() * p.fieldSize);
      for (let i = 0; i < p.fieldSize; i++) {
        const zone = pick(rng, PERIPHERAL_ZONES) as TargetZone;
        const isTarget = i === targetIdx;
        trials.push({
          id: `${groupId}-${i}`,
          spawnAt: t,
          duration: p.exposureMs,
          kind: isTarget ? "go" : "distractor",
          zone: isTarget ? zone : zone,
          position: zonePosition(zone, 8 + rng() * 26, 2.3, 0.35, rng),
          color: isTarget ? ARES_ACCENTS.tealBright : ARES_COLORS.graphite,
          emissive: isTarget ? ARES_COLORS.electricTeal : undefined,
          shape: isTarget ? "sphere" : "box",
          scale: 0.08,
          groupId,
        });
      }
      t += p.exposureMs + p.gapMs;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as Params;
    return 1200 + p.searches * (p.exposureMs + p.gapMs) + 1500;
  },
};
