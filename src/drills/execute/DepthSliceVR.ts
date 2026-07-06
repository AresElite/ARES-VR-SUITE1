import type { DrillDefinition, HandRule, SliceDirection, TrialSpec } from "@/ares/drillTypes";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { pick } from "@/utils/rng";
import { EYE_Y } from "../shared/zones";

/**
 * EXECUTE — Depth Slice VR
 * Translation of the touchscreen depth/slice/timing/bimanual logic into VR.
 * Targets fly toward the athlete through depth; strike them in the contact
 * window with the ruled hand and (at higher levels) the ruled 8-way direction.
 * Rhythm mode locks spawns to a BPM grid.
 */

interface Params {
  trialCount: number;
  approachSpeed: number; // m/s toward the athlete
  spawnDepth: number; // meters out
  handRules: HandRule[];
  directionRatio: number; // fraction of targets with an 8-way direction rule
  crossMidlineRatio: number; // left-side targets requiring right hand etc.
  bpm?: number;
  isiMs: number;
  [k: string]: unknown;
}

const DIRECTIONS: SliceDirection[] = [
  "up",
  "down",
  "left",
  "right",
  "upLeft",
  "upRight",
  "downLeft",
  "downRight",
];

const HAND_COLOR: Record<string, { color: string; emissive: string }> = {
  left: { color: ARES_ACCENTS.purpleGlow, emissive: ARES_COLORS.deepPurple },
  right: { color: ARES_COLORS.warningGold, emissive: ARES_COLORS.warningGold },
  either: { color: ARES_ACCENTS.tealBright, emissive: ARES_COLORS.electricTeal },
  both: { color: ARES_COLORS.softGray, emissive: ARES_COLORS.electricTeal },
};

export function buildDepthSliceTrials(p: Params, rng: () => number, idPrefix = "ds"): TrialSpec[] {
  const trials: TrialSpec[] = [];
  const travelMs = (p.spawnDepth / p.approachSpeed) * 1000;
  const beatMs = p.bpm ? 60000 / p.bpm : undefined;
  let t = 1500;
  for (let i = 0; i < p.trialCount; i++) {
    const hand = pick(rng, p.handRules);
    // Lateral spawn side; cross-midline rule flips the required hand's side
    let x = (rng() - 0.5) * 1.2;
    if (hand === "left" || hand === "right") {
      const naturalSide = hand === "left" ? -1 : 1;
      const cross = rng() < p.crossMidlineRatio;
      x = (cross ? -naturalSide : naturalSide) * (0.35 + rng() * 0.45);
    }
    const hasDirection = rng() < p.directionRatio;
    const direction = hasDirection ? pick(rng, DIRECTIONS) : undefined;
    const spawnAt = beatMs ? 1500 + Math.round((t - 1500) / beatMs) * beatMs : t;
    const palette = HAND_COLOR[hand] ?? HAND_COLOR.either;
    trials.push({
      id: `${idPrefix}-${i}`,
      spawnAt,
      duration: travelMs + 450, // contact window after arrival
      kind: "go",
      zone: x < -0.2 ? "left" : x > 0.2 ? "right" : "center",
      position: [x, EYE_Y + (rng() - 0.5) * 0.5, -p.spawnDepth],
      velocity: [0, 0, p.approachSpeed],
      requiredHand: hand,
      requiredDirection: direction,
      color: palette.color,
      emissive: palette.emissive,
      shape: hasDirection ? "cone" : "box",
      scale: 0.14,
      label: direction,
      meta: { arrivalMs: travelMs },
    });
    t += p.isiMs + rng() * 300;
  }
  return trials;
}

const levels = [
  { level: 1, label: "Level 1 — Either hand", parameters: { trialCount: 20, approachSpeed: 2.2, spawnDepth: 7, handRules: ["either"], directionRatio: 0, crossMidlineRatio: 0, isiMs: 1400 } },
  { level: 2, label: "Level 2 — Ruled hands", parameters: { trialCount: 24, approachSpeed: 2.6, spawnDepth: 7, handRules: ["left", "right", "either"], directionRatio: 0, crossMidlineRatio: 0, isiMs: 1200 } },
  { level: 3, label: "Level 3 — 8-way slices", parameters: { trialCount: 26, approachSpeed: 3.0, spawnDepth: 8, handRules: ["left", "right", "either"], directionRatio: 0.5, crossMidlineRatio: 0.15, isiMs: 1100 } },
  { level: 4, label: "Level 4 — Rhythm 100 BPM", parameters: { trialCount: 28, approachSpeed: 3.4, spawnDepth: 8, handRules: ["left", "right", "either", "both"], directionRatio: 0.6, crossMidlineRatio: 0.3, bpm: 100, isiMs: 1000 } },
  { level: 5, label: "Level 5 — Cross-midline 120 BPM", parameters: { trialCount: 32, approachSpeed: 3.8, spawnDepth: 9, handRules: ["left", "right", "both"], directionRatio: 0.75, crossMidlineRatio: 0.5, bpm: 120, isiMs: 900 } },
];

export const DepthSliceVR: DrillDefinition = {
  id: "depth-slice",
  name: "Depth Slice VR",
  shortName: "Depth Slice",
  phase: "Execute",
  description:
    "Targets fly at you through depth. Strike in the contact window — purple = LEFT hand, gold = RIGHT hand, teal = either, gray = both. Cones demand an 8-way directional slice. Rhythm levels lock to the beat.",
  purpose: "Depth timing, slicing, bimanual coordination, cross-midline control.",
  interaction: "touch",
  instructions: [
    "1. Targets fly toward you through depth. Let them come into range, then STRIKE THROUGH them.",
    "2. PURPLE = LEFT hand. GOLD = RIGHT hand. TEAL = either hand. GRAY = both hands.",
    "3. CONES must be sliced in the direction they point — swing your hand THROUGH the cone along its arrow.",
    "4. Time your contact for the moment the target reaches you. Too early or too late is a miss.",
    "5. Rhythm levels lock targets to a beat — find the tempo and stay on it.",
  ],
  controlsHint: "STRIKE THROUGH TARGETS AS THEY ARRIVE - MATCH HAND COLORS",
  environment: "arena",
  mvp: true,
  levels,
  buildTrials: (params, rng) => buildDepthSliceTrials(params as Params, rng),
  durationMs: (params) => {
    const p = params as Params;
    const travelMs = (p.spawnDepth / p.approachSpeed) * 1000;
    return 1500 + p.trialCount * (p.isiMs + 150) + travelMs + 2000;
  },
};
