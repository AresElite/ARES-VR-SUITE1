import type { DrillDefinition, TrialSpec } from "@/ares/drillTypes";
import { buildPeripheralTrials } from "../acquire/PeripheralFieldVR";
import { buildReactionTrials } from "../execute/ReactionStrikeVR";
import { buildDepthSliceTrials } from "../execute/DepthSliceVR";

/**
 * SYNCHRONIZE — Chaos Arena VR
 * Full-system integration: peripheral acquisition + choice reaction +
 * inhibition + depth timing interleaved on one clock. This is a controlled
 * chaos engine — the streams are the same calibrated generators used by the
 * isolated drills, merged and time-shifted, so every event stays scoreable
 * against the same A.R.E.S. metrics.
 */

interface Params {
  durationScale: number;
  peripheral: Record<string, unknown>;
  reaction: Record<string, unknown>;
  depth?: Record<string, unknown>;
  [k: string]: unknown;
}

export function buildChaosTrials(p: Params, rng: () => number): TrialSpec[] {
  const streams: TrialSpec[][] = [];

  streams.push(buildPeripheralTrials(p.peripheral as never, rng, "cx-pf"));
  const reaction = buildReactionTrials(p.reaction as never, rng, "cx-rs").map((t) => ({
    ...t,
    spawnAt: t.spawnAt + 900, // phase-shift the Execute stream against Acquire
  }));
  streams.push(reaction);
  if (p.depth) {
    streams.push(
      buildDepthSliceTrials(p.depth as never, rng, "cx-ds").map((t) => ({
        ...t,
        spawnAt: t.spawnAt + 1600,
      })),
    );
  }
  return streams.flat().sort((a, b) => a.spawnAt - b.spawnAt);
}

const levels = [
  {
    level: 1,
    label: "Level 1 — Dual stream",
    parameters: {
      durationScale: 1,
      peripheral: { trialCount: 12, eccentricityDeg: 22, targetDurationMs: 1500, isiMinMs: 1400, isiMaxMs: 2400, distractorRatio: 0.1, fixationLoad: false, contrast: 1 },
      reaction: { trialCount: 12, targetDurationMs: 1400, isiMinMs: 1400, isiMaxMs: 2400, noGoRatio: 0.15, handRuleRatio: 0, spreadDeg: 12 },
    },
  },
  {
    level: 2,
    label: "Level 2 — Rules under load",
    parameters: {
      durationScale: 1,
      peripheral: { trialCount: 14, eccentricityDeg: 28, targetDurationMs: 1300, isiMinMs: 1200, isiMaxMs: 2200, distractorRatio: 0.2, fixationLoad: false, contrast: 0.9 },
      reaction: { trialCount: 14, targetDurationMs: 1200, isiMinMs: 1200, isiMaxMs: 2200, noGoRatio: 0.2, handRuleRatio: 0.4, spreadDeg: 16 },
    },
  },
  {
    level: 3,
    label: "Level 3 — Triple stream",
    parameters: {
      durationScale: 1,
      peripheral: { trialCount: 14, eccentricityDeg: 30, targetDurationMs: 1200, isiMinMs: 1300, isiMaxMs: 2400, distractorRatio: 0.25, fixationLoad: true, contrast: 0.8 },
      reaction: { trialCount: 14, targetDurationMs: 1100, isiMinMs: 1300, isiMaxMs: 2400, noGoRatio: 0.22, handRuleRatio: 0.5, spreadDeg: 18 },
      depth: { trialCount: 10, approachSpeed: 2.6, spawnDepth: 8, handRules: ["either"], directionRatio: 0, crossMidlineRatio: 0, isiMs: 3200 },
    },
  },
  {
    level: 4,
    label: "Level 4 — Rhythm chaos",
    parameters: {
      durationScale: 1,
      peripheral: { trialCount: 16, eccentricityDeg: 34, targetDurationMs: 1050, isiMinMs: 1200, isiMaxMs: 2200, distractorRatio: 0.3, fixationLoad: true, contrast: 0.65 },
      reaction: { trialCount: 16, targetDurationMs: 1000, isiMinMs: 1200, isiMaxMs: 2200, noGoRatio: 0.25, handRuleRatio: 0.6, spreadDeg: 20 },
      depth: { trialCount: 12, approachSpeed: 3.0, spawnDepth: 8, handRules: ["left", "right"], directionRatio: 0.3, crossMidlineRatio: 0.2, bpm: 100, isiMs: 2800 },
    },
  },
  {
    level: 5,
    label: "Level 5 — Full synchronization",
    parameters: {
      durationScale: 1,
      peripheral: { trialCount: 18, eccentricityDeg: 38, targetDurationMs: 950, isiMinMs: 1100, isiMaxMs: 2000, distractorRatio: 0.35, fixationLoad: true, contrast: 0.5 },
      reaction: { trialCount: 18, targetDurationMs: 900, isiMinMs: 1100, isiMaxMs: 2000, noGoRatio: 0.3, handRuleRatio: 0.7, spreadDeg: 24 },
      depth: { trialCount: 14, approachSpeed: 3.4, spawnDepth: 9, handRules: ["left", "right", "both"], directionRatio: 0.5, crossMidlineRatio: 0.35, bpm: 120, isiMs: 2400 },
    },
  },
];

export const ChaosArenaVR: DrillDefinition = {
  id: "chaos-arena",
  name: "Chaos Arena VR",
  shortName: "Chaos Arena",
  phase: "Synchronize",
  description:
    "Everything at once — peripheral acquisition, choice rules, no-go inhibition, and depth timing interleaved on one clock. Controlled chaos: every event is still a scoreable A.R.E.S. rep.",
  purpose: "Full-system integration under multi-sensory, multi-rule load.",
  interaction: "ray",
  environment: "arena",
  mvp: true,
  levels,
  buildTrials: (params, rng) => buildChaosTrials(params as Params, rng),
  durationMs: (params) => {
    const p = params as Params;
    const per = p.peripheral as { trialCount: number; targetDurationMs: number; isiMinMs: number; isiMaxMs: number };
    const rea = p.reaction as { trialCount: number; targetDurationMs: number; isiMinMs: number; isiMaxMs: number };
    const perMs = 1000 + per.trialCount * (per.targetDurationMs + (per.isiMinMs + per.isiMaxMs) / 2) + 1500;
    const reaMs = 2100 + rea.trialCount * (rea.targetDurationMs + (rea.isiMinMs + rea.isiMaxMs) / 2) + 1500;
    return Math.max(perMs, reaMs) + 1000;
  },
};
