import type { DrillDefinition, TrialSpec } from "@/ares/drillTypes";
import {
  TRACK_LIBRARY,
  BASE_RECIPES,
  generateMap,
  computeDifficulty,
  levelRecipe,
  type Track,
  type TrackRecipe,
} from "./beatmap";

/**
 * PERFORM — flow-state training. Every track is a 12-level ladder: low
 * levels are slow, sparse, and central; high levels are fast, dense, and
 * peripheral (crossovers, doubles, full-width field). Notes arrive at the
 * strike plane exactly ON the musical beat. PURPLE = RIGHT, TEAL = LEFT.
 */

const PURPLE = "#8B5CF6";
const TEAL = "#2998AA";
export const COUNT_IN_BEATS = 8;
const STRIKE_Z = -0.48;
export const PERFORM_LEVELS = 12;

function trackToDrill(track: Track, index: number): DrillDefinition {
  const map = track.map;
  const base = BASE_RECIPES.find((r) => map.id === r.id)!;
  const spb = 60 / map.bpm;
  const durationMs = (COUNT_IN_BEATS + map.lengthBeats + 4) * spb * 1000;

  const levels = Array.from({ length: PERFORM_LEVELS }, (_, i) => {
    const r = levelRecipe(base, i + 1);
    const d = computeDifficulty(generateMap(r));
    const field = r.spread < 0.4 ? "central" : r.spread < 0.7 ? "mid-field" : "peripheral";
    return {
      level: i + 1,
      label: `LV ${i + 1} — D${d.toFixed(1)} · ${field}`,
      parameters: r as unknown as Record<string, unknown>,
    };
  });

  return {
    id: `perform-${map.id}`,
    name: `${String(index + 1).padStart(2, "0")} · ${map.title}`,
    shortName: map.title,
    phase: "Perform",
    description: `Track ${index + 1}/10 — ${map.bpm} BPM, 12-level ladder from central/slow to peripheral/fast. Notes land ON the beat: strike PURPLE with RIGHT, TEAL with LEFT, exactly as they reach you. Progress until you sit near 80% — that is the Goldilocks Zone.`,
    purpose: "Beat-locked visuomotor flow training (12-level Goldilocks ladder).",
    interaction: "touch",
    responseMode: "strike",
    environment: "arena",
    mvp: true,
    hardStop: true,
    rhythm: {
      approachMs: map.approachSec * 1000,
      bpm: map.bpm,
      style: map.style,
      lengthBeats: map.lengthBeats,
      countInBeats: COUNT_IN_BEATS,
    },
    instructions: [
      `1. "${map.title}" — ${map.bpm} BPM. Twelve levels: LV 1 is slow and central, LV 12 is fast and full-field.`,
      "2. Two bars of groove count you in. Notes then fly toward you and arrive ON the beat.",
      "3. PURPLE note - strike with RIGHT hand. TEAL note - strike with LEFT hand.",
      "4. Strike AT the moment of arrival: within 60ms is PERFECT, 140ms is GOOD.",
      "5. Holding ~80% accuracy? You are in the Goldilocks Zone - stay. Above 88% clean? Move up a level.",
    ],
    controlsHint: "ON THE BEAT - PURPLE=RIGHT - TEAL=LEFT",
    levels,
    buildTrials: (params): TrialSpec[] => {
      const r = params as unknown as TrackRecipe;
      const m = generateMap(r);
      const approachMs = r.approachSec * 1000;
      const speed = 3.6 / r.approachSec;
      // central -> peripheral: the lane grid widens with the level's spread
      const laneX = [-(0.26 + r.spread * 0.3), 0, 0.26 + r.spread * 0.3];
      const laneY = [1.37 - (0.17 + r.spread * 0.09), 1.37 + (0.17 + r.spread * 0.09)];
      return m.notes.map((n, i) => {
        const arriveMs = (COUNT_IN_BEATS + n.beat) * spb * 1000;
        return {
          id: `n-${i}`,
          spawnAt: arriveMs - approachMs,
          duration: approachMs + 200,
          kind: "go",
          zone: n.col === 0 ? "left" : n.col === 2 ? "right" : "center",
          position: [laneX[n.col], laneY[n.row], STRIKE_Z - 3.6],
          velocity: [0, 0, speed],
          requiredHand: n.hand,
          color: n.hand === "right" ? PURPLE : TEAL,
          emissive: n.hand === "right" ? PURPLE : TEAL,
          shape: n.hand === "right" ? "diamond" : "box",
          scale: 0.075,
          meta: { arriveMs, rhythmNote: true, approachMs },
        };
      });
    },
    durationMs: () => durationMs,
  };
}

export const PERFORM_DRILLS: DrillDefinition[] = TRACK_LIBRARY.map((t, i) => trackToDrill(t, i));
