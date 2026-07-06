import type { DrillDefinition, TrialSpec, TargetZone } from "@/ares/drillTypes";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { pick } from "@/utils/rng";
import { PERIPHERAL_ZONES, zonePosition } from "../shared/zones";

/**
 * ACQUIRE — Peripheral Field VR
 * Train peripheral target acquisition while maintaining central fixation.
 * Progressions widen eccentricity, shorten target duration, lower contrast,
 * add distractors, and add central fixation load (center flash targets).
 */

interface Params {
  trialCount: number;
  eccentricityDeg: number;
  targetDurationMs: number;
  isiMinMs: number;
  isiMaxMs: number;
  distractorRatio: number;
  fixationLoad: boolean;
  contrast: number; // 1 = full brand teal, lower = dimmer target
  [k: string]: unknown;
}

function dimmed(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function buildPeripheralTrials(p: Params, rng: () => number, idPrefix = "pf"): TrialSpec[] {
  const trials: TrialSpec[] = [];
  let t = 1000;
  for (let i = 0; i < p.trialCount; i++) {
    const zone = pick(rng, PERIPHERAL_ZONES) as TargetZone;
    const isDistractor = rng() < p.distractorRatio;
    trials.push({
      id: `${idPrefix}-${i}`,
      spawnAt: t,
      duration: p.targetDurationMs,
      kind: isDistractor ? "distractor" : "go",
      zone,
      position: zonePosition(zone, p.eccentricityDeg, 2.2, 0.15, rng),
      color: isDistractor ? ARES_COLORS.graphite : dimmed(ARES_ACCENTS.tealBright, p.contrast),
      emissive: isDistractor ? undefined : dimmed(ARES_COLORS.electricTeal, p.contrast),
      shape: isDistractor ? "box" : "sphere",
      scale: 0.09,
    });
    // Central fixation load: occasional center flash that must also be hit
    if (p.fixationLoad && rng() < 0.25) {
      trials.push({
        id: `${idPrefix}-fx-${i}`,
        spawnAt: t + p.targetDurationMs * 0.4,
        duration: p.targetDurationMs * 0.9,
        kind: "go",
        zone: "center",
        position: [0, 1.5, -2.2],
        color: ARES_COLORS.warningGold,
        emissive: ARES_COLORS.warningGold,
        shape: "diamond",
        scale: 0.06,
      });
    }
    t += p.targetDurationMs + p.isiMinMs + rng() * (p.isiMaxMs - p.isiMinMs);
  }
  return trials;
}

const levels = [
  { level: 1, label: "Level 1 — Near field", parameters: { trialCount: 16, eccentricityDeg: 15, targetDurationMs: 1600, isiMinMs: 700, isiMaxMs: 1400, distractorRatio: 0, fixationLoad: false, contrast: 1 } },
  { level: 2, label: "Level 2 — Wider field", parameters: { trialCount: 20, eccentricityDeg: 22, targetDurationMs: 1400, isiMinMs: 600, isiMaxMs: 1200, distractorRatio: 0.1, fixationLoad: false, contrast: 1 } },
  { level: 3, label: "Level 3 — Fixation load", parameters: { trialCount: 22, eccentricityDeg: 28, targetDurationMs: 1200, isiMinMs: 500, isiMaxMs: 1100, distractorRatio: 0.2, fixationLoad: true, contrast: 0.9 } },
  { level: 4, label: "Level 4 — Low contrast", parameters: { trialCount: 24, eccentricityDeg: 33, targetDurationMs: 1000, isiMinMs: 450, isiMaxMs: 1000, distractorRatio: 0.3, fixationLoad: true, contrast: 0.55 } },
  { level: 5, label: "Level 5 — Edge of field", parameters: { trialCount: 26, eccentricityDeg: 40, targetDurationMs: 850, isiMinMs: 400, isiMaxMs: 900, distractorRatio: 0.4, fixationLoad: true, contrast: 0.45 } },
];

export const PeripheralFieldVR: DrillDefinition = {
  id: "peripheral-field",
  name: "Peripheral Field VR",
  shortName: "Peripheral Field",
  phase: "Acquire",
  description:
    "Hold central fixation on the Ares marker while acquiring targets across the peripheral field. Distractors and low-contrast targets load the Acquire stream.",
  purpose: "Peripheral target acquisition under central fixation.",
  interaction: "ray",
  environment: "arena",
  mvp: true,
  levels,
  buildTrials: (params, rng) => buildPeripheralTrials(params as Params, rng),
  durationMs: (params) => {
    const p = params as Params;
    return 1000 + p.trialCount * (p.targetDurationMs + (p.isiMinMs + p.isiMaxMs) / 2) + 1500;
  },
};
