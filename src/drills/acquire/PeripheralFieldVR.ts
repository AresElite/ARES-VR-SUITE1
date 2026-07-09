import type { DrillDefinition, TrialSpec, TargetZone } from "@/ares/drillTypes";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { pick } from "@/utils/rng";
import { PERIPHERAL_ZONES, strikePosition } from "../shared/zones";
import { levels25, lerp25, ilerp25, levels50, lerp50, ilerp50 } from "../shared/levels";

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
      position: strikePosition(zone, p.eccentricityDeg, 0.1, rng),
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
        position: [0, 1.42, -0.6],
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

const levels = levels50((i) => ({
  label: `${ilerp50(15, 46, i)}° field, ${ilerp50(100, 35, i)}% contrast`,
  parameters: {
    trialCount: ilerp50(16, 30, i),
    eccentricityDeg: lerp50(15, 46, i),
    targetDurationMs: ilerp50(1650, 750, i),
    isiMinMs: ilerp50(700, 380, i),
    isiMaxMs: ilerp50(1400, 800, i),
    distractorRatio: lerp50(0, 0.5, i),
    fixationLoad: i >= 18,
    contrast: lerp50(1, 0.35, i),
  },
}));

export const PeripheralFieldVR: DrillDefinition = {
  id: "peripheral-field",
  name: "Peripheral Field VR",
  shortName: "Peripheral Field",
  phase: "Acquire",
  description:
    "Hold central fixation on the Ares marker while acquiring targets across the peripheral field. Distractors and low-contrast targets load the Acquire stream.",
  purpose: "Peripheral target acquisition under central fixation.",
  interaction: "touch",
  instructions: [
    "1. Stand tall. Keep your EYES LOCKED on the white diamond straight ahead the entire drill.",
    "2. Teal orbs will light up around the edge of your vision — REACH OUT AND TAP them with either hand.",
    "3. Do NOT look at the orbs. Find them with your peripheral vision, strike, and return to center.",
    "4. Ignore the dark gray boxes — they are decoys. Striking one counts against you.",
    "5. At higher levels a GOLD diamond flashes at center — tap it too, without losing your rhythm.",
  ],
  controlsHint: "EYES ON THE DIAMOND - TAP PERIPHERAL ORBS WITH YOUR HANDS",
  environment: "arena",
  mvp: true,
  levels,
  buildTrials: (params, rng) => buildPeripheralTrials(params as Params, rng),
  durationMs: (params) => {
    const p = params as Params;
    return 1000 + p.trialCount * (p.targetDurationMs + (p.isiMinMs + p.isiMaxMs) / 2) + 1500;
  },
};
