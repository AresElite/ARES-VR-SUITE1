import type { DrillDefinition, TrialSpec } from "@/ares/drillTypes";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { EYE_Y } from "../shared/zones";
import { levels25, lerp25, ilerp25 } from "../shared/levels";

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

const levels = levels25((i) => ({
  label: `${3 + Math.floor(i / 9)} routes, ${ilerp25(0, 55, i)}% late switches`,
  parameters: {
    decisionCount: ilerp25(8, 14, i),
    objectsPerDecision: 3 + Math.floor(i / 9),
    windowMs: ilerp25(3400, 2000, i),
    gapMs: ilerp25(1500, 900, i),
    lateSwitchRatio: lerp25(0, 0.55, i),
    speedSpread: lerp25(0.5, 0.15, i),
  },
}));

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
