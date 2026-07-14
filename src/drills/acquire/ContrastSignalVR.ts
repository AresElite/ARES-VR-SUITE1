import type { DrillDefinition } from "@/ares/drillTypes";
import { buildPeripheralTrials, type SimplePeripheralParams } from "./PeripheralFieldVR";

/**
 * ACQUIRE — Contrast Signal VR (scaffolded prototype)
 * Low-contrast target detection: the Peripheral Field generator driven at
 * center-weighted eccentricity with aggressive contrast reduction.
 */
export const ContrastSignalVR: DrillDefinition = {
  id: "contrast-signal",
  name: "Contrast Signal VR",
  shortName: "Contrast Signal",
  phase: "Acquire",
  description:
    "Detect and strike low-contrast signals as they fade into the arena. Contrast falls with every level.",
  purpose: "Contrast sensitivity and signal detection under visual noise.",
  interaction: "touch",
  instructions: [
    "1. Faint signals fade in around your reach zone — each level they get dimmer.",
    "2. The moment you detect one, TAP it with either hand.",
    "3. Ignore the dark decoy boxes. If you are not sure, trust your first detection and commit.",
  ],
  controlsHint: "DETECT THE FAINT SIGNALS - TAP ON DETECTION",
  environment: "arena",
  mvp: false,
  levels: [
    { level: 1, label: "Level 1 — 60% contrast", parameters: { trialCount: 16, eccentricityDeg: 12, targetDurationMs: 1500, isiMinMs: 700, isiMaxMs: 1300, distractorRatio: 0.1, fixationLoad: false, contrast: 0.6 } },
    { level: 2, label: "Level 2 — 40% contrast", parameters: { trialCount: 18, eccentricityDeg: 14, targetDurationMs: 1300, isiMinMs: 600, isiMaxMs: 1200, distractorRatio: 0.15, fixationLoad: false, contrast: 0.4 } },
    { level: 3, label: "Level 3 — 25% contrast", parameters: { trialCount: 20, eccentricityDeg: 16, targetDurationMs: 1200, isiMinMs: 550, isiMaxMs: 1100, distractorRatio: 0.2, fixationLoad: false, contrast: 0.25 } },
  ],
  buildTrials: (params, rng) => buildPeripheralTrials(params as unknown as SimplePeripheralParams, rng, "cs"),
  durationMs: (params) => {
    const p = params as { trialCount: number; targetDurationMs: number; isiMinMs: number; isiMaxMs: number };
    return 1000 + p.trialCount * (p.targetDurationMs + (p.isiMinMs + p.isiMaxMs) / 2) + 1500;
  },
};
