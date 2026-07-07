import type { DrillDefinition, HandRule, TrialSpec, TargetZone } from "@/ares/drillTypes";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { pick } from "@/utils/rng";
import { strikePosition } from "../shared/zones";

/**
 * EXECUTE — Reaction Strike VR
 * Raw reaction, choice reaction, inhibition, and motor accuracy.
 * Color-coded rules: teal = strike (either hand), purple = left hand,
 * gold = right hand, red = NO-GO. Wrong-hand detection uses controller
 * handedness (best effort with hand tracking).
 */

interface Params {
  trialCount: number;
  targetDurationMs: number;
  isiMinMs: number;
  isiMaxMs: number;
  noGoRatio: number;
  handRuleRatio: number; // fraction of go targets with a specific-hand rule
  spreadDeg: number;
  [k: string]: unknown;
}

const STRIKE_ZONES: TargetZone[] = ["center", "left", "right", "up", "down"];

export function buildReactionTrials(p: Params, rng: () => number, idPrefix = "rs"): TrialSpec[] {
  const trials: TrialSpec[] = [];
  let t = 1200;
  for (let i = 0; i < p.trialCount; i++) {
    const zone = pick(rng, STRIKE_ZONES);
    const isNoGo = rng() < p.noGoRatio;
    let requiredHand: HandRule | undefined;
    let color: string = ARES_ACCENTS.tealBright;
    let emissive: string = ARES_COLORS.electricTeal;
    if (isNoGo) {
      color = ARES_COLORS.errorRed;
      emissive = ARES_COLORS.errorRed;
    } else if (rng() < p.handRuleRatio) {
      // alternate the deck instead of independent coin flips (L/R balance)
      if (i % 2 === 0) {
        requiredHand = "left";
        color = ARES_ACCENTS.purpleGlow;
        emissive = ARES_COLORS.deepPurple;
      } else {
        requiredHand = "right";
        color = ARES_COLORS.warningGold;
        emissive = ARES_COLORS.warningGold;
      }
    }
    trials.push({
      id: `${idPrefix}-${i}`,
      spawnAt: t,
      duration: p.targetDurationMs,
      kind: isNoGo ? "noGo" : "go",
      zone,
      position: strikePosition(zone, (p.spreadDeg * (0.4 + rng() * 0.6)) | 0 || 5, 0.14, rng),
      requiredHand,
      color,
      emissive,
      shape: isNoGo ? "ring" : "sphere",
      scale: 0.11,
    });
    t += p.targetDurationMs + p.isiMinMs + rng() * (p.isiMaxMs - p.isiMinMs);
  }
  return trials;
}

const levels = [
  { level: 1, label: "Level 1 — Raw reaction", parameters: { trialCount: 18, targetDurationMs: 1500, isiMinMs: 800, isiMaxMs: 2000, noGoRatio: 0, handRuleRatio: 0, spreadDeg: 12 } },
  { level: 2, label: "Level 2 — Go / No-Go", parameters: { trialCount: 22, targetDurationMs: 1300, isiMinMs: 700, isiMaxMs: 1800, noGoRatio: 0.2, handRuleRatio: 0, spreadDeg: 15 } },
  { level: 3, label: "Level 3 — Choice hands", parameters: { trialCount: 24, targetDurationMs: 1200, isiMinMs: 600, isiMaxMs: 1600, noGoRatio: 0.2, handRuleRatio: 0.5, spreadDeg: 18 } },
  { level: 4, label: "Level 4 — Fast rules", parameters: { trialCount: 26, targetDurationMs: 1000, isiMinMs: 500, isiMaxMs: 1400, noGoRatio: 0.25, handRuleRatio: 0.65, spreadDeg: 20 } },
  { level: 5, label: "Level 5 — Full inhibition", parameters: { trialCount: 30, targetDurationMs: 850, isiMinMs: 450, isiMaxMs: 1200, noGoRatio: 0.3, handRuleRatio: 0.75, spreadDeg: 24 } },
];

export const ReactionStrikeVR: DrillDefinition = {
  id: "reaction-strike",
  name: "Reaction Strike VR",
  shortName: "Reaction Strike",
  phase: "Execute",
  description:
    "Strike targets the instant they appear. Teal = either hand. Purple = LEFT hand only. Gold = RIGHT hand only. Red ring = do NOT strike. False starts and no-go failures are tracked.",
  purpose: "Raw reaction, choice reaction, inhibition, motor accuracy.",
  interaction: "touch",
  instructions: [
    "1. Targets pop up within arm's reach. STRIKE them the instant they appear.",
    "2. TEAL orb = strike with EITHER hand, as fast as you can.",
    "3. PURPLE orb = LEFT hand only. GOLD orb = RIGHT hand only.",
    "4. RED RING = DO NOT STRIKE. Hold completely still until it disappears.",
    "5. Striking early, striking red, or using the wrong hand all count against you.",
  ],
  controlsHint: "PUNCH THE ORBS - PURPLE=LEFT GOLD=RIGHT RED=DON'T",
  environment: "arena",
  mvp: true,
  levels,
  buildTrials: (params, rng) => buildReactionTrials(params as Params, rng),
  durationMs: (params) => {
    const p = params as Params;
    return 1200 + p.trialCount * (p.targetDurationMs + (p.isiMinMs + p.isiMaxMs) / 2) + 1500;
  },
};
