import type { DrillDefinition, TrialSpec, TargetShape } from "@/ares/drillTypes";
import {
  TRACK_LIBRARY,
  BASE_RECIPES,
  generateMap,
  computeDifficulty,
  cognitiveLoad,
  tierRecipe,
  type Track,
  type TrackRecipe,
} from "./beatmap";
import { tierAt, PERFORM_TIERS, STROBE_ELIGIBLE_TIER } from "./tiers";
import { makeRng } from "@/utils/rng";

/**
 * PERFORM — flow-state training on a TEN-TIER ladder.
 *
 * Each of the ten tracks now carries the same ten tiers. The tiers do not
 * merely speed the track up; they progressively load the athlete's decision
 * system while the beat grid stays musical:
 *
 *   T1-3  motor only        strike the note with the matching hand
 *   T4    + VOIDS           hollow rings — do NOT strike (inhibition)
 *   T5    + DECOYS          dim pyramids that punish a careless hand
 *   T6    + LATE VOIDS      a live note disarms mid-flight — cancel the swing
 *   T7    + MIRROR / DRIFT  cones invert the hand rule; notes wander in flight
 *   T8    + BURSTS          numbered clusters struck in order (working memory)
 *   T9    everything, full field, full pace
 *   T10   ADAPTIVE          a live staircase that holds you at your edge
 *
 * REDUNDANT CODING: identity is never carried by color alone. Every category
 * owns a distinct silhouette, readable in the far periphery and unambiguous to
 * a protan, deutan, or tritan athlete:
 *
 *   RIGHT  purple  DIAMOND      LEFT   teal   BOX
 *   VOID   slate   RING (hollow)     DECOY  dim    PYRAMID
 *   MIRROR (hand inverts)  CONE       BURST  SPHERE + ordinal label
 */

const PURPLE = "#8B5CF6";
const TEAL = "#2998AA";
const VOID_C = "#3A3F55";   // hollow ring — the "do not strike" identity
const DECOY_C = "#5B5470";  // desaturated: present, but not for you
const CLUTTER_C = "#2A2E3E";

export const COUNT_IN_BEATS = 8;
const STRIKE_Z = -0.48;
export const PERFORM_LEVELS = PERFORM_TIERS;

function trackToDrill(track: Track, index: number): DrillDefinition {
  const map = track.map;
  const base = BASE_RECIPES.find((r) => map.id === r.id)!;
  const spb = 60 / map.bpm;
  const durationMs = (COUNT_IN_BEATS + map.lengthBeats + 4) * spb * 1000;

  const levels = Array.from({ length: PERFORM_TIERS }, (_, i) => {
    const lvl = i + 1;
    const t = tierAt(lvl);
    const r = tierRecipe(base, lvl);
    const motor = computeDifficulty(generateMap(r));
    const cog = cognitiveLoad(lvl);
    return {
      level: lvl,
      label: `T${lvl} ${t.name} — M${motor.toFixed(1)} · C${cog.toFixed(1)}`,
      parameters: { ...r, tier: lvl } as unknown as Record<string, unknown>,
    };
  });

  return {
    id: `perform-${map.id}`,
    name: `${String(index + 1).padStart(2, "0")} · ${map.title}`,
    shortName: map.title,
    phase: "Perform",
    description: `Track ${index + 1}/10 — ${map.bpm} BPM on the ten-tier ladder. Tiers 1-3 are pure motor. From T4 the track starts making decisions for you to refuse: voids, decoys, late rule-flips, mirrored hands, ordered bursts. T10 is a live staircase. Strike PURPLE DIAMONDS with the RIGHT, TEAL BOXES with the LEFT, exactly as they arrive.`,
    purpose: "Beat-locked visuomotor flow under escalating decision load (10-tier ladder).",
    interaction: "touch",
    responseMode: "strike",
    environment: "arena",
    mvp: true,
    hardStop: true,
    handIdentity: true,
    supportsStrobe: true,
    rhythm: {
      approachMs: map.approachSec * 1000,
      bpm: map.bpm,
      style: map.style,
      lengthBeats: map.lengthBeats,
      countInBeats: COUNT_IN_BEATS,
    },
    instructions: [
      `1. "${map.title}" — ${map.bpm} BPM. Ten tiers: T1 is slow and central, T10 finds your edge and holds you there.`,
      "2. PURPLE DIAMOND = RIGHT hand. TEAL BOX = LEFT hand. Strike AT arrival: 60ms is PERFECT, 140ms is GOOD.",
      "3. HOLLOW RING = VOID. Do not touch it. Let it pass. (T4+)",
      "4. DIM PYRAMID = DECOY - not yours. CONE = MIRROR - strike it with the OTHER hand. (T5+/T7+)",
      "5. A note that turns into a ring MID-FLIGHT has disarmed: cancel the swing. Numbered spheres are struck IN ORDER. (T6+/T8+)",
      `6. Hold ~80% to stay in the Goldilocks Zone. Clear 85% and the next tier unlocks. Strobe unlocks at T${STROBE_ELIGIBLE_TIER}.`,
    ],
    controlsHint: "PURPLE/DIAMOND=RIGHT · TEAL/BOX=LEFT · RING=DO NOT STRIKE",
    levels,

    buildTrials: (params): TrialSpec[] => {
      const r = params as unknown as TrackRecipe & { tier: number };
      const t = tierAt(r.tier ?? 1);
      const m = generateMap(r);
      const rng = makeRng((r.seed ?? 1) * 7919 + 13);
      const approachMs = r.approachSec * 1000;
      const speed = 3.6 / r.approachSec;
      const laneX = [-(0.26 + r.spread * 0.3), 0, 0.26 + r.spread * 0.3];
      const laneY = [1.37 - (0.17 + r.spread * 0.09), 1.37 + (0.17 + r.spread * 0.09)];
      const baseScale = 0.075 * t.sizeMul;
      const out: TrialSpec[] = [];

      m.notes.forEach((n, i) => {
        const arriveMs = (COUNT_IN_BEATS + n.beat) * spb * 1000;
        const spawnAt = arriveMs - approachMs;
        const pos: [number, number, number] = [laneX[n.col], laneY[n.row], STRIKE_Z - 3.6];
        const handColor = n.hand === "right" ? PURPLE : TEAL;
        const handShape: TargetShape = n.hand === "right" ? "diamond" : "box";
        const common = {
          zone: (n.col === 0 ? "left" : n.col === 2 ? "right" : "center") as TrialSpec["zone"],
          position: pos,
          velocity: [0, 0, speed] as [number, number, number],
          meta: { arriveMs, rhythmNote: true, approachMs, tier: r.tier },
        };

        // ---- VOID: a hollow ring that must be let through (inhibition)
        if (rng() < t.suppress) {
          out.push({
            id: `v-${i}`, spawnAt, duration: approachMs + 260, kind: "noGo",
            color: VOID_C, emissive: VOID_C, shape: "ring", scale: baseScale * 1.1,
            ...common, meta: { ...common.meta, mechanic: "void" },
          });
          return;
        }

        // ---- BURST: an ordered cluster — strike 1, then 2, then 3
        if (rng() < t.burst) {
          const n2 = 2 + (rng() < 0.4 ? 1 : 0);
          const gid = `burst-${i}`;
          for (let k = 0; k < n2; k++) {
            const hand = k % 2 === 0 ? n.hand : n.hand === "right" ? "left" : "right";
            out.push({
              id: `b-${i}-${k}`, spawnAt, duration: approachMs + 420, kind: "go",
              groupId: gid, groupMode: "ordered", seq: k,
              requiredHand: hand, label: String(k + 1),
              color: hand === "right" ? PURPLE : TEAL,
              emissive: hand === "right" ? PURPLE : TEAL,
              shape: "sphere", scale: baseScale * 0.9,
              ...common,
              position: [laneX[Math.min(2, Math.max(0, n.col + k - 1))], laneY[k % 2], STRIKE_Z - 3.6],
              meta: { ...common.meta, mechanic: "burst" },
            });
          }
          return;
        }

        // ---- MIRROR: a cone in the note's color, taken with the OPPOSITE hand
        const mirrored = rng() < t.mirror;
        // ---- LATE VOID: arms live, then disarms in flight — cancel the swing
        const lateVoid = !mirrored && rng() < t.lateVoid;
        // ---- DRIFT: refuses to fly straight (pursuit-to-strike)
        const drifts = rng() < t.unstable;

        const spec: TrialSpec = {
          id: `n-${i}`,
          spawnAt,
          duration: approachMs + 240,
          kind: "go",
          requiredHand: mirrored ? (n.hand === "right" ? "left" : "right") : n.hand,
          color: handColor,
          emissive: handColor,
          shape: mirrored ? "cone" : handShape,
          scale: baseScale,
          ...common,
          meta: { ...common.meta, mechanic: mirrored ? "mirror" : lateVoid ? "lateVoid" : "note" },
        };
        if (drifts) {
          spec.wander = {
            ax: 0.09 + rng() * 0.07, ay: 0.05 + rng() * 0.05,
            wx: 1.4 + rng() * 1.1, wy: 1.1 + rng() * 1.0,
            px: rng() * 6.28, py: rng() * 6.28,
          };
        }
        if (lateVoid) {
          // disarm at ~62% of the flight — late enough to have committed
          spec.switchKindAt = spawnAt + approachMs * 0.62;
          spec.switchKindTo = "noGo";
          spec.switchColor = VOID_C;
        }
        out.push(spec);

        // ---- DECOY: a dim pyramid riding alongside — not yours
        if (rng() < t.decoy) {
          const dcol = n.col === 1 ? (rng() < 0.5 ? 0 : 2) : 1;
          out.push({
            id: `d-${i}`, spawnAt: spawnAt + 60, duration: approachMs + 200, kind: "distractor",
            zone: (dcol === 0 ? "left" : dcol === 2 ? "right" : "center") as TrialSpec["zone"],
            position: [laneX[dcol], laneY[1 - n.row], STRIKE_Z - 3.6],
            velocity: [0, 0, speed],
            color: DECOY_C, emissive: DECOY_C, shape: "pyramid", scale: baseScale * 0.85,
            meta: { arriveMs, rhythmNote: true, approachMs, mechanic: "decoy" },
          });
        }

        // ---- CLUTTER: inert traffic that must be filtered out visually
        if (rng() < t.clutter) {
          const ccol = rng() < 0.5 ? 0 : 2;
          out.push({
            id: `c-${i}`, spawnAt: spawnAt + rng() * 180, duration: approachMs + 240,
            kind: "distractor", decor: true,
            zone: (ccol === 0 ? "left" : "right") as TrialSpec["zone"],
            position: [laneX[ccol] * (1.1 + rng() * 0.3), laneY[rng() < 0.5 ? 0 : 1] + (rng() - 0.5) * 0.2, STRIKE_Z - 3.6],
            velocity: [0, 0, speed * (0.9 + rng() * 0.25)],
            color: CLUTTER_C, emissive: CLUTTER_C, shape: "sphere", scale: baseScale * 0.55,
            meta: { mechanic: "clutter" },
          });
        }
      });

      return out.sort((a, b) => a.spawnAt - b.spawnAt);
    },

    /**
     * TIER 10 — ADAPTIVE UNLIMITED. The ladder ends here and a staircase takes
     * over. Every spawn reads the live snapshot and nudges the two axes the
     * athlete can actually feel: approach speed and target size. A clean streak
     * tightens the screw; a stumble backs it off immediately. The athlete is
     * held at their edge (~80%) rather than run into a wall.
     */
    onSpawnAdapt: (spec, snap) => {
      const tier = (spec.meta?.tier as number) ?? 1;
      if (tier !== PERFORM_TIERS) return;
      const streak = snap.streak ?? 0;
      const step = Math.max(-4, Math.min(10, streak - snap.errors * 2));
      const tighten = 1 + step * 0.022;          // up to ~1.22x approach speed
      const shrink = 1 - Math.max(0, step) * 0.014; // down to ~0.86x size
      if (spec.velocity) spec.velocity = [spec.velocity[0], spec.velocity[1], spec.velocity[2] * tighten];
      spec.scale = Math.max(0.045, spec.scale * shrink);
      spec.duration = Math.max(320, spec.duration / tighten);
    },

    durationMs: () => durationMs,
  };
}

export const PERFORM_DRILLS: DrillDefinition[] = TRACK_LIBRARY.map((t, i) => trackToDrill(t, i));
