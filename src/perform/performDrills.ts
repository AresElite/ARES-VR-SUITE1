import type { DrillDefinition, TrialSpec } from "@/ares/drillTypes";
import { TRACK_LIBRARY, type Track } from "./beatmap";

/**
 * PERFORM — flow-state training. Every track in the library becomes a
 * playable drill: notes fly in from downrange and arrive at the strike
 * plane exactly ON the musical beat. PURPLE notes = RIGHT hand,
 * TEAL notes = LEFT hand — the suite's hand identity, now choreographed.
 */

const PURPLE = "#8B5CF6";
const TEAL = "#2998AA";
export const COUNT_IN_BEATS = 8; // two bars of groove before the first note
const STRIKE_Z = -0.48;
const LANE_X = [-0.36, 0, 0.36];
const LANE_Y = [1.18, 1.56];

function trackToDrill(track: Track, index: number): DrillDefinition {
  const map = track.map;
  const spb = 60 / map.bpm;
  const approachMs = map.approachSec * 1000;
  const speed = 3.6 / map.approachSec; // 3.6 m of travel, arriving on the beat
  const durationMs = (COUNT_IN_BEATS + map.lengthBeats + 4) * spb * 1000;
  const nps = Math.round((map.notes.length / (map.lengthBeats * spb)) * 10) / 10;

  return {
    id: `perform-${map.id}`,
    name: `${String(index + 1).padStart(2, "0")} · ${map.title}`,
    shortName: map.title,
    phase: "Perform",
    description: `Track ${index + 1}/10 — difficulty ${track.difficulty.toFixed(1)}/10 · ${map.bpm} BPM · ${nps} notes/sec · ${Math.round(map.lengthBeats * spb)}s. Notes land ON the beat: strike PURPLE with RIGHT, TEAL with LEFT, exactly as they reach you.`,
    purpose: "Beat-locked visuomotor flow training (measured difficulty ladder).",
    interaction: "touch",
    responseMode: "strike",
    environment: "arena",
    mvp: true,
    hardStop: true,
    rhythm: {
      approachMs,
      bpm: map.bpm,
      style: map.style,
      lengthBeats: map.lengthBeats,
      countInBeats: COUNT_IN_BEATS,
    },
    instructions: [
      `1. "${map.title}" — ${map.bpm} BPM, difficulty ${track.difficulty.toFixed(1)}/10 on the measured ladder.`,
      "2. Two bars of groove count you in. Notes then fly toward you and arrive ON the beat.",
      "3. PURPLE note - strike with RIGHT hand. TEAL note - strike with LEFT hand.",
      "4. Strike AT the moment of arrival: within 60ms is PERFECT, 140ms is GOOD.",
      "5. Build the streak - your timing precision per hand is scored, not just your hits.",
    ],
    controlsHint: "ON THE BEAT - PURPLE=RIGHT - TEAL=LEFT",
    levels: [{ level: 1, label: `${map.title} — D${track.difficulty.toFixed(1)}`, parameters: {} }],
    buildTrials: (): TrialSpec[] =>
      map.notes.map((n, i) => {
        const arriveMs = (COUNT_IN_BEATS + n.beat) * spb * 1000;
        const x = LANE_X[n.col];
        const y = LANE_Y[n.row];
        return {
          id: `n-${i}`,
          spawnAt: arriveMs - approachMs,
          duration: approachMs + 200,
          kind: "go",
          zone: n.col === 0 ? "left" : n.col === 2 ? "right" : "center",
          position: [x, y, STRIKE_Z - 3.6],
          velocity: [0, 0, speed],
          requiredHand: n.hand,
          color: n.hand === "right" ? PURPLE : TEAL,
          emissive: n.hand === "right" ? PURPLE : TEAL,
          shape: n.hand === "right" ? "diamond" : "box",
          scale: 0.075,
          meta: { arriveMs, rhythmNote: true },
        };
      }),
    durationMs: () => durationMs,
  };
}

export const PERFORM_DRILLS: DrillDefinition[] = TRACK_LIBRARY.map((t, i) => trackToDrill(t, i));
