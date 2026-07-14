import type { DrillDefinition, TrialSpec, TargetZone } from "@/ares/drillTypes";
import { pick } from "@/utils/rng";
import { strikePosition, PERIPHERAL_ZONES } from "../shared/zones";
import { levels25, lerp25, ilerp25, levels50, lerp50, ilerp50 } from "../shared/levels";

/**
 * ACQUIRE — direct ports of the A.R.E.S. Performance Suite drills.
 * Exact names and progression structure from the touchscreen suite.
 */

const TEAL = "#2998AA";
const TEAL_L = "#7FD3DE";
const GOLD = "#C4B5FD";
const GRAY = "#111428";
const WHITE = "#EAF0FF";
const Z = -0.62;

// ============================== SPEED-SEARCH ==============================
/**
 * SPEED-SEARCH — a three-band visual-search ladder.
 *
 * The field is ALWAYS 20 items and the run is ALWAYS 20 searches. Set size is not
 * a difficulty knob here: in visual search, changing the set size changes what the
 * slope of the search function even means, so holding it constant at 20 is what
 * makes level-to-level comparison honest. Difficulty comes from WHAT you are
 * searching for and WHERE you have to look for it.
 *
 *   L1-16   FORM.        Find the one PYRAMID among 19 spheres and cubes. Large,
 *                        fairly central, high contrast. The target pops out on 3D
 *                        shape — this is the entry task.
 *
 *   L17-32  ORIENTATION. The shapes are gone. Now it is 20 grating discs, 19 of
 *                        them at the SAME angle and one rotated. There is no form
 *                        cue and no colour cue left: the only thing distinguishing
 *                        the target is the direction its EDGES run. Contrast is
 *                        still generous; the field pushes out into the periphery.
 *
 *   L33-50  CONTRAST.    The same orientation singleton, but the contrast now falls
 *                        (70% -> 8%) AND the angle difference narrows (90deg -> 25deg).
 *                        At the top the athlete is hunting a barely-visible patch
 *                        whose edges run only slightly off the crowd's, out at 40deg
 *                        eccentricity. This is edge and contrast detection, not
 *                        shape recognition, and it is the skill that finds a ball
 *                        against a cluttered stand in flat light.
 *
 * Across all three bands the field grows outward and the items shrink, so the
 * athlete is pushed from a comfortable foveal search into a genuinely peripheral one.
 */
const SS_FIELD = 20;    // 20 items, every level
const SS_TRIALS = 20;   // 20 searches, every level
const SS_Z = -1.25;     // pointer distance — you aim, you do not reach
const SS_BAND = (i: number): "form" | "orientation" | "contrast" =>
  i < 16 ? "form" : i < 32 ? "orientation" : "contrast";

export const SpeedSearch: DrillDefinition = {
  id: "speed-search",
  name: "Speed-Search",
  shortName: "Speed-Search",
  phase: "Acquire",
  description: "20 items, 20 searches. Early levels: find the one PYRAMID among spheres and cubes. Later: the shapes become grating discs — 19 facing the same way and ONE rotated, found by its EDGES alone. At the top the contrast drops and the angle difference narrows, out in the far periphery.",
  purpose: "Peripheral visual search — form, then orientation, then low-contrast edge detection.",
  interaction: "ray",
  responseMode: "pointer",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. TWENTY items appear across your field. Exactly ONE is the odd one out.",
    "2. Early levels: it is a PYRAMID among spheres and cubes. Find it by SHAPE.",
    "3. Level 17+: they become striped discs. Nineteen face the SAME way - ONE is rotated. Find it by its EDGES.",
    "4. Level 33+: the stripes also FADE and the angle difference narrows. Hunt the edge, not the shape.",
    "5. POINT at the odd one and pull the TRIGGER. Clicking a decoy counts against you.",
  ],
  controlsHint: "FIND THE ODD ONE - POINT AND PULL THE TRIGGER",
  levels: levels50((i) => {
    const band = SS_BAND(i);
    const ecc = Math.round(lerp50(19, 48, i));
    const label =
      band === "form"
        ? `FORM - 20 items - ${ecc} deg field`
        : band === "orientation"
          ? `ORIENTATION - 20 items - ${ecc} deg field`
          : `CONTRAST ${Math.round(lerp50(70, 8, (i - 32) * (49 / 17)))}% - ${ecc} deg field`;
    return {
      label,
      parameters: {
        searches: SS_TRIALS,
        fieldSize: SS_FIELD,
        band,
        exposureMs: ilerp50(3400, 1500, i),
        gapMs: 700,
        // items shrink as the field widens — the two together are what makes it peripheral
        scale: lerp50(0.062, 0.022, i),
        /**
         * 20 non-overlapping items impose a FLOOR on how central the field can be:
         * a disc of angular radius t needs a field of roughly 4.7t to pack 20 of
         * them, so with large early targets the field simply cannot be tighter than
         * ~16deg without them fusing into a blob. The lever is therefore the TOP of
         * the ladder, not the bottom — pushed to 48deg, which is genuinely
         * peripheral and still well inside the headset's field of view.
         */
        eccDeg: lerp50(19, 48, i),
        /**
         * CONTRAST only becomes a difficulty axis in the top band. In the
         * orientation band it stays high on purpose: we want to isolate ORIENTATION
         * discrimination first, then load contrast on top of it. Moving both at once
         * would leave us unable to say which one the athlete actually failed.
         */
        contrastPct: band === "contrast" ? lerp50(70, 8, (i - 32) * (49 / 17)) : 88,
        /** how far the target's stripes are rotated from the crowd's */
        angleDiff: band === "contrast" ? lerp50(90, 25, (i - 32) * (49 / 17)) : 90,
        cycles: Math.round(lerp50(5, 8, i)),
      },
    };
  }),
  buildTrials: (params, rng) => {
    const p = params as {
      searches: number; fieldSize: number; band: "form" | "orientation" | "contrast";
      exposureMs: number; gapMs: number; scale: number; eccDeg: number;
      contrastPct: number; angleDiff: number; cycles: number;
    };
    const decoyShapes = ["sphere", "box"] as const;
    const SHAPE_COLOR = "#9FA8D6"; // one colour for every shape — never a highlight
    const trials: TrialSpec[] = [];
    let t = 1200;

    // the field radius that the level's eccentricity actually implies
    const maxR = Math.tan((p.eccDeg * Math.PI) / 180) * Math.abs(SS_Z);
    const minSep = p.scale * 2.2 + 0.012;

    for (let s = 0; s < p.searches; s++) {
      const groupId = `sps-g${s}`;
      const targetIdx = Math.floor(rng() * p.fieldSize);

      /**
       * The old version also clamped items to |x| < 0.88 and y in [0.98, 1.88],
       * which silently capped eccentricity at roughly 20 degrees no matter what the
       * level asked for. That clamp is why the drill never felt peripheral: the
       * field was being folded back into the centre behind the designer's back.
       *
       * PACK 20 ITEMS WITHOUT EVER OVERLAPPING THEM.
       *
       * Two bugs lived here, and both produced a visually broken field:
       *
       *   1. r = maxR * sqrt(k/N) only stays inside maxR while k < N — but k is the
       *      ATTEMPT counter. The moment the separation test rejected a candidate and
       *      k ran past 20, the radius grew without bound and flung items clean
       *      outside the intended field. The index now WRAPS.
       *
       *   2. When the spiral starved, the code fell back to placing the remaining
       *      items at RANDOM — with no separation test at all. So the levels where
       *      packing was hardest were exactly the levels that silently produced
       *      overlapping, fused blobs. A fallback that violates the invariant the
       *      main path exists to protect is worse than no fallback.
       *
       * Geometry does not negotiate: 20 discs of diameter d need a field of radius
       * about 2.9d to pack into a flattened ellipse. If the level's eccentricity is
       * tighter than that, the honest answer is to WIDEN THE FIELD, not to overlap
       * the items — so the field grows until they fit, and they never fuse.
       */
      const lattice: [number, number][] = [];
      const GA = Math.PI * (3 - Math.sqrt(5));
      let R = maxR;
      for (let attempt = 0; attempt < 14 && lattice.length < p.fieldSize; attempt++) {
        lattice.length = 0;
        const spin = rng() * Math.PI * 2;
        for (let k = 0; lattice.length < p.fieldSize && k < 600; k++) {
          const idx = k % p.fieldSize;
          const jitter = k < p.fieldSize ? 1 : 1 + (rng() - 0.5) * 0.18;
          const r = Math.min(R, R * Math.sqrt((idx + 0.5) / p.fieldSize) * jitter);
          const a = spin + k * GA;
          const px = Math.cos(a) * r;
          const py = 1.45 + Math.sin(a) * r * 0.72; // the eye scans wider than it scans tall
          /**
           * The vertical clip is a SIGHTLINE bound, not a taste call. Below y ~0.98
           * a target sits more than ~28 degrees under the horizon, which is where the
           * control dock lives — the athlete would be hunting a grating through a
           * menu. The eye scans wider than it scans tall anyway, so the field is
           * flattened rather than truncated, and it loses nothing.
           */
          if (py < 0.98 || py > 2.20) continue;
          if (lattice.every(([qx, qy]) => Math.hypot(px - qx, py - qy) >= minSep)) lattice.push([px, py]);
        }
        if (lattice.length < p.fieldSize) R *= 1.1; // too tight for 20 of these — widen
      }

      for (let k = lattice.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [lattice[k], lattice[j]] = [lattice[j], lattice[k]];
      }

      /**
       * The crowd's orientation is RANDOM on every trial. If the decoys always ran
       * vertical, the athlete would learn "look for the horizontal one" and stop
       * searching altogether — we would be measuring memory, not search.
       */
      const baseAngle = Math.round(rng() * 180);
      const targetAngle = (baseAngle + p.angleDiff) % 180;

      for (let i = 0; i < p.fieldSize; i++) {
        const isTarget = i === targetIdx;
        const pos: [number, number, number] = [lattice[i][0], lattice[i][1], SS_Z];
        const zone: TargetZone =
          Math.abs(lattice[i][0]) < 0.16 ? "center" : lattice[i][0] < 0 ? "left" : "right";

        if (p.band === "form") {
          trials.push({
            id: `${groupId}-${i}`, spawnAt: t, duration: p.exposureMs,
            kind: isTarget ? "go" : "distractor",
            zone, position: pos,
            color: SHAPE_COLOR, emissive: SHAPE_COLOR, // identical fill — no highlight
            shape: isTarget ? "pyramid" : pick(rng, decoyShapes),
            scale: p.scale,
            groupId,
          });
        } else {
          // ORIENTATION / CONTRAST band — grating discs. No form cue, no colour cue.
          // The ONLY thing that separates the target from the crowd is its edges.
          trials.push({
            id: `${groupId}-${i}`, spawnAt: t, duration: p.exposureMs,
            kind: isTarget ? "go" : "distractor",
            zone, position: pos,
            color: "#808080",
            shape: "grating",
            scale: p.scale,
            grating: {
              contrastPct: p.contrastPct,
              cycles: p.cycles,
              angleDeg: isTarget ? targetAngle : baseAngle,
              seed: 300 + s * 31 + i,
            },
            groupId,
          });
        }
      }
      t += p.exposureMs + p.gapMs;
    }
    return trials;
  },
  analyze: (events) => {
    const scored = events.filter((e) => e.trialId.startsWith("sps-") && e.errorType !== "correctRejection");
    if (!scored.length) return [];
    const acc = Math.round((scored.filter((e) => e.correct).length / scored.length) * 1000) / 10;
    const rts = scored.filter((e) => e.correct && e.reactionMs !== undefined).map((e) => e.reactionMs!);
    const avg = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;
    return [
      `${acc}% found across 20 searches of a 20-item field, ${avg}ms mean search time.`,
      "Set size is held at 20 at every level, so search times are directly comparable across the ladder.",
    ];
  },
  durationMs: (params) => {
    const p = params as { searches: number; exposureMs: number; gapMs: number };
    return 1200 + p.searches * (p.exposureMs + p.gapMs) + 1500;
  },
};

// ============================== SCHULTE TABLE ==============================
// Fixate center, use peripheral vision, POINT the controller ray at each
// number and click the trigger in ascending order. Trial-paced (5 grids per
// level) — each grid stays until completed, then the next appears. Grids grow
// 3x3 -> 7x7 across the ladder; boxes shrink and spread wider each level.
/**
 * The grid sat at -1.5 and the HUD panel at -1.75 — so the grid was rendering
 * literally IN FRONT OF the menu, and the athlete was reading numbers through a
 * scoreboard. Pushed 20% back, which also gives the pointer ray a longer, steadier
 * lever arm for the small cells at the top of the ladder.
 */
const SCHULTE_Z = -1.8; // pointer distance — you aim, you don't reach
const SCHULTE_GRIDS = 5;

export const SchulteTable: DrillDefinition = {
  id: "schulte-table",
  name: "Schulte Table",
  shortName: "Schulte Table",
  phase: "Acquire",
  description: "Fixate the grid center, find numbers with peripheral vision, and POINT-and-click them in ascending order. Five grids per level; each grid stays until you finish it. Grids grow 3x3 to 7x7 as levels climb, with smaller, wider-spaced boxes.",
  purpose: "Peripheral localization, visual span, ordered scanning speed.",
  interaction: "ray",
  responseMode: "pointer",
  environment: "arena",
  mvp: true,
  trialPaced: true,
  interTrialCountdown: true,
  instructions: [
    "1. Fixate your gaze on the CENTER of the grid.",
    "2. Use PERIPHERAL vision to locate the numbers - do not scan with your head.",
    "3. POINT your controller at each number and pull the TRIGGER, in ascending order (1, 2, 3...).",
    "4. A wrong-order click counts against you, but the grid keeps going.",
    "5. Finish a grid, take the 3-2-1-GO to recenter, and the next grid appears - 5 grids per level.",
  ],
  controlsHint: "EYES CENTER - POINT + TRIGGER 1..N IN ORDER",
  levels: levels50((i) => {
    const size = i < 14 ? 3 : i < 26 ? 4 : i < 38 ? 5 : i < 46 ? 6 : 7;
    const band = size === 3 ? "Beginner" : size === 4 ? "Intermediate" : size === 5 ? "Advanced" : size === 6 ? "Elite" : "Master";
    // field widens (boxes spread further) and boxes shrink as the level climbs
    return {
      label: `${size}x${size} ${band}`,
      parameters: {
        gridSize: size,
        grids: SCHULTE_GRIDS,
        fieldW: lerp50(0.95, 2.05, i),   // total spread — wider every level
        boxFrac: lerp50(0.34, 0.18, i),  // box size vs cell — shrinks every level (pads render 2.4x wide)
      },
    };
  }),
  buildTrials: (params, rng) => {
    const p = params as { gridSize: number; grids: number; fieldW: number; boxFrac: number };
    const n = p.gridSize * p.gridSize;
    const cellSpacing = p.fieldW / p.gridSize;
    const originX = -((p.gridSize - 1) * cellSpacing) / 2;
    const vSpacing = cellSpacing * 0.9;
    const originY = 1.48 + ((p.gridSize - 1) * vSpacing) / 2;
    const boxScale = Math.max(0.03, cellSpacing * p.boxFrac);
    const trials: TrialSpec[] = [];
    for (let g = 0; g < p.grids; g++) {
      const groupId = `sch-g${g}`;
      const order = Array.from({ length: n }, (_, k) => k);
      for (let k = order.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [order[k], order[j]] = [order[j], order[k]];
      }
      for (let cellIdx = 0; cellIdx < n; cellIdx++) {
        const col = cellIdx % p.gridSize;
        const row = Math.floor(cellIdx / p.gridSize);
        trials.push({
          id: `${groupId}-${cellIdx}`,
          // grid 0 spawns at start; grids 1..4 spawn on completion of the prior
          spawnAt: g === 0 ? 1500 : -1,
          gridSeq: g,
          duration: 120000, // effectively until struck — trial-paced, not timed
          kind: "go",
          zone: "center",
          position: [originX + col * cellSpacing, originY - row * vSpacing, SCHULTE_Z],
          color: GRAY,
          emissive: TEAL,
          shape: "pad",
          scale: boxScale,
          label: String(order[cellIdx] + 1),
          groupId,
          groupMode: "ordered",
          seq: order[cellIdx],
        });
      }
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { gridSize: number; grids: number };
    const n = p.gridSize * p.gridSize;
    return 1500 + p.grids * n * 1600 + 3000; // generous ceiling; trial-paced, ends on completion
  },
};

// =========================== CONTRAST-ASSESSMENT ===========================
// A 'C' (gapped ring) appears at center — strike THROUGH the gap direction.
// Contrast falls as levels rise. ~25 trials.
/**
 * LOW-CONTRAST PICKUP — the contrast-sensitivity TRAINING drill.
 *
 * The old version was broken in four independent ways, and every one of them
 * invalidated the thing it claimed to measure:
 *
 *   1. CONTRAST WAS A COLOUR. It encoded contrast as a hex value on a LIT,
 *      EMISSIVE 3D torus in a dark arena with coloured point lights sweeping over
 *      it. Michelson contrast is defined against a background luminance; there was
 *      no defined background and the stimulus glowed. The ladder was fiction.
 *   2. IT WASN'T A LANDOLT C. The "C" was a torus with 6 radial segments and a
 *      1.7pi sweep — a chunky hexagonal three-quarter donut whose gap was defined
 *      by GEOMETRY, not luminance, and subtended ~54 degrees instead of the
 *      standard 1/5 of the diameter.
 *   3. THE RESPONSE WAS A STRIKE. The athlete had to physically strike THROUGH the
 *      gap. That layers an eye-hand motor act on top of a perception threshold: a
 *      failure could be "I couldn't see it" or "I couldn't hit it", and the drill
 *      could not tell you which. Contrast sensitivity is a PERCEPTION measure. It
 *      must not be gated on the arm.
 *   4. NO STAIRCASE. Contrast was fixed per level, so 25 trials all ran at one
 *      contrast. A fixed-contrast block tells you nothing about a threshold.
 *
 * Rebuilt:
 *   - a real Landolt C (stroke = gap = 1/5 of outer diameter), painted at a stated
 *     Michelson contrast against a uniform mid-grey surround, rendered UNLIT so the
 *     luminance we asked for is the luminance the athlete gets;
 *   - a 4-alternative forced choice on the GAP DIRECTION, answered with a joystick
 *     flick — a pure perceptual judgment with no motor confound;
 *   - an ADAPTIVE STAIRCASE that walks contrast down on correct answers and back up
 *     on errors, so the athlete trains AT their own threshold instead of grinding a
 *     contrast that is either trivially visible or hopeless.
 *
 * This is TRAINING, not measurement. The Assess phase owns the threshold test
 * (assess-contrast-sensitivity, a proper two-phase grating staircase). This drill
 * adds what a threshold test deliberately excludes: time pressure, peripheral
 * placement, and visual clutter — the conditions a low-contrast ball actually
 * appears under.
 */
const LC_DIRS = [
  { dir: "right" as const, deg: 0 },
  { dir: "up" as const, deg: 270 },   // canvas Y is down, so 270deg points up
  { dir: "left" as const, deg: 180 },
  { dir: "down" as const, deg: 90 },
];

export const ContrastAssessment: DrillDefinition = {
  id: "contrast-assessment",
  name: "Low-Contrast Pickup",
  shortName: "Low-Contrast",
  phase: "Acquire",
  description: "A faint Landolt C appears at a controlled contrast against a fixed grey field. Find the GAP and FLICK the joystick that way. The contrast adapts to you — it drops when you are right and lifts when you are wrong, so you train at the edge of what you can actually see.",
  purpose: "Low-contrast target pickup, trained at threshold (4AFC, adaptive).",
  interaction: "touch",
  responseMode: "joystick",
  environment: "arena",
  mvp: true,
  instructions: [
    "1. A faint ring with a GAP appears on a grey panel. It is a letter C, rotated.",
    "2. Find the gap: UP, DOWN, LEFT or RIGHT.",
    "3. FLICK the dominant joystick in the direction of the GAP. Let it recenter between answers.",
    "4. Get it right and the ring gets FAINTER. Get it wrong and it comes back up.",
    "5. Do not guess. Sitting near 70-75% correct means you are exactly where you should be.",
  ],
  controlsHint: "FIND THE GAP - FLICK THE STICK THAT WAY",
  levels: levels50((i) => ({
    label: `start ${Math.round(lerp50(70, 22, i))}% - ${i < 17 ? "central" : i < 34 ? "near periphery" : "periphery + clutter"}`,
    parameters: {
      trials: 30,
      // the staircase STARTS here; where it ends is up to the athlete
      startContrast: lerp50(70, 22, i),
      // the optotype shrinks -> higher spatial frequency, harder at low contrast
      size: lerp50(0.085, 0.038, i),
      showMs: ilerp50(2200, 900, i),
      // level pushes the C out into the periphery, where contrast sensitivity is worse
      eccDeg: lerp50(0, 24, i),
      clutter: i < 34 ? 0 : lerp50(0, 1, i),
    },
  })),
  buildTrials: (params, rng) => {
    const p = params as {
      trials: number; startContrast: number; size: number;
      showMs: number; eccDeg: number; clutter: number;
    };
    const trials: TrialSpec[] = [];
    let t = 1800;

    // optional surround clutter — never overlaps the optotype's own grey field
    const clutterN = Math.round(p.clutter * 14);
    for (let c = 0; c < clutterN; c++) {
      const a = rng() * Math.PI * 2;
      const r = 0.42 + rng() * 0.3;
      trials.push({
        id: `lc-bg${c}`, spawnAt: 1200,
        duration: 1200 + p.trials * (p.showMs + 900) + 3000,
        kind: "distractor", decor: true, zone: "center",
        position: [Math.cos(a) * r, 1.45 + Math.sin(a) * r * 0.7, Z - 0.05],
        color: "#5A5F72", shape: "sphere", scale: 0.02 + rng() * 0.02,
      });
    }

    for (let i = 0; i < p.trials; i++) {
      const g = pick(rng, LC_DIRS);
      // eccentric placement — a random bearing at the level's eccentricity
      const bearing = rng() * Math.PI * 2;
      const ecc = (p.eccDeg * Math.PI) / 180;
      const off = Math.tan(ecc) * Math.abs(Z);
      trials.push({
        id: `ca-${i}`,
        spawnAt: t,
        duration: p.showMs,
        kind: "go",
        zone: "center",
        position: [Math.cos(bearing) * off, 1.45 + Math.sin(bearing) * off, Z],
        requiredDirection: g.dir,
        color: "#808080",
        shape: "landolt",
        scale: p.size,
        landolt: { contrastPct: p.startContrast, gapDeg: g.deg, seed: 100 + i },
        meta: { pointDir: g.dir, startContrast: p.startContrast },
      });
      t += p.showMs + 700 + rng() * 300;
    }
    return trials;
  },

  /**
   * THE STAIRCASE. A 3-down/1-up rule, which converges on ~79% correct — the
   * standard target for a 4AFC task, and almost exactly the Goldilocks band the
   * rest of the suite trains in. Three right in a row and the C gets fainter; one
   * wrong and it comes straight back up. The athlete spends the session at the
   * edge of their own vision instead of grinding a contrast that is either
   * trivially visible or completely hopeless.
   */
  onSpawnAdapt: (spec, snap) => {
    if (!spec.landolt) return;
    const st = lcState;
    // The staircase is module state, so it MUST be re-armed at the start of every
    // run — otherwise the second athlete inherits the first athlete's threshold and
    // starts the session somewhere they have never been.
    if (spec.id === "ca-0") {
      st.contrast = (spec.meta?.startContrast as number) ?? 60;
      st.correctRun = 0;
      st.bracketed = false;
      spec.landolt = { ...spec.landolt, contrastPct: st.contrast };
      return;
    }
    /**
     * TWO-PHASE STAIRCASE.
     *
     * A pure 3-down/1-up rule converges on ~79% correct, which is the right target
     * for a 4AFC task — but it descends slowly, and from a high starting contrast
     * it burns the whole 30-trial run just getting DOWN to the athlete. In testing
     * an athlete whose true threshold was 30% finished the session sitting at 45%:
     * the staircase was still travelling when the drill ended, so they never trained
     * at threshold at all.
     *
     * So the run has two phases, exactly like the stereopsis ladder:
     *
     *   COARSE  before the first error, every correct answer cuts contrast hard
     *           (x0.55). This is a bracketing phase — get into the athlete's
     *           neighbourhood fast, and stop wasting trials on contrasts they can
     *           see without trying.
     *   FINE    after the first error we know roughly where they live. Switch to
     *           3-down/1-up with gentle steps and let it settle.
     */
    if (snap.lastEventCorrect === true) {
      if (!st.bracketed) {
        st.contrast = Math.max(1.2, st.contrast * 0.55);   // COARSE: bracket fast
      } else {
        st.correctRun++;
        if (st.correctRun >= 3) {
          st.contrast = Math.max(1.2, st.contrast * 0.82); // FINE: 3-down
          st.correctRun = 0;
        }
      }
    } else if (snap.lastEventCorrect === false) {
      // the first error ends the bracketing phase — now we know where they are
      st.bracketed = true;
      // The up-step must be the INVERSE of the down-step (1/0.82 = 1.22), or the
      // staircase is asymmetric in log units and drifts. With a 1.35 up against a
      // 0.82 down it kept climbing away from the athlete's threshold.
      st.contrast = Math.min(90, st.contrast * 1.22);      // 1-up
      st.correctRun = 0;
    }
    if (st.contrast <= 0) st.contrast = (spec.meta?.startContrast as number) ?? 60;
    spec.landolt = { ...spec.landolt, contrastPct: st.contrast };
  },

  analyze: (events) => {
    const scored = events.filter((e) => e.trialId.startsWith("ca-") && e.errorType !== "correctRejection");
    if (!scored.length) return [];
    const acc = Math.round((scored.filter((e) => e.correct).length / scored.length) * 1000) / 10;
    const reached = lcState.contrast;
    const logCS = reached > 0 ? Math.log10(100 / reached) : 0;
    return [
      `Trained down to ${reached.toFixed(1)}% contrast (log CS ~ ${logCS.toFixed(2)}) at ${acc}% correct.`,
      "TRAINING drill, adaptive. The Assess phase owns the validated contrast threshold.",
    ];
  },

  durationMs: (params) => {
    const p = params as { trials: number; showMs: number };
    return 1800 + p.trials * (p.showMs + 900) + 1500;
  },
};

/** staircase state — re-armed on trial ca-0 at the start of every run */
const lcState = { contrast: 0, correctRun: 0, bracketed: false };

// ============================ RAPID RECOGNITION ============================
// Match-to-sample under pressure. A central CUE shows the target; options
// fan out around it — POINT and click the one that matches. Lives-based:
// you get 3 hearts, lose one on a miss, and win one back every 3 in a row.
// The run ends when your hearts hit zero. It ramps continuously — more
// options, smaller, faster — and the CONTENT hardens by level: colors ->
// shapes -> harder shapes -> letters -> letters+numbers.
const CONFUSABLES: Record<string, string> = { "0": "O", O: "0", "1": "I", I: "1", "2": "Z", Z: "2", "3": "E", E: "3", "5": "S", S: "5", "6": "G", G: "6", "7": "T", T: "7", "8": "B", B: "8" };
const RR_Z = -1.1; // pointer distance
const RR_COLORS = ["#EF4444", "#F97316", "#F5B648", "#22C55E", "#2998AA", "#3B82F6", "#8B5CF6", "#EC4899", "#7FD3DE", "#C4B5FD"];
const RR_SHAPES = ["sphere", "box", "pyramid"] as const;
const RR_HARD_SHAPES = ["box", "pyramid", "diamond", "cone", "ring"] as const;
const RR_LETTERS = "BCDEGIOSTZ".split("");
const RR_ALNUM = Object.keys(CONFUSABLES);

type RRBand = "colors" | "shapes" | "hardshapes" | "letters" | "alnum";
const rrBand = (i: number): RRBand =>
  i < 10 ? "colors" : i < 20 ? "shapes" : i < 30 ? "hardshapes" : i < 40 ? "letters" : "alnum";

interface RRState { lives: number; done: boolean; lastMilestone: number }
const rrState: RRState = { lives: 3, done: false, lastMilestone: 0 };
const RR_MAX_LIVES = 5;

// build one option's visual for a given band; `variant` picks distinct content
function rrOption(band: RRBand, variant: string, scale: number, pos: [number, number, number], id: string, groupId: string, spawnAt: number, duration: number, kind: "go" | "distractor"): TrialSpec {
  if (band === "colors") {
    return { id, spawnAt, duration, kind, groupId, zone: "center", position: pos, color: variant, emissive: variant, shape: "sphere", scale };
  }
  if (band === "shapes" || band === "hardshapes") {
    return { id, spawnAt, duration, kind, groupId, zone: "center", position: pos, color: "#9FA8D6", emissive: "#9FA8D6", shape: variant as never, scale };
  }
  // letters / alnum: a rounded pad with the character
  return { id, spawnAt, duration, kind, groupId, zone: "center", position: pos, color: GRAY, emissive: TEAL, shape: "pad", scale, label: variant };
}

export const RapidRecognition: DrillDefinition = {
  id: "rapid-recognition",
  name: "Rapid Recognition",
  shortName: "Rapid Recognition",
  phase: "Acquire",
  description: "Match-to-sample under pressure. A central cue shows the target - POINT and click the matching option around it. 3 hearts: lose one on a miss, earn one back every 3 correct in a row; the run ends at zero hearts. Ramps continuously and the content hardens by level: colors -> shapes -> harder shapes -> letters -> letters+numbers.",
  purpose: "Rapid recognition and match-to-sample under load (lives-based endurance).",
  interaction: "ray",
  responseMode: "pointer",
  environment: "arena",
  mvp: true,
  trialPaced: true,
  instructions: [
    "1. A CUE appears at center - a color, shape, or character to find.",
    "2. Options fan out around it. POINT your controller at the MATCH and pull the TRIGGER.",
    "3. You have 3 HEARTS. A wrong pick or a miss costs a heart.",
    "4. Get 3 correct IN A ROW to win a heart back (up to 5).",
    "5. It speeds up and adds options as you go. The run ends when your hearts hit zero.",
  ],
  controlsHint: "POINT + TRIGGER THE MATCH - DON'T LOSE ALL 3 HEARTS",
  levels: levels50((i) => {
    const band = rrBand(i);
    const within = i % 10; // position inside the band (0..9)
    return {
      label: `${band === "alnum" ? "letters+numbers" : band} — starts ${3 + Math.floor(within / 3)} options`,
      parameters: { band, baseOptions: 3 + Math.floor(within / 3), startSpeed: within },
    };
  }),
  buildTrials: (params, rng) => {
    const p = params as { band: RRBand; baseOptions: number; startSpeed: number };
    rrState.lives = 3;
    rrState.done = false;
    rrState.lastMilestone = 0;
    const pool: string[] =
      p.band === "colors" ? RR_COLORS
      : p.band === "shapes" ? [...RR_SHAPES]
      : p.band === "hardshapes" ? [...RR_HARD_SHAPES]
      : p.band === "letters" ? RR_LETTERS
      : RR_ALNUM;
    const trials: TrialSpec[] = [];
    let t = 1500;
    const ROUNDS = 60;
    for (let r = 0; r < ROUNDS; r++) {
      const groupId = `rr-g${r}`;
      // continuous ramp: more options, smaller, faster
      const count = Math.min(7, p.baseOptions + Math.floor((p.startSpeed + r) / 5));
      const scale = Math.max(0.026, 0.05 - r * 0.0009);
      const cueDelay = Math.max(300, 850 - (p.startSpeed * 15 + r * 22));
      const answerMs = Math.max(1100, 2200 - (p.startSpeed * 20 + r * 28));
      // choose the match + distinct distractors
      const shuffled = [...pool].sort(() => rng() - 0.5);
      const match = shuffled[0];
      const distractors = shuffled.slice(1, count);
      // for alnum, prefer confusable distractors so it's genuinely hard
      const optionVals = [match, ...distractors];
      for (let k = optionVals.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [optionVals[k], optionVals[j]] = [optionVals[j], optionVals[k]]; }
      // lives/hearts marker (drives the lives logic + shows hearts)
      trials.push({
        id: `${groupId}-lives`, spawnAt: t, duration: cueDelay + answerMs, kind: "distractor",
        zone: "center", position: [0, 1.92, RR_Z], color: TEAL, emissive: TEAL, shape: "diamond", scale: 0.001,
        label: "HEARTS 3", meta: { decor: true, rrLivesFirst: true, labelInside: true, labelSize: 0.05, labelColor: "#EC4899" },
      });
      // central cue
      const cueScale = p.band === "colors" ? 0.05 : 0.045;
      trials.push(
        p.band === "colors"
          ? { id: `${groupId}-cue`, spawnAt: t, duration: cueDelay + answerMs, kind: "distractor", decor: true, zone: "center", position: [0, 1.5, RR_Z], color: match, emissive: match, shape: "sphere", scale: cueScale }
          : p.band === "shapes" || p.band === "hardshapes"
            ? { id: `${groupId}-cue`, spawnAt: t, duration: cueDelay + answerMs, kind: "distractor", decor: true, zone: "center", position: [0, 1.5, RR_Z], color: "#EAF0FF", emissive: "#EAF0FF", shape: match as never, scale: cueScale }
            : { id: `${groupId}-cue`, spawnAt: t, duration: cueDelay + answerMs, kind: "distractor", decor: true, zone: "center", position: [0, 1.5, RR_Z], color: GRAY, emissive: WHITE, shape: "pad", scale: 0.05, label: match },
      );
      // options fan out on a ring, appearing after the cue delay
      const radius = 0.34 + count * 0.02;
      for (let o = 0; o < optionVals.length; o++) {
        const ang = (o / optionVals.length) * Math.PI * 2 + Math.PI / 2 + rng() * 0.2;
        const pos: [number, number, number] = [Math.cos(ang) * radius * 1.25, 1.42 + Math.sin(ang) * radius, RR_Z];
        const val = optionVals[o];
        const isMatch = val === match;
        trials.push({ ...rrOption(p.band, val, scale, pos, `${groupId}-o${o}`, groupId, t + cueDelay, answerMs, isMatch ? "go" : "distractor") });
      }
      t += cueDelay + answerMs + 500;
    }
    return trials;
  },
  onSpawnAdapt: (spec, snapshot, api) => {
    if (!spec.meta?.rrLivesFirst) return;
    if (rrState.done) { api.finishEarly(); spec.meta = { ...spec.meta, decor: true }; spec.duration = 10; return; }
    // fold in the previous round's outcome
    if (snapshot.hits + snapshot.errors > 0 && snapshot.lastEventCorrect !== undefined) {
      if (!snapshot.lastEventCorrect) {
        rrState.lives -= 1;
        rrState.lastMilestone = 0;
      } else if (snapshot.streak > 0 && snapshot.streak % 3 === 0 && snapshot.streak !== rrState.lastMilestone) {
        rrState.lives = Math.min(RR_MAX_LIVES, rrState.lives + 1);
        rrState.lastMilestone = snapshot.streak;
      }
    }
    if (rrState.lives <= 0) { rrState.done = true; api.finishEarly(); spec.meta = { ...spec.meta, decor: true }; spec.duration = 10; return; }
    spec.label = `${"\u2665 ".repeat(rrState.lives).trim()}`;
  },
  analyze: (events) => {
    const scored = events.filter((e) => e.errorType !== "correctRejection" && (e.correct || e.errorType));
    const correct = scored.filter((e) => e.correct).length;
    return [
      `Rapid Recognition: survived ${correct} correct match(es) before running out of hearts.`,
      "Lives-based endurance — content and speed ramp continuously within the run.",
    ];
  },
  durationMs: () => 300000, // generous ceiling; the run ends on hearts = 0
};
