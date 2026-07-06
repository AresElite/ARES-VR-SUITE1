import type { DrillDefinition } from "@/ares/drillTypes";
import { buildReactionTrials } from "../execute/ReactionStrikeVR";

/**
 * ROUTE — Choice Map VR (scaffolded prototype)
 * Heavy choice-rule load at low motor demand: the Reaction Strike generator
 * with maximum hand-rule density and slow, wide targets. Trains the mapping,
 * not the strike.
 */
export const ChoiceMapVR: DrillDefinition = {
  id: "choice-map",
  name: "Choice Map VR",
  shortName: "Choice Map",
  phase: "Route",
  description:
    "Every target carries a rule — purple LEFT, gold RIGHT, red withhold. Slow tempo, total rule density: train the route from cue to correct response.",
  purpose: "Stimulus-response mapping and route selection.",
  interaction: "touch",
  instructions: [
    "1. Every target carries a rule. Slow tempo — train the mapping, not the speed.",
    "2. PURPLE = LEFT hand. GOLD = RIGHT hand. TEAL = either. RED RING = do not strike.",
    "3. Say the rule in your head before you move. Accuracy over speed at every level.",
  ],
  controlsHint: "MATCH THE RULE - PURPLE=LEFT GOLD=RIGHT RED=DON'T",
  environment: "arena",
  mvp: false,
  levels: [
    { level: 1, label: "Level 1 — Two rules", parameters: { trialCount: 16, targetDurationMs: 1800, isiMinMs: 900, isiMaxMs: 1600, noGoRatio: 0.1, handRuleRatio: 1, spreadDeg: 12 } },
    { level: 2, label: "Level 2 — Three rules", parameters: { trialCount: 20, targetDurationMs: 1600, isiMinMs: 800, isiMaxMs: 1500, noGoRatio: 0.2, handRuleRatio: 1, spreadDeg: 15 } },
    { level: 3, label: "Level 3 — Rule speed", parameters: { trialCount: 24, targetDurationMs: 1300, isiMinMs: 700, isiMaxMs: 1300, noGoRatio: 0.25, handRuleRatio: 1, spreadDeg: 18 } },
  ],
  buildTrials: (params, rng) => buildReactionTrials(params as never, rng, "cm"),
  durationMs: (params) => {
    const p = params as { trialCount: number; targetDurationMs: number; isiMinMs: number; isiMaxMs: number };
    return 1200 + p.trialCount * (p.targetDurationMs + (p.isiMinMs + p.isiMaxMs) / 2) + 1500;
  },
};
