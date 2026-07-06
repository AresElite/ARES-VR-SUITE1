import type { DrillDefinition, TrialSpec } from "@/ares/drillTypes";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { EYE_Y } from "../shared/zones";

/**
 * ROUTE — Predictive Pathway VR
 * Color-coded objects run curved routes toward the gate ahead. The athlete
 * predicts which will arrive FIRST and physically SLAPS the matching answer
 * pad at arm's reach — before the object arrives. Movers are visual only;
 * the decision is expressed through the hands (eye-hand transfer).
 * Higher levels add decoy deceleration and late cue changes that flip the
 * correct answer mid-flight.
 */

interface Params {
  decisionCount: number;
  objectsPerDecision: number;
  windowMs: number;
  gapMs: number;
  lateSwitchRatio: number;
  speedSpread: number;
  [k: string]: unknown;
}

const LANE_COLORS = [
  { color: ARES_ACCENTS.tealBright, name: "TEAL" },
  { color: ARES_ACCENTS.purpleLight, name: "PURPLE" },
  { color: ARES_COLORS.warningGold, name: "GOLD" },
  { color: "#22C55E", name: "GREEN" },
  { color: ARES_COLORS.white, name: "WHITE" },
];

export function buildPathwayTrials(p: Params, rng: () => number, idPrefix = "pp"): TrialSpec[] {
  const trials: TrialSpec[] = [];
  let t = 1500;
  for (let d = 0; d < p.decisionCount; d++) {
    const groupId = `${idPrefix}-g${d}`;
    const n = Math.min(p.objectsPerDecision, LANE_COLORS.length);
    const speeds: number[] = [];
    const base = 0.55 + rng() * 0.25;
    for (let i = 0; i < n; i++) speeds.push(base + (rng() - 0.5) * p.speedSpread);
    const startAngles = Array.from({ length: n }, (_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      return side * (0.9 + 0.35 * Math.floor(i / 2) + rng() * 0.15);
    });
    const arrival = startAngles.map((a, i) => Math.abs(a) / speeds[i]);
    const winner = arrival.indexOf(Math.min(...arrival));
    const lateSwitch = rng() < p.lateSwitchRatio;
    const sorted = [...arrival.keys()].sort((a, b) => arrival[a] - arrival[b]);
    const runnerUp = sorted[1] ?? winner;

    for (let i = 0; i < n; i++) {
      const loses = lateSwitch && i === winner;
      // Decorative mover — watched, never struck
      trials.push({
        id: `${groupId}-m${i}`,
        spawnAt: t,
        duration: p.windowMs,
        kind: "distractor",
        decor: true,
        zone: startAngles[i] < 0 ? "left" : "right",
        position: [Math.sin(startAngles[i]) * 2.6, EYE_Y, -Math.cos(startAngles[i]) * 2.6],
        lane: {
          radius: 2.6,
          angularSpeed: -Math.sign(startAngles[i]) * speeds[i] * (loses ? 0.55 : 1),
          phase: startAngles[i],
          y: EYE_Y + 0.15 + (i - (n - 1) / 2) * 0.14,
        },
        color: LANE_COLORS[i].color,
        emissive: LANE_COLORS[i].color,
        shape: "sphere",
        scale: 0.1,
      });
      // Answer pad at arm's reach — SLAP the color you predict wins
      const isWinner = i === winner && !lateSwitch;
      const becomesWinner = lateSwitch && i === runnerUp;
      trials.push({
        id: `${groupId}-p${i}`,
        spawnAt: t,
        duration: p.windowMs,
        kind: isWinner || (lateSwitch && i === winner) ? "go" : "distractor",
        ...(lateSwitch && (becomesWinner || i === winner)
          ? {
              switchKindAt: t + p.windowMs * 0.55,
              switchKindTo: becomesWinner ? ("go" as const) : ("distractor" as const),
            }
          : {}),
        zone: "center",
        position: [-0.5 + (i * 1.0) / Math.max(1, n - 1), 1.12, -0.6],
        color: LANE_COLORS[i].color,
        emissive: LANE_COLORS[i].color,
        shape: "box",
        scale: 0.075,
        label: LANE_COLORS[i].name,
        groupId,
      });
    }
    t += p.windowMs + p.gapMs;
  }
  return trials;
}

const levels = [
  { level: 1, label: "Level 1 — Clear routes", parameters: { decisionCount: 8, objectsPerDecision: 3, windowMs: 3400, gapMs: 1500, lateSwitchRatio: 0, speedSpread: 0.5 } },
  { level: 2, label: "Level 2 — Tighter races", parameters: { decisionCount: 10, objectsPerDecision: 3, windowMs: 3000, gapMs: 1300, lateSwitchRatio: 0, speedSpread: 0.35 } },
  { level: 3, label: "Level 3 — Four routes", parameters: { decisionCount: 10, objectsPerDecision: 4, windowMs: 2800, gapMs: 1200, lateSwitchRatio: 0.2, speedSpread: 0.3 } },
  { level: 4, label: "Level 4 — Late switches", parameters: { decisionCount: 12, objectsPerDecision: 4, windowMs: 2600, gapMs: 1100, lateSwitchRatio: 0.4, speedSpread: 0.25 } },
  { level: 5, label: "Level 5 — Deception", parameters: { decisionCount: 12, objectsPerDecision: 5, windowMs: 2300, gapMs: 1000, lateSwitchRatio: 0.5, speedSpread: 0.18 } },
];

export const PredictivePathwayVR: DrillDefinition = {
  id: "predictive-pathway",
  name: "Predictive Pathway VR",
  shortName: "Predictive Pathway",
  phase: "Route",
  description:
    "Colored objects race curved routes toward the gate. Read the race, predict the winner, and slap the matching answer pad at your hands — before the object arrives. Decoys decelerate; late switches flip the answer.",
  purpose: "Route selection, prediction, and processing under uncertainty.",
  interaction: "touch",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. Colored orbs race along curved paths toward the glowing gate ahead. Only WATCH them — never reach for them.",
    "2. Decide which color will reach the gate FIRST.",
    "3. SLAP the answer pad of that color — the pads float at your hands.",
    "4. Answer BEFORE the winner arrives. No answer counts as a miss.",
    "5. Watch for deception: leaders can slow down late. If the race changes, change your answer — hit the new color.",
  ],
  controlsHint: "WATCH THE RACE - SLAP THE PAD OF THE WINNING COLOR",
  levels,
  buildTrials: (params, rng) => buildPathwayTrials(params as Params, rng),
  durationMs: (params) => {
    const p = params as Params;
    return 1500 + p.decisionCount * (p.windowMs + p.gapMs) + 1500;
  },
};
