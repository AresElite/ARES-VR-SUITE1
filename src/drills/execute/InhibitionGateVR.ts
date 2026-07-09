import type { DrillDefinition } from "@/ares/drillTypes";
import { buildReactionTrials } from "./ReactionStrikeVR";

/**
 * EXECUTE — Inhibition Gate VR (scaffolded prototype)
 * The Reaction Strike generator tuned to maximum no-go density: response
 * prepotency is built with fast teal reps, then gated hard.
 */
export const InhibitionGateVR: DrillDefinition = {
  id: "inhibition-gate",
  name: "Inhibition Gate VR",
  shortName: "Inhibition Gate",
  phase: "Execute",
  description:
    "Fast go reps build the trigger habit — then red rings flood in. Withhold. False starts and no-go failures decide the score.",
  purpose: "Response inhibition and impulse control under prepotency.",
  interaction: "touch",
  instructions: [
    "1. Fast teal reps build your trigger habit — strike every teal orb immediately.",
    "2. Red rings flood in without warning. DO NOT STRIKE THEM. Freeze the hand.",
    "3. The score is won on what you DON'T hit. False starts and red strikes decide everything.",
  ],
  controlsHint: "STRIKE TEAL FAST - FREEZE ON RED",
  environment: "arena",
  mvp: false,
  levels: [
    { level: 1, label: "Level 1 — 30% no-go", parameters: { trialCount: 22, targetDurationMs: 1100, isiMinMs: 500, isiMaxMs: 1100, noGoRatio: 0.3, handRuleRatio: 0, spreadDeg: 12 } },
    { level: 2, label: "Level 2 — 40% no-go", parameters: { trialCount: 26, targetDurationMs: 950, isiMinMs: 450, isiMaxMs: 1000, noGoRatio: 0.4, handRuleRatio: 0.3, spreadDeg: 15 } },
    { level: 3, label: "Level 3 — 50% no-go", parameters: { trialCount: 30, targetDurationMs: 800, isiMinMs: 400, isiMaxMs: 900, noGoRatio: 0.5, handRuleRatio: 0.5, spreadDeg: 18 } },
  ],
  buildTrials: (params, rng) => buildReactionTrials(params as never, rng, "ig"),
  durationMs: (params) => {
    const p = params as { trialCount: number; targetDurationMs: number; isiMinMs: number; isiMaxMs: number };
    return 1200 + p.trialCount * (p.targetDurationMs + (p.isiMinMs + p.isiMaxMs) / 2) + 1500;
  },
};
