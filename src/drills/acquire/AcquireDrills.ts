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
const SEARCH_OPEN_MS = 900_000;  // "until found" — see openSearch
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
  /**
   * NO TIME LIMIT, and a wrong click does not bail you out.
   *
   * The field stays up until the athlete FINDS the target. A search deadline would censor
   * precisely the searches that carry the information — the hard ones — and overwrite a real
   * search time with the deadline value, which measures nothing but the deadline. And when a
   * decoy click used to clear the field and advance, an athlete losing a search could simply
   * click their way out of it. Now the decoy stays, the error is logged, and the hunt goes on.
   */
  openSearch: true,
  trialPaced: true,
  /**
   * The rotating fixation marker is REMOVED here. It is a spinning object in the middle of a
   * field the athlete is supposed to be scanning — a permanent, moving distractor sitting in
   * the highest-acuity part of the retina, competing with the exact process being measured.
   * Fixation is not the task in a search drill; searching is.
   */
  noFixationMarker: true,
  instructions: [
    "1. TWENTY items appear across your field. Exactly ONE is the odd one out.",
    "2. Early levels: it is a PYRAMID among spheres and cubes. Find it by SHAPE.",
    "3. Level 17+: they become striped discs. Nineteen face the SAME way - ONE is rotated. Find it by its EDGES.",
    "4. Level 33+: the stripes also FADE and the angle difference narrows. Hunt the edge, not the shape.",
    "5. POINT at the odd one and pull the TRIGGER. Clicking a decoy counts against you.",
    "6. There is NO time limit. The field stays until you find it. Keep hunting.",
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
            id: `${groupId}-${i}`, spawnAt: t, duration: SEARCH_OPEN_MS,
            gridSeq: s,
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
            id: `${groupId}-${i}`, spawnAt: t, duration: SEARCH_OPEN_MS,
            gridSeq: s,
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
      // Searches are COMPLETION-paced now, not clock-paced: search s+1 is spawned by the
      // engine when search s is solved. spawnAt only matters for the first one.
      t += p.gapMs;
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
      "No search was cut short by a deadline, so every one of these times is a real search time — including the slow ones, which are the informative ones.",
    ];
  },
  // Completion-paced. This is a generous ceiling, not a schedule.
  durationMs: () => 900_000,
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
 * A.R.E.S. VISIBILITY — target pickup across hostile visual environments.
 *
 * The question this drill answers is not "what is your contrast threshold". It is the
 * question an athlete actually cares about: WHERE DO YOU LOSE THE BALL?
 *
 * Contrast is a RELATIONSHIP between a target and the field it sits in — so the field
 * is the independent variable, and it changes. Six environments, each a real one:
 *
 *   BRIGHT SKY    light field, DARK target.  A ball against an overcast sky.
 *   FLOODLIT      dark field, LIGHT target.  A white ball under stadium lights.
 *   FLAT DUSK     dark field, DARK target.   Low light, dark ball. The killer.
 *   WASHOUT       very bright field, light target. Everything blown out.
 *   GLARE         mid field + a bright source beside the target.
 *   CLUTTER       mottled field. A ball against a packed stand.
 *
 * THE SIGN OF THE CONTRAST MATTERS, and this is the part a single "contrast score"
 * throws away. A dark target on a bright field and a light target on a dark field are
 * different visual problems, solved by different retinal pathways (OFF and ON centre),
 * and most people are measurably better at one of them. An athlete who is fine against
 * the sky and blind at dusk has a specific, trainable, coachable deficit — and a single
 * number would have told you nothing about it.
 *
 * GLARE is modelled honestly. A glare source does not simply sit next to the target: it
 * scatters inside the eye and raises a VEILING LUMINANCE across the whole retina, which
 * lifts the effective background and crushes the target's contrast without changing one
 * pixel of the target. That is exactly what a low sun does to an outfielder, and it is
 * why an athlete can score perfectly on a wall chart and still lose the ball in the air.
 *
 * Each environment carries its OWN independent staircase, so the drill returns six
 * thresholds, not one — a visibility PROFILE. The task is a 4AFC Landolt gap answered
 * with a joystick flick: pure perception, no motor confound, guessing controlled at 25%.
 */
type VisCondition = {
  id: string;
  label: string;
  bg: number;              // background luminance, 0-255
  sign: 1 | -1;            // +1 = target LIGHTER than field, -1 = DARKER
  glare: number;
  mottle: number;
};

const VIS_CONDITIONS: VisCondition[] = [
  { id: "sky",      label: "Bright Sky",  bg: 205, sign: -1, glare: 0,    mottle: 0 },
  { id: "floodlit", label: "Floodlit",    bg: 38,  sign: +1, glare: 0,    mottle: 0 },
  { id: "dusk",     label: "Flat Dusk",   bg: 52,  sign: -1, glare: 0,    mottle: 0 },
  /**
   * WASHOUT was originally a bright field with a BRIGHTER target — which is physically
   * almost impossible: there is no headroom above white, so the contrast capped at 9%
   * and the staircase could not move at all. A real washout is not a brighter ball; it
   * is a blown-out field in which the ball becomes a faint dark SILHOUETTE. Sign flipped.
   */
  { id: "washout",  label: "Washout",     bg: 232, sign: -1, glare: 0.25, mottle: 0 },
  { id: "glare",    label: "Glare",       bg: 150, sign: -1, glare: 0.85, mottle: 0 },
  { id: "clutter",  label: "Clutter",     bg: 120, sign: -1, glare: 0,    mottle: 0.9 },
];

const VIS_DIRS = [
  { dir: "right" as const, deg: 0 },
  { dir: "up" as const, deg: 270 },   // canvas Y runs down, so 270deg points up
  { dir: "left" as const, deg: 180 },
  { dir: "down" as const, deg: 90 },
];

/**
 * WEBER CONTRAST, which is the right measure for a target on a uniform field:
 *   C = |Lt - Lb| / Lb
 * Given a background and a signed contrast, this returns the target luminance. It is
 * clamped into the displayable range, and the drill never asks for a contrast the panel
 * cannot actually render — an unrenderable stimulus is an invisible one, and we would
 * be recording a threshold that was really a hardware limit.
 */
function targetLuminance(bg: number, contrast: number, sign: 1 | -1): number {
  return Math.max(2, Math.min(253, bg + sign * contrast * bg));
}
/** the highest contrast this background can actually display, in the given direction */
function maxRenderable(bg: number, sign: 1 | -1): number {
  return sign > 0 ? (253 - bg) / bg : (bg - 2) / bg;
}

export const ContrastAssessment: DrillDefinition = {
  id: "contrast-assessment",
  name: "Visibility",
  shortName: "Visibility",
  phase: "Acquire",
  environment: "visibility",
  description: "The whole world becomes the test. Six environments — bright sky, floodlit night, flat dusk, washout, glare, clutter — each with its own adaptive staircase. Find the gap in the ring and flick the stick. You get six thresholds, not one: a map of exactly where you lose the ball.",
  purpose: "Target pickup across hostile visual environments (6 independent staircases, 4AFC).",
  interaction: "touch",
  responseMode: "joystick",
  mvp: true,
  instructions: [
    "1. The ENVIRONMENT changes: bright sky, floodlit dark, flat dusk, washout, glare, clutter.",
    "2. In each one, a ring with a GAP appears. Sometimes it is DARKER than the field, sometimes LIGHTER.",
    "3. Find the gap - UP, DOWN, LEFT or RIGHT - and FLICK the dominant joystick that way.",
    "4. Each environment gets HARDER on its own as you get it right, and easier when you miss.",
    "5. Do not guess. You will finish with six separate thresholds - a map of where you lose the ball.",
  ],
  controlsHint: "FIND THE GAP - FLICK THE STICK THAT WAY",
  levels: levels50((i) => ({
    label: `${Math.round(lerp50(0.70, 0.10, i) * 100)}% start - ${i < 17 ? "central" : i < 34 ? "near periphery" : "periphery + speed"}`,
    parameters: {
      trials: 54,                                  // 9 per environment — enough for six staircases to settle
      startContrast: lerp50(0.70, 0.10, i),        // Weber, where each staircase begins
      size: lerp50(0.10, 0.042, i),
      showMs: ilerp50(2400, 900, i),               // pickup SPEED is part of the skill
      eccDeg: lerp50(0, 22, i),
    },
  })),
  buildTrials: (params, rng) => {
    const p = params as {
      trials: number; startContrast: number; size: number; showMs: number; eccDeg: number;
    };
    const trials: TrialSpec[] = [];
    let t = 2000;

    /**
     * Environments are INTERLEAVED, never blocked. If we ran six bright-sky trials in a
     * row the athlete's eyes would light-adapt to the sky and we would be measuring
     * adaptation, not visibility. Shuffled interleaving keeps every environment a fresh
     * demand — and it is also the honest sport case, where the light changes on you.
     */
    const order: VisCondition[] = [];
    const per = Math.ceil(p.trials / VIS_CONDITIONS.length);
    for (let k = 0; k < per; k++) order.push(...VIS_CONDITIONS);
    for (let k = order.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [order[k], order[j]] = [order[j], order[k]];
    }

    for (let i = 0; i < p.trials; i++) {
      const cond = order[i];
      const g = pick(rng, VIS_DIRS);
      const bearing = rng() * Math.PI * 2;
      const off = Math.tan((p.eccDeg * Math.PI) / 180) * Math.abs(Z);
      const c0 = Math.min(p.startContrast, maxRenderable(cond.bg, cond.sign));

      trials.push({
        id: `ca-${i}`,
        spawnAt: t,
        duration: p.showMs,
        kind: "go",
        zone: "center",
        position: [Math.cos(bearing) * off, 1.45 + Math.sin(bearing) * off * 0.8, Z],
        requiredDirection: g.dir,
        color: "#808080",
        shape: "landolt",
        scale: p.size,
        landolt: { gapDeg: g.deg, seed: 100 + i },
        luminance: {
          bg: cond.bg,
          target: targetLuminance(cond.bg, c0, cond.sign),
          glare: cond.glare,
          mottle: cond.mottle,
          condition: cond.label,
        },
        meta: { pointDir: g.dir, cond: cond.id, startContrast: c0 },
      });
      // a beat of the new field BEFORE the target lands — the eye needs a moment to
      // settle into a changed environment, and not giving it one measures adaptation
      t += p.showMs + 600 + rng() * 250;
    }
    return trials;
  },

  /**
   * SIX INDEPENDENT STAIRCASES, one per environment.
   *
   * A single staircase across mixed environments would converge on a meaningless
   * average — the athlete's sky threshold dragging their dusk threshold around and
   * vice versa. Each environment therefore walks its own two-phase ladder (coarse
   * bracketing until the first error, then 3-down/1-up with log-symmetric steps),
   * and the drill returns a PROFILE.
   */
  onSpawnAdapt: (spec, snap) => {
    if (!spec.luminance || !spec.meta) return;
    const cid = spec.meta.cond as string;
    const cond = VIS_CONDITIONS.find((c) => c.id === cid)!;

    // re-arm every ladder at the top of a run — otherwise athlete #2 inherits
    // athlete #1's thresholds and starts somewhere they have never been
    if (spec.id === "ca-0") {
      for (const c of VIS_CONDITIONS) {
        visState[c.id] = {
          contrast: Math.min(spec.meta.startContrast as number, maxRenderable(c.bg, c.sign)),
          run: 0,
          bracketed: false,
        };
      }
    }
    const st = visState[cid] ?? (visState[cid] = {
      contrast: spec.meta.startContrast as number, run: 0, bracketed: false,
    });

    // the LAST result belongs to whichever environment was on screen last — so only
    // step the ladder that actually produced it
    if (lastCond && snap.lastEventCorrect !== undefined) {
      const ls = visState[lastCond];
      if (ls) {
        if (snap.lastEventCorrect) {
          if (!ls.bracketed) ls.contrast *= 0.55;          // COARSE: bracket fast
          else if (++ls.run >= 3) { ls.contrast *= 0.82; ls.run = 0; }  // FINE: 3-down
        } else {
          ls.bracketed = true;
          ls.contrast *= 1.22;                            // 1-up (log-symmetric)
          ls.run = 0;
        }
        ls.contrast = Math.max(0.012, Math.min(maxRenderable(
          VIS_CONDITIONS.find((c) => c.id === lastCond)!.bg,
          VIS_CONDITIONS.find((c) => c.id === lastCond)!.sign,
        ), ls.contrast));
      }
    }
    lastCond = cid;

    spec.luminance = {
      ...spec.luminance,
      target: targetLuminance(cond.bg, st.contrast, cond.sign),
    };
    spec.meta = { ...spec.meta, appliedContrast: st.contrast };
  },

  analyze: (events) => {
    const scored = events.filter((e) => e.trialId.startsWith("ca-") && e.errorType !== "correctRejection");
    if (!scored.length) return [];
    const acc = Math.round((scored.filter((e) => e.correct).length / scored.length) * 1000) / 10;

    // the PROFILE — this is the whole point of the drill
    const rows = VIS_CONDITIONS.map((c) => {
      const st = visState[c.id];
      const thr = st ? st.contrast : 0;
      return `${c.label}: ${(thr * 100).toFixed(1)}%`;
    });

    // where do they actually lose the ball?
    const ranked = VIS_CONDITIONS
      .map((c) => ({ c, thr: visState[c.id]?.contrast ?? 9 }))
      .sort((a, b) => b.thr - a.thr);
    const worst = ranked[0];
    const best = ranked[ranked.length - 1];

    return [
      `Visibility profile (Weber threshold, lower is better) — ${rows.join("  |  ")}`,
      `Strongest: ${best.c.label}. Weakest: ${worst.c.label} — ${(worst.thr / Math.max(0.01, best.thr)).toFixed(1)}x the contrast needed.`,
      `${acc}% correct across ${scored.length} forced-choice trials.`,
      "TRAINING drill, adaptive. The Assess phase owns the validated contrast threshold.",
    ];
  },

  durationMs: (params) => {
    const p = params as { trials: number; showMs: number };
    return 2000 + p.trials * (p.showMs + 850) + 1500;
  },
};

/** per-environment staircase state — re-armed on trial ca-0 at the start of every run */
const visState: Record<string, { contrast: number; run: number; bracketed: boolean }> = {};
let lastCond: string | null = null;

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

/* RapidRecognition retired — replaced by the full 150-level lattice port in acquire/RapidRecognitionVR.ts */

