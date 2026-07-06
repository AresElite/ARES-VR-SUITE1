import type { DrillDefinition, TrialSpec } from "@/ares/drillTypes";
import { levels25, lerp25, ilerp25 } from "../shared/levels";
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

const levels = levels25((i) => ({
  label: `${i < 8 ? "dual" : "triple"} stream${i >= 13 ? `, ${ilerp25(95, 125, i)} BPM` : ""}`,
  parameters: {
    durationScale: 1,
    peripheral: {
      trialCount: ilerp25(12, 18, i), eccentricityDeg: lerp25(22, 38, i),
      targetDurationMs: ilerp25(1500, 950, i), isiMinMs: ilerp25(1400, 1100, i), isiMaxMs: ilerp25(2400, 2000, i),
      distractorRatio: lerp25(0.1, 0.35, i), fixationLoad: i >= 9, contrast: lerp25(1, 0.5, i),
    },
    reaction: {
      trialCount: ilerp25(12, 18, i), targetDurationMs: ilerp25(1400, 900, i),
      isiMinMs: ilerp25(1400, 1100, i), isiMaxMs: ilerp25(2400, 2000, i),
      noGoRatio: lerp25(0.15, 0.3, i), handRuleRatio: lerp25(0, 0.7, i), spreadDeg: lerp25(12, 24, i),
    },
    ...(i >= 8
      ? {
          depth: {
            trialCount: ilerp25(8, 14, i), approachSpeed: lerp25(2.6, 3.4, i), spawnDepth: 8,
            handRules: i < 13 ? ["either"] : ["left", "right", "both"],
            directionRatio: lerp25(0, 0.5, i), crossMidlineRatio: lerp25(0, 0.35, i),
            ...(i >= 13 ? { bpm: ilerp25(95, 125, i) } : {}), isiMs: ilerp25(3200, 2400, i),
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
