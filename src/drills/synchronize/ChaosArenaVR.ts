import type { DrillDefinition, TrialSpec } from "@/ares/drillTypes";
import { levels25, lerp25, ilerp25, levels50, lerp50, ilerp50 } from "../shared/levels";
import { buildPeripheralTrials, type SimplePeripheralParams } from "../acquire/PeripheralFieldVR";
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

  streams.push(buildPeripheralTrials(p.peripheral as unknown as SimplePeripheralParams, rng, "cx-pf"));
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

const levels = levels50((i) => ({
  label: `${i < 16 ? "dual" : "triple"} stream${i >= 26 ? `, ${ilerp25(95, 125, (i * 24) / 49)} BPM` : ""}`,
  parameters: {
    durationScale: 1,
    peripheral: {
      trialCount: ilerp25(12, 18, (i * 24) / 49), eccentricityDeg: lerp25(22, 38, (i * 24) / 49),
      targetDurationMs: ilerp25(1500, 950, (i * 24) / 49), isiMinMs: ilerp25(1400, 1100, (i * 24) / 49), isiMaxMs: ilerp25(2400, 2000, (i * 24) / 49),
      distractorRatio: lerp25(0.1, 0.35, (i * 24) / 49), fixationLoad: i >= 18, contrast: lerp25(1, 0.5, (i * 24) / 49),
    },
    reaction: {
      trialCount: ilerp25(12, 18, (i * 24) / 49), targetDurationMs: ilerp25(1400, 900, (i * 24) / 49),
      isiMinMs: ilerp25(1400, 1100, (i * 24) / 49), isiMaxMs: ilerp25(2400, 2000, (i * 24) / 49),
      noGoRatio: lerp25(0.15, 0.3, (i * 24) / 49), handRuleRatio: lerp25(0, 0.7, (i * 24) / 49), spreadDeg: lerp25(12, 24, (i * 24) / 49),
    },
    ...(i >= 16
      ? {
          depth: {
            trialCount: ilerp25(8, 14, (i * 24) / 49), approachSpeed: lerp25(2.6, 3.4, (i * 24) / 49), spawnDepth: 8,
            handRules: i < 13 ? ["either"] : ["left", "right", "both"],
            directionRatio: lerp25(0, 0.5, (i * 24) / 49), crossMidlineRatio: lerp25(0, 0.35, (i * 24) / 49),
            ...(i >= 26 ? { bpm: ilerp25(95, 125, (i * 24) / 49) } : {}), isiMs: ilerp25(3200, 2400, (i * 24) / 49),
          },
        }
      : {}),
  },
}));

export const ChaosArenaVR: DrillDefinition = {
  id: "chaos-arena",
  name: "Chaos Arena VR",
  shortName: "Chaos Arena",
  phase: "Synchronize",
  description:
    "Everything at once — peripheral acquisition, choice rules, no-go inhibition, and depth timing interleaved on one clock. Controlled chaos: every event is still a scoreable A.R.E.S. rep.",
  purpose: "Full-system integration under multi-sensory, multi-rule load.",
  interaction: "touch",
  instructions: [
    "1. Everything at once. Every rule you have trained still applies.",
    "2. Peripheral orbs: keep your eyes forward, tap them with your hands.",
    "3. Strike targets: TEAL either hand, PURPLE left, GOLD right.",
    "4. RED RINGS: do not strike. Depth targets: strike through them as they arrive.",
    "5. There is no pattern to chase — process each event as it comes. Stay accurate first, fast second.",
  ],
  controlsHint: "ALL RULES LIVE - HANDS UP, EYES FORWARD",
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
