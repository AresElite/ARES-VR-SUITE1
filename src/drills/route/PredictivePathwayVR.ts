import type { DrillDefinition, TrialSpec } from "@/ares/drillTypes";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { EYE_Y } from "../shared/zones";
import { levels50, lerp50, ilerp50 } from "../shared/levels";

/**
 * SYNCHRONIZE — Predictive Pathway
 *
 * Colour-coded objects FLY IN toward you from downfield, racing to the gate just ahead. You
 * read the race, predict which colour crosses FIRST, and SLAP that colour's pad at your hands
 * — before it arrives. The objects genuinely approach in depth (they grow as they close), so
 * the judgement is a real time-to-contact / arrival-order prediction, not a flat animation.
 *
 * The old build sent the objects on a sideways ORBIT around the athlete — nothing ever came
 * toward them, so there was no arrival to predict and the drill made no sense. Now every mover
 * travels straight down its lane toward the gate on a constant approach velocity, and the one
 * that reaches the gate first is the winner.
 *
 * Higher levels pack the arrivals closer together (harder to separate), add more runners, and
 * add DECEPTION: an object gets a head start so it LEADS early, then is overtaken by a faster
 * runner starting deeper — punishing the athlete who commits to the early leader instead of
 * extrapolating true arrival.
 */

interface Params {
  decisionCount: number;
  objectsPerDecision: number;
  windowMs: number;
  gapMs: number;
  lateSwitchRatio: number;   // share of decisions with an overtake deception
  speedSpread: number;       // how close the arrivals are — smaller = harder to call
  [k: string]: unknown;
}

const LANE_COLORS = [
  { color: ARES_ACCENTS.tealBright, name: "TEAL" },
  { color: ARES_ACCENTS.purpleLight, name: "PURPLE" },
  { color: ARES_COLORS.warningGold, name: "GOLD" },
  { color: "#2998AA", name: "GREEN" },
  { color: ARES_COLORS.white, name: "WHITE" },
];

const GATE_Z = -0.85;          // the finish line, just past arm's reach
const START_Z = -7.0;          // where the runners appear, downfield
const NEAR_START_Z = -4.6;     // a deception head start

export function buildPathwayTrials(p: Params, rng: () => number, idPrefix = "pp"): TrialSpec[] {
  const trials: TrialSpec[] = [];
  let t = 1500;
  for (let d = 0; d < p.decisionCount; d++) {
    const groupId = `${idPrefix}-g${d}`;
    const n = Math.min(p.objectsPerDecision, LANE_COLORS.length);

    // winner arrives near the end of the decision window; the rest are spread a bit later,
    // their gap set by speedSpread (tighter at higher levels).
    const winner = Math.floor(rng() * n);
    const winArriveMs = p.windowMs * (0.82 + rng() * 0.08);
    const arriveMs = Array.from({ length: n }, (_, i) => {
      if (i === winner) return winArriveMs;
      const gap = p.windowMs * (0.06 + rng() * p.speedSpread);
      return winArriveMs + gap;
    });

    // deception: give ONE non-winner a head start so it leads early, then loses.
    const deceive = rng() < p.lateSwitchRatio && n >= 3;
    let decoy = -1;
    if (deceive) { do { decoy = Math.floor(rng() * n); } while (decoy === winner); }

    // lane x-offsets, spread across the field
    const laneX = Array.from({ length: n }, (_, i) => (n === 1 ? 0 : (-0.62 + (1.24 * i) / (n - 1))));

    // gate marker for this decision — a faint ring the runners race into
    trials.push({
      id: `${groupId}-gate`, spawnAt: t, duration: p.windowMs, kind: "distractor", decor: true,
      zone: "center", position: [0, EYE_Y + 0.05, GATE_Z],
      color: ARES_COLORS.softGray, emissive: ARES_COLORS.softGray, shape: "ring", scale: 0.5,
      meta: { decor: true },
    });

    for (let i = 0; i < n; i++) {
      const z0 = i === decoy ? NEAR_START_Z : START_Z;
      const dist = GATE_Z - z0;                       // positive: travelling in +Z toward the athlete
      const vz = dist / (arriveMs[i] / 1000);          // constant approach speed (m/s)
      const y = EYE_Y + 0.12 + (i - (n - 1) / 2) * 0.1;

      // the approaching runner — decor, WATCHED, never struck. It grows as it nears the gate.
      trials.push({
        id: `${groupId}-m${i}`, spawnAt: t, duration: p.windowMs,
        kind: "distractor", decor: true,
        zone: laneX[i] < 0 ? "left" : "right",
        position: [laneX[i], y, z0],
        velocity: [0, 0, vz],
        color: LANE_COLORS[i].color, emissive: LANE_COLORS[i].color,
        shape: "sphere", scale: 0.13,
        meta: { decor: true, approach: true },
      });

      // the answer pad at arm's reach — SLAP the colour you predict wins. The winner's pad is
      // the go; a wrong pad is a distractor. The correct answer never changes mid-window — the
      // deception is in the RACE (an overtake), which is the honest thing to read.
      trials.push({
        id: `${groupId}-p${i}${i === winner ? "-win" : ""}`, spawnAt: t, duration: p.windowMs,
        kind: i === winner ? "go" : "distractor",
        zone: "center",
        position: [-0.5 + (n === 1 ? 0.5 : (i * 1.0) / (n - 1)), 1.12, -0.55],
        color: LANE_COLORS[i].color, emissive: LANE_COLORS[i].color,
        shape: "box", scale: 0.075,
        label: LANE_COLORS[i].name, groupId, groupMode: "single",
      });
    }
    t += p.windowMs + p.gapMs;
  }
  return trials;
}

const levels = levels50((i) => ({
  label: `${3 + Math.floor(i / 16)} runners · ${ilerp50(0, 65, i)}% overtakes · ${ilerp50(3400, 1800, i)}ms`,
  parameters: {
    decisionCount: ilerp50(8, 15, i),
    objectsPerDecision: 3 + Math.floor(i / 16),
    windowMs: ilerp50(3400, 1800, i),
    gapMs: ilerp50(1500, 850, i),
    lateSwitchRatio: lerp50(0, 0.65, i),
    speedSpread: lerp50(0.5, 0.12, i),
  },
}));

export const PredictivePathwayVR: DrillDefinition = {
  id: "predictive-pathway",
  name: "Predictive Pathway",
  shortName: "Predictive Pathway",
  phase: "Synchronize",
  description:
    "Colored objects FLY IN from downfield, racing to the gate ahead of you. Read the race, predict which colour crosses FIRST, and slap that colour's pad at your hands — before it arrives. They grow as they close, so it is a true arrival-order call. Higher levels pack the finishes tighter, add runners, and add overtakes: an early leader that gets caught.",
  purpose: "Time-to-contact prediction and arrival-order judgement under deception.",
  interaction: "touch",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. Colored orbs fly TOWARD you down their lanes, racing to the gate ahead. WATCH them - never reach for the orbs.",
    "2. Predict which colour reaches the gate FIRST.",
    "3. SLAP the answer pad of that colour - the pads float at your hands.",
    "4. Commit BEFORE the winner arrives. No answer is a miss.",
    "5. Beware the overtake: the orb that leads early is not always the one that wins. Read the closing speed, not the current lead.",
  ],
  controlsHint: "WATCH THE RACE IN  ·  SLAP THE PAD OF THE COLOUR THAT ARRIVES FIRST",
  levels,
  buildTrials: (params, rng) => buildPathwayTrials(params as Params, rng),
  durationMs: (params) => {
    const p = params as Params;
    return 1500 + p.decisionCount * (p.windowMs + p.gapMs) + 1500;
  },

  analyze: (events) => {
    const ev = events.filter((e) => e.trialId.startsWith("pp-g"));
    if (!ev.length) return [];
    const correct = ev.filter((e) => e.correct).length;
    const total = ev.length;
    const rts = ev.filter((e) => e.correct && e.reactionMs !== undefined).map((e) => e.reactionMs!);
    const mean = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;
    return [
      `${Math.round((correct / total) * 100)}% of races called correctly (${correct}/${total}).`,
      `Mean commit time ${mean}ms into the window — earlier commits on correct calls mean stronger extrapolation.`,
    ];
  },
};
