import type { DrillDefinition, TrialSpec } from "@/ares/drillTypes";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { EYE_Y } from "../shared/zones";

/**
 * ROUTE — Predictive Pathway VR
 * Moving objects travel curved lanes toward the gate (directly ahead).
 * The athlete selects the object that will arrive first — before it does.
 * Decoys move deceptively; higher levels flip the correct answer mid-flight
 * (late cue change) and shrink the decision window.
 */

interface Params {
  decisionCount: number;
  objectsPerDecision: number;
  windowMs: number;
  gapMs: number;
  lateSwitchRatio: number; // fraction of decisions with a late cue change
  speedSpread: number; // how deceptive lane speeds are (smaller = harder)
  [k: string]: unknown;
}

export function buildPathwayTrials(p: Params, rng: () => number, idPrefix = "pp"): TrialSpec[] {
  const trials: TrialSpec[] = [];
  let t = 1500;
  for (let d = 0; d < p.decisionCount; d++) {
    const groupId = `${idPrefix}-g${d}`;
    const n = p.objectsPerDecision;
    // Build lanes: all start at spread angles, orbit toward angle 0 (the gate).
    const speeds: number[] = [];
    const base = 0.55 + rng() * 0.25;
    for (let i = 0; i < n; i++) speeds.push(base + (rng() - 0.5) * p.speedSpread);
    // Winner = lane that closes its start angle fastest
    const startAngles = Array.from({ length: n }, (_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      return side * (0.9 + 0.35 * Math.floor(i / 2) + rng() * 0.15);
    });
    const arrival = startAngles.map((a, i) => Math.abs(a) / speeds[i]);
    const winner = arrival.indexOf(Math.min(...arrival));
    const lateSwitch = rng() < p.lateSwitchRatio;
    // Runner-up becomes the post-switch winner
    const sorted = [...arrival.keys()].sort((a, b) => arrival[a] - arrival[b]);
    const runnerUp = sorted[1] ?? winner;

    for (let i = 0; i < n; i++) {
      const isWinner = i === winner;
      const becomesWinner = lateSwitch && i === runnerUp;
      const loses = lateSwitch && i === winner;
      trials.push({
        id: `${groupId}-o${i}`,
        spawnAt: t,
        duration: p.windowMs,
        kind: isWinner && !lateSwitch ? "go" : loses ? "go" : "distractor",
        ...(lateSwitch && (becomesWinner || loses)
          ? {
              switchKindAt: t + p.windowMs * 0.55,
              switchKindTo: becomesWinner ? ("go" as const) : ("distractor" as const),
            }
          : {}),
        zone: startAngles[i] < 0 ? "left" : "right",
        position: [Math.sin(startAngles[i]) * 2.6, EYE_Y, -Math.cos(startAngles[i]) * 2.6],
        lane: {
          radius: 2.6,
          angularSpeed: -Math.sign(startAngles[i]) * speeds[i] * (loses ? 0.55 : 1),
          phase: startAngles[i],
          y: EYE_Y + (i - (n - 1) / 2) * 0.16,
        },
        color: ARES_ACCENTS.purpleGlow,
        emissive: ARES_COLORS.deepPurple,
        shape: "sphere",
        scale: 0.11,
        groupId,
      });
    }
    t += p.windowMs + p.gapMs;
  }
  return trials;
}

const levels = [
  { level: 1, label: "Level 1 — Clear routes", parameters: { decisionCount: 8, objectsPerDecision: 3, windowMs: 3200, gapMs: 1400, lateSwitchRatio: 0, speedSpread: 0.5 } },
  { level: 2, label: "Level 2 — Tighter races", parameters: { decisionCount: 10, objectsPerDecision: 3, windowMs: 2800, gapMs: 1200, lateSwitchRatio: 0, speedSpread: 0.35 } },
  { level: 3, label: "Level 3 — Four routes", parameters: { decisionCount: 10, objectsPerDecision: 4, windowMs: 2600, gapMs: 1100, lateSwitchRatio: 0.2, speedSpread: 0.3 } },
  { level: 4, label: "Level 4 — Late switches", parameters: { decisionCount: 12, objectsPerDecision: 4, windowMs: 2400, gapMs: 1000, lateSwitchRatio: 0.4, speedSpread: 0.25 } },
  { level: 5, label: "Level 5 — Deception", parameters: { decisionCount: 12, objectsPerDecision: 5, windowMs: 2100, gapMs: 900, lateSwitchRatio: 0.5, speedSpread: 0.18 } },
];

export const PredictivePathwayVR: DrillDefinition = {
  id: "predictive-pathway",
  name: "Predictive Pathway VR",
  shortName: "Predictive Pathway",
  phase: "Route",
  description:
    "Multiple objects run curved routes toward the gate. Select the one that will arrive first — before it arrives. Decoys decelerate and late cue changes flip the answer.",
  purpose: "Route selection, prediction, and processing under uncertainty.",
  interaction: "ray",
  environment: "arena",
  mvp: true,
  levels,
  buildTrials: (params, rng) => buildPathwayTrials(params as Params, rng),
  durationMs: (params) => {
    const p = params as Params;
    return 1500 + p.decisionCount * (p.windowMs + p.gapMs) + 1500;
  },
};
