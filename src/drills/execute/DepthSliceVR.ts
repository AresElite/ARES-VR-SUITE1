import type { DrillDefinition, HandRule, SliceDirection, TrialSpec } from "@/ares/drillTypes";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { pick } from "@/utils/rng";
import { EYE_Y } from "../shared/zones";
import { levels50, lerp50, ilerp50 } from "../shared/levels";

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
  // suite hand identity: PURPLE = RIGHT, TEAL = LEFT, gold = either
  left: { color: ARES_COLORS.electricTeal, emissive: ARES_COLORS.electricTeal },
  right: { color: ARES_ACCENTS.purpleGlow, emissive: ARES_ACCENTS.purpleGlow },
  either: { color: ARES_COLORS.warningGold, emissive: ARES_COLORS.warningGold },
  both: { color: ARES_COLORS.softGray, emissive: ARES_COLORS.electricTeal },
};

export function buildDepthSliceTrials(p: Params, rng: () => number, idPrefix = "ds"): TrialSpec[] {
  const trials: TrialSpec[] = [];
  const travelMs = (p.spawnDepth / p.approachSpeed) * 1000;
  const beatMs = p.bpm ? 60000 / p.bpm : undefined;
  let t = 1500;
  // balanced hand deck: equal counts of each rule, shuffled (no L/R skew)
  const deck: HandRule[] = [];
  for (let i = 0; i < p.trialCount; i++) deck.push(p.handRules[i % p.handRules.length]);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  for (let i = 0; i < p.trialCount; i++) {
    const hand = deck[i];
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

const levels = levels50((i) => ({
  label: `${lerp50(2.2, 4.4, i).toFixed(1)} m/s${i >= 26 ? `, ${ilerp50(90, 132, i)} BPM` : ""}`,
  parameters: {
    trialCount: ilerp50(20, 34, i),
    approachSpeed: lerp50(2.2, 4.4, i),
    spawnDepth: lerp50(7, 9, i),
    handRules: i < 10 ? ["either"] : i < 26 ? ["left", "right", "either"] : ["left", "right", "either", "both"],
    directionRatio: lerp50(0, 0.85, i),
    crossMidlineRatio: lerp50(0, 0.6, i),
    ...(i >= 26 ? { bpm: ilerp50(90, 132, i) } : {}),
    isiMs: ilerp50(1400, 850, i),
  },
}));

export const DepthSliceVR: DrillDefinition = {
  id: "depth-slice",
  name: "Depth Slice VR",
  shortName: "Depth Slice",
  phase: "Execute",
  description:
    "Targets fly at you through depth. Strike in the contact window — PURPLE = RIGHT hand, TEAL = LEFT hand, gold = either, gray = both. Cones demand an 8-way directional slice. Rhythm levels lock to the beat.",
  purpose: "Depth timing, slicing, bimanual coordination, cross-midline control.",
  interaction: "touch",
  instructions: [
    "1. Targets fly toward you through depth. Let them come into range, then STRIKE THROUGH them.",
    "2. PURPLE = RIGHT hand. TEAL = LEFT hand. GOLD = either hand. GRAY = both hands.",
    "3. CONES must be sliced in the direction they point — swing your hand THROUGH the cone along its arrow.",
    "4. Time your contact for the moment the target reaches you. Too early or too late is a miss.",
    "5. Rhythm levels lock targets to a beat — find the tempo and stay on it.",
  ],
  controlsHint: "STRIKE THROUGH TARGETS AS THEY ARRIVE - MATCH HAND COLORS",
  environment: "arena",
  mvp: true,
  handIdentity: true,
  levels,
  buildTrials: (params, rng) => buildDepthSliceTrials(params as Params, rng),
  durationMs: (params) => {
    const p = params as Params;
    const travelMs = (p.spawnDepth / p.approachSpeed) * 1000;
    return 1500 + p.trialCount * (p.isiMs + 150) + travelMs + 2000;
  },
};
