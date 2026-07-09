import { makeRng } from "@/utils/rng";

/**
 * PERFORM — the beat-mapped choreography system.
 *
 * A BeatMap is a musical score for the body: notes live on a beat grid and
 * arrive at the strike plane exactly ON the beat. Every note carries a hand
 * (RIGHT = purple, LEFT = teal) and a lane on a 3×2 reach grid.
 *
 * Difficulty is COMPUTED, never guessed — the same philosophy as ordering
 * songs by measured demand. The score blends note density, approach speed,
 * spatial spread, crossovers, and hand-switch entropy, so the track library
 * self-sorts into an honest progression ladder.
 */

export type NoteHand = "left" | "right";

export interface BeatNote {
  /** position on the beat grid (0 = first playable beat, 0.5 = offbeat) */
  beat: number;
  /** lane column 0..2 (left → right) and row 0..1 (low → high) */
  col: number;
  row: number;
  hand: NoteHand;
}

export interface BeatMap {
  id: string;
  title: string;
  bpm: number;
  /** playable length in beats (excluding the 2-bar count-in) */
  lengthBeats: number;
  /** seconds a note is airborne before it arrives at the strike plane */
  approachSec: number;
  style: "pulse" | "drive" | "wave" | "storm";
  notes: BeatNote[];
}

/** Authoring recipe — each track is generated from these knobs. */
export interface TrackRecipe {
  id: string;
  title: string;
  bpm: number;
  bars: number;
  approachSec: number;
  style: BeatMap["style"];
  /** probability a beat carries a note (density) */
  fill: number;
  /** probability of offbeat (eighth) notes between beats */
  offbeat: number;
  /** probability of a double (both hands, same beat) */
  doubles: number;
  /** probability a note crosses the midline (right hand on left lane) */
  crossover: number;
  /** 0 = center-biased lanes, 1 = full-width peripheral spread */
  spread: number;
  seed: number;
}

/** Generate the note chart from a recipe — deterministic per seed. */
export function generateMap(r: TrackRecipe): BeatMap {
  const rng = makeRng(r.seed);
  const notes: BeatNote[] = [];
  const lengthBeats = r.bars * 4;
  let lastHand: NoteHand = rng() < 0.5 ? "left" : "right";
  const laneFor = (hand: NoteHand): { col: number; row: number } => {
    const wide = rng() < r.spread;
    const cross = rng() < r.crossover;
    const homeCol = hand === "right" ? 2 : 0;
    const awayCol = hand === "right" ? 0 : 2;
    const col = cross ? awayCol : wide ? homeCol : rng() < 0.5 ? 1 : homeCol;
    return { col, row: rng() < 0.45 ? 0 : 1 };
  };
  for (let b = 0; b < lengthBeats; b++) {
    if (rng() < r.fill) {
      if (rng() < r.doubles) {
        notes.push({ beat: b, col: 0, row: rng() < 0.5 ? 0 : 1, hand: "left" });
        notes.push({ beat: b, col: 2, row: rng() < 0.5 ? 0 : 1, hand: "right" });
        lastHand = rng() < 0.5 ? "left" : "right";
      } else {
        // alternate with occasional repeats — hand-switch entropy
        const switchHand = rng() < 0.72;
        const hand: NoteHand = switchHand ? (lastHand === "left" ? "right" : "left") : lastHand;
        notes.push({ beat: b, ...laneFor(hand), hand });
        lastHand = hand;
      }
    }
    if (rng() < r.offbeat) {
      const hand: NoteHand = lastHand === "left" ? "right" : "left";
      notes.push({ beat: b + 0.5, ...laneFor(hand), hand });
      lastHand = hand;
    }
  }
  return {
    id: r.id,
    title: r.title,
    bpm: r.bpm,
    lengthBeats,
    approachSec: r.approachSec,
    style: r.style,
    notes: notes.sort((a, b2) => a.beat - b2.beat),
  };
}

/**
 * Objective difficulty (0–10): measured from the chart itself.
 *  - density: notes per second (dominant term)
 *  - velocity: approach speed demand (short approach = harder read)
 *  - spread: mean lane distance from center (peripheral demand)
 *  - switches: hand-alternation + crossover load (coordination demand)
 *  - bursts: worst 4-beat window density (peak load, not just average)
 */
export function computeDifficulty(map: BeatMap): number {
  const secPerBeat = 60 / map.bpm;
  const durationSec = map.lengthBeats * secPerBeat;
  const nps = map.notes.length / durationSec;
  const speed = 1 / map.approachSec;
  let spread = 0;
  let switches = 0;
  let crossovers = 0;
  for (let i = 0; i < map.notes.length; i++) {
    const n = map.notes[i];
    spread += Math.abs(n.col - 1) / 1;
    if (i > 0 && map.notes[i - 1].hand !== n.hand) switches++;
    const homeCol = n.hand === "right" ? 2 : 0;
    if (Math.abs(n.col - homeCol) === 2) crossovers++;
  }
  spread /= Math.max(1, map.notes.length);
  const switchRate = switches / Math.max(1, map.notes.length - 1);
  const crossRate = crossovers / Math.max(1, map.notes.length);
  // peak 4-beat burst density
  let burst = 0;
  for (const n of map.notes) {
    const inWindow = map.notes.filter((m) => m.beat >= n.beat && m.beat < n.beat + 4).length;
    burst = Math.max(burst, inWindow / (4 * secPerBeat));
  }
  const raw =
    nps * 1.15 +
    speed * 0.9 +
    spread * 1.1 +
    switchRate * 0.8 +
    crossRate * 2.2 +
    burst * 0.35;
  return Math.round(Math.min(10, Math.max(0.5, raw * 1.35 - 2.5)) * 10) / 10;
}

/**
 * THE TRACK LIBRARY — ten tracks forming a measured progression ladder,
 * exactly like a difficulty-ordered song list. IDs are stable; difficulty
 * is computed from the chart, and the library ships sorted by it.
 */
export const BASE_RECIPES: TrackRecipe[] = [
  { id: "warmup-90",    title: "Warm-Up Circuit",  bpm: 90,  bars: 24, approachSec: 1.5,  style: "pulse", fill: 0.55, offbeat: 0.0,  doubles: 0.0,  crossover: 0.0,  spread: 0.25, seed: 101 },
  { id: "pulse-100",    title: "Pulse",            bpm: 100, bars: 26, approachSec: 1.4,  style: "pulse", fill: 0.68, offbeat: 0.04, doubles: 0.02, crossover: 0.0,  spread: 0.35, seed: 102 },
  { id: "flow-110",     title: "Flow State",       bpm: 110, bars: 28, approachSec: 1.3,  style: "wave",  fill: 0.74, offbeat: 0.08, doubles: 0.04, crossover: 0.04, spread: 0.45, seed: 103 },
  { id: "sidewind-116", title: "Sidewinder",       bpm: 116, bars: 28, approachSec: 1.25, style: "wave",  fill: 0.72, offbeat: 0.1,  doubles: 0.05, crossover: 0.1,  spread: 0.8,  seed: 104 },
  { id: "syncope-118",  title: "Syncopate",        bpm: 118, bars: 28, approachSec: 1.2,  style: "drive", fill: 0.6,  offbeat: 0.3,  doubles: 0.05, crossover: 0.08, spread: 0.5,  seed: 105 },
  { id: "crossfire-124",title: "Crossfire",        bpm: 124, bars: 30, approachSec: 1.15, style: "drive", fill: 0.75, offbeat: 0.12, doubles: 0.08, crossover: 0.28, spread: 0.6,  seed: 106 },
  { id: "stream-132",   title: "Streamline",       bpm: 132, bars: 30, approachSec: 1.1,  style: "drive", fill: 0.85, offbeat: 0.18, doubles: 0.08, crossover: 0.12, spread: 0.55, seed: 107 },
  { id: "overdrive-140",title: "Overdrive",        bpm: 140, bars: 32, approachSec: 1.05, style: "storm", fill: 0.85, offbeat: 0.25, doubles: 0.12, crossover: 0.18, spread: 0.7,  seed: 108 },
  { id: "chaos-148",    title: "Chaos Theory",     bpm: 148, bars: 32, approachSec: 1.0,  style: "storm", fill: 0.88, offbeat: 0.3,  doubles: 0.15, crossover: 0.3,  spread: 0.85, seed: 109 },
  { id: "ascension-160",title: "Ascension",        bpm: 160, bars: 34, approachSec: 0.95, style: "storm", fill: 0.9,  offbeat: 0.35, doubles: 0.18, crossover: 0.34, spread: 0.95, seed: 110 },
];

/**
 * LEVEL SCALING — every track becomes a 12-rung ladder. Low levels are
 * slower, sparser, and CENTRAL (targets hug the midline); high levels are
 * denser, faster, syncopated, and PERIPHERAL (full-width field, crossovers,
 * doubles). The Goldilocks Zone lives somewhere on this ladder for every
 * athlete — the prescription engine finds it and holds them there.
 */
export function levelRecipe(base: TrackRecipe, level: number): TrackRecipe {
  const L = Math.max(1, Math.min(12, level));
  const t = (L - 1) / 11; // 0..1 across the ladder
  return {
    ...base,
    id: `${base.id}-l${L}`,
    fill: Math.min(0.95, base.fill * (0.72 + t * 0.42)),
    offbeat: Math.min(0.5, base.offbeat * 0.4 + t * (base.offbeat + 0.08)),
    doubles: Math.min(0.3, base.doubles * 0.3 + t * (base.doubles + 0.05)),
    crossover: Math.min(0.45, base.crossover * 0.3 + t * (base.crossover + 0.06)),
    spread: Math.min(1, 0.15 + t * (0.35 + base.spread)), // central -> peripheral
    approachSec: base.approachSec * (1.18 - t * 0.3), // slower read -> faster read
    seed: base.seed * 1000 + L,
  };
}

export interface Track {
  map: BeatMap;
  difficulty: number;
}

export const TRACK_LIBRARY: Track[] = BASE_RECIPES
  .map((r) => {
    const map = generateMap(r);
    return { map, difficulty: computeDifficulty(map) };
  })
  .sort((a, b) => a.difficulty - b.difficulty);
