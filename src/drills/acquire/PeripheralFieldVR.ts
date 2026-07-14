import type { DrillDefinition, TrialSpec, SliceDirection, TargetZone } from "@/ares/drillTypes";
import { strikePosition } from "../shared/zones";
import { levels50, lerp50, ilerp50 } from "../shared/levels";

/**
 * PERIPHERAL FIELD — a divided-attention field map.
 *
 * The old version asked the athlete to STRIKE peripheral targets with a controller.
 * That is self-defeating, and it is why the targets had crept large and central: to
 * hit a thing you must reach for it, to reach for it you must locate it in depth, and
 * to do that you LOOK AT IT. The drill was quietly training the athlete to break
 * fixation — which is precisely the behaviour it exists to suppress. And nothing about
 * a strike measures peripheral vision; it measures the arm.
 *
 * THE FIX IS THE PARADIGM, NOT THE TARGETS.
 *
 * This is now a dual-task field map, built on the same logic as the validated
 * useful-field-of-view protocol:
 *
 *   1. ENCODE + FLASH, SIMULTANEOUSLY. A symbol appears at fixation AND a target
 *      appears out in the periphery, at the same instant, for a very short time.
 *   2. MASK. Both are immediately overwritten, so iconic memory and afterimages
 *      cannot be used to "read" the display after it is gone.
 *   3. WHERE? Flick the stick toward where the peripheral target appeared — eight
 *      directions, so up-left is a real answer and not a rounding error.
 *   4. WHAT? Now report the central symbol you were holding.
 *
 * SIMULTANEITY IS THE WHOLE MECHANISM. A saccade takes ~200 ms to plan and land. When
 * the flash is 90 ms the athlete CANNOT look at the peripheral target — there is no
 * time. The only way to get both answers right is to hold central fixation and see the
 * periphery WITHOUT looking at it. That is the skill, and this is the only honest way
 * to force it. The central memory load is what makes cheating pointless: an athlete
 * who saccades away loses the symbol, and the trial is scored as a failure of the task
 * they abandoned, not the one they chased.
 *
 * The drill then pushes outward — how far can you see, in which direction — and the
 * per-direction hit rates become a FIELD MAP, not a single score. Most athletes are
 * measurably worse in one quadrant, and that quadrant is usually the one their sport
 * punishes.
 */

const TEAL = "#2998AA";
const WHITE = "#EAF0FF";
const DIM = "#3A3F55";
const Z = -1.3;
const DEG = Math.PI / 180;

/** The eight directions. Diagonals are real answers, not rounding errors. */
const OCTANTS: { dir: SliceDirection; ang: number }[] = [
  { dir: "right",     ang: 0 },
  { dir: "upRight",   ang: 45 },
  { dir: "up",        ang: 90 },
  { dir: "upLeft",    ang: 135 },
  { dir: "left",      ang: 180 },
  { dir: "downLeft",  ang: 225 },
  { dir: "down",      ang: 270 },
  { dir: "downRight", ang: 315 },
];

/**
 * THE CENTRAL TASK IS A DIRECTIONAL ARROW, RECALLED BY FLICKING ITS DIRECTION.
 *
 * The old central task showed four shapes at four SHUFFLED slots and asked the athlete to
 * flick toward the slot holding the shape they saw. That is three tasks welded together —
 * recall the shape, visually SEARCH four options for it, then MAP its position to a stick
 * direction — under a sub-second clock. It read as "not functional" because it never was a
 * clean response: a flick toward the remembered shape (rather than its shuffled slot) failed,
 * and there was no learnable mapping to lean on.
 *
 * Now the central symbol is an ARROW. Recalling it is flicking the direction it pointed —
 * a 1:1 memory-to-motor map with no search and no shuffle. The symbol IS its own answer.
 * Orientation memory at fixation is a real, cleanly-measured skill, and it reuses the exact
 * flick vocabulary of the WHERE question, so the athlete learns one control, not two. Four
 * cardinal directions keep guessing pinned at 25%.
 */
const CENTRAL_DIRS: SliceDirection[] = ["up", "right", "down", "left"];

interface PFParams {
  trials: number;
  eccDeg: number;
  /** the fixation beat BEFORE the flash — the athlete parks their eyes and knows it is coming */
  readyMs: number;
  flashMs: number;
  maskMs: number;
  span: number;          // how many central symbols must be held
  distractors: number;   // peripheral clutter the target hides among
  contrast: number;      // 0..1 — how bright the peripheral target is
  responseMs: number;
  settleMs: number;      // a blank "prepare to answer" beat after the mask (no jump-cut)
  interTrialMs: number;  // the breath between whole trials
}

/** Peripheral position: an eccentricity and a bearing, in the athlete's field. */
function periphPos(eccDeg: number, angDeg: number): [number, number, number] {
  const off = Math.tan(eccDeg * DEG) * Math.abs(Z);
  // vertical is compressed: the human field is genuinely wider than it is tall, and
  // asking for 42deg straight up would be asking for a head tilt, not peripheral vision
  return [Math.cos(angDeg * DEG) * off, 1.45 + Math.sin(angDeg * DEG) * off * 0.72, Z];
}

function dim(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function buildDualTaskTrials(p: PFParams, rng: () => number, idp = "pf"): TrialSpec[] {
  const trials: TrialSpec[] = [];
  let t = 1600;

  for (let i = 0; i < p.trials; i++) {
    const gid = `${idp}-g${i}`;

    /**
     * THE READY BEAT.
     *
     * The flash HAS to be short — shorter than a saccade — or the drill measures nothing.
     * But a 180ms flash with no warning is an ambush, not a test: the athlete spends the
     * trial reacting to the fact that a trial happened. The scientific constraint is on
     * the FLASH, not on the pacing around it.
     *
     * So a fixation dot appears first and holds for readyMs. The athlete parks their eyes,
     * knows exactly when the flash is coming, and the only thing being measured is what
     * they could see when it did. This is the difference between "hard" and "unfair" — and
     * it is why level 1 felt fast even though its flash was already the gentlest it can be.
     */
    trials.push({
      id: `${gid}-fix`, spawnAt: t, duration: p.readyMs,
      kind: "distractor", decor: true, zone: "center",
      position: [0, 1.45, Z],
      color: TEAL, emissive: TEAL, shape: "ring", scale: 0.016,
    });
    t += p.readyMs;
    const oct = OCTANTS[Math.floor(rng() * OCTANTS.length)];
    // jitter the eccentricity a little so the athlete cannot learn one fixed ring
    const ecc = p.eccDeg * (0.85 + rng() * 0.3);
    const pos = periphPos(ecc, oct.ang + (rng() - 0.5) * 14);

    // the central arrows to be held (span 1..3) — a direction to recall in order
    const held: SliceDirection[] = [];
    for (let k = 0; k < p.span; k++) {
      let dir = CENTRAL_DIRS[Math.floor(rng() * CENTRAL_DIRS.length)];
      let guard = 0;
      // no two identical arrows in a row, so a multi-arrow hold is a real sequence
      while (k > 0 && held[k - 1] === dir && guard++ < 8) dir = CENTRAL_DIRS[Math.floor(rng() * CENTRAL_DIRS.length)];
      held.push(dir);
    }

    // ---------- 1. ENCODE + FLASH, at the same instant
    const flashAt = t;
    // more air between successive arrows in a multi-arrow hold, so a span-2/3 sequence is
    // encodable rather than a blur
    const perSym = p.flashMs + (p.span > 1 ? 240 : 90);
    for (let k = 0; k < p.span; k++) {
      trials.push({
        id: `${gid}-c${k}`, spawnAt: flashAt + k * perSym, duration: p.flashMs,
        kind: "distractor", decor: true, zone: "center",
        position: [0, 1.45, Z],
        color: WHITE, emissive: WHITE, shape: "arrow", scale: 0.06,
        meta: { pointDir: held[k] },
      });
    }
    const encodeEnd = flashAt + p.span * perSym;

    // the peripheral target — brief, and simultaneous with the FIRST central symbol.
    // It is decor: it can never be struck. It exists only to be SEEN.
    trials.push({
      id: `${gid}-p`, spawnAt: flashAt, duration: p.flashMs,
      kind: "distractor", decor: true,
      zone: pos[0] < -0.05 ? "left" : pos[0] > 0.05 ? "right" : "center",
      position: pos,
      color: dim(TEAL, p.contrast), emissive: dim(TEAL, p.contrast),
      shape: "sphere", scale: 0.06,
    });

    // peripheral clutter — the target must be FOUND, not merely detected
    for (let k = 0; k < p.distractors; k++) {
      const o = OCTANTS[Math.floor(rng() * OCTANTS.length)];
      const e = p.eccDeg * (0.5 + rng() * 0.6);
      trials.push({
        id: `${gid}-d${k}`, spawnAt: flashAt, duration: p.flashMs,
        kind: "distractor", decor: true, zone: "center",
        position: periphPos(e, o.ang + (rng() - 0.5) * 30),
        color: dim(DIM, p.contrast), emissive: dim(DIM, p.contrast),
        shape: "box", scale: 0.055,
      });
    }

    // ---------- 2. MASK — kill iconic memory. Without this the athlete can simply
    // read the afterimage after the display is gone, and the flash duration means nothing.
    for (const o of OCTANTS) {
      trials.push({
        id: `${gid}-m${o.dir}`, spawnAt: encodeEnd, duration: p.maskMs,
        kind: "distractor", decor: true, zone: "center",
        position: periphPos(p.eccDeg * 0.95, o.ang),
        color: "#5A5F72", emissive: "#5A5F72", shape: "box", scale: 0.05,
      });
    }
    trials.push({
      id: `${gid}-mc`, spawnAt: encodeEnd, duration: p.maskMs,
      kind: "distractor", decor: true, zone: "center",
      position: [0, 1.45, Z], color: "#5A5F72", emissive: "#5A5F72", shape: "box", scale: 0.06,
    });

    // a blank beat so the mask -> prompt hand-off is a breath, not a jump-cut. This, more
    // than the flash, is what made the drill feel "fast": nothing said "now answer".
    const respAt = encodeEnd + p.maskMs + p.settleMs;

    /**
     * ---------- 3. WHERE? (seq 0)
     *
     * The response target sits at the CENTRE, not where the peripheral flash was. If it
     * rendered at the answer's location it would simply hand the athlete the answer —
     * they would flick at a thing they can see rather than recall a thing they saw.
     */
    // WHERE and WHAT are NOT grouped. Only one question is ever live at a time (they are
    // separated in time), and grouping them under one groupId collapsed BOTH of their events
    // onto that group id — which is exactly why the per-direction field map, filtered by
    // "-where"/"-what", came back empty. Ungrouped, each records under its own id, the map
    // fills, and the earliest-live-go resolver still serves them one at a time.
    trials.push({
      id: `${gid}-where`, spawnAt: respAt, duration: p.responseMs,
      kind: "go", zone: "center",
      position: [0, 1.45, Z],
      requiredDirection: oct.dir,
      // COMPLETION-PACED. WHERE heads a chain; each WHAT spawns ~300ms after the previous
      // answer resolves, not on a fixed clock. The old fixed schedule left the athlete
      // staring at nothing for the full response window AFTER they had already flicked WHERE
      // — which is a large part of why the drill "wasn't good enough". Now it advances the
      // instant you answer.
      chainId: `${gid}-resp`, seq: 0,
      color: TEAL, emissive: TEAL, shape: "ring", scale: 0.05,
      label: "WHERE WAS IT?",
      // WHERE: eight real answers, diagonals included. No pointDir — the prompt must never
      // hint the direction; the athlete recalls where they SAW it.
      meta: { axes: 8, octant: oct.dir, eccDeg: ecc },
    });

    // ---------- 4. WHICH WAY? (seq 1..span) — recall each held ARROW by flicking its direction.
    //
    // No options, no search, no shuffle: the arrow you held pointed a direction, so you flick
    // that direction. One learnable memory-to-motor map. A faint ring sits behind the prompt so
    // the CONTROL is obvious even though the ANSWER is from memory.
    for (let k = 0; k < p.span; k++) {
      trials.push({
        id: `${gid}-what${k}`, spawnAt: -1, duration: p.responseMs,
        kind: "go", zone: "center",
        position: [0, 1.45, Z],
        requiredDirection: held[k],
        chainId: `${gid}-resp`, seq: 1 + k, chainGapMs: 300,
        color: WHITE, emissive: WHITE, shape: "ring", scale: 0.045,
        label: p.span > 1 ? `WHICH WAY DID ARROW ${k + 1} POINT?` : "WHICH WAY DID THE ARROW POINT?",
        // four cardinal answers — a diagonal is not one, so a flick must never be READ as one
        meta: { axes: 4, central: true, prompt: true },
      });
    }

    // a real breath between trials. This is a worst-case budget (every response times out);
    // when the athlete answers promptly the extra time simply becomes rest before the next
    // fixation, never a mid-answer interruption.
    t = respAt + (p.responseMs + 300) * (1 + p.span) + p.interTrialMs;
  }
  return trials;
}

const BAND = (i: number) => (i < 12 ? 0 : i < 26 ? 1 : i < 38 ? 2 : 3);

export const PeripheralFieldVR: DrillDefinition = {
  id: "peripheral-field-vr",
  name: "Peripheral Field",
  shortName: "Peripheral Field",
  phase: "Acquire",
  description: "Hold a symbol at the centre while a target flashes out in your periphery — both at the same instant, too fast to look at. Flick toward WHERE it appeared (eight directions), then flick the DIRECTION the centre arrow was pointing. The flash gets shorter and the field gets wider, and the result is a map of your visual field, not a score.",
  purpose: "Useful field of view under divided attention — an 8-direction field map.",
  interaction: "touch",
  responseMode: "joystick",
  eightWay: true,
  environment: "arena",
  mvp: true,
  instructions: [
    "1. Keep your EYES ON THE CENTRE. Do not look away - you will not have time anyway.",
    "2. An ARROW flashes at the centre and a TARGET flashes out in your periphery, together.",
    "3. First: FLICK the stick toward WHERE the peripheral target was. Diagonals count.",
    "4. Then: FLICK the direction the CENTRE ARROW was pointing. Up, right, down, or left.",
    "5. Get both. Looking at the periphery loses you the arrow - and the flash is too short to look anyway.",
  ],
  controlsHint: "EYES CENTRE  -  FLICK WHERE IT WAS  -  THEN FLICK THE ARROW",
  levels: levels50((i) => {
    const band = BAND(i);
    /**
     * The floor is 14deg, not 11. Vertical eccentricity is compressed by 0.72 (the human
     * field IS wider than it is tall), so an 11deg request on a vertical bearing lands at
     * only 8deg — inside the parafovea, where 'peripheral' is a lie.
     */
    // Floor is 16deg, not 14: vertical eccentricity is compressed 0.72 and the per-trial
    // jitter can dip to 0.85, so a 14deg vertical request lands near 8.6deg — inside the
    // parafovea. 16 keeps even the worst-case vertical trial genuinely peripheral (>9deg).
    const ecc = Math.round(lerp50(16, 48, i));
    /**
     * THE FLASH IS NEVER LONGER THAN A SACCADE. Not even at level 1.
     *
     * The first pass eased the early levels by LENGTHENING the flash to 320ms — which
     * quietly destroyed the whole drill at exactly the levels a beginner lives in. A
     * saccade takes ~200ms to plan and land; at 320ms the athlete can look out at the
     * target, read it, and look back, and they will, because it is easier. They would
     * score well while training precisely the habit this drill exists to break.
     *
     * So the flash is capped at 180ms from the very first level, and the early band is
     * made gentle the honest way instead: a closer field, no clutter, full contrast, a
     * single symbol to hold, and a generous window to answer in.
     */
    const flash = ilerp50(180, 55, i);
    const span = band >= 2 ? (band >= 3 && i >= 44 ? 3 : 2) : 1;
    const dist = band === 0 ? 0 : Math.round(lerp50(0, 14, i));
    return {
      label: `${ecc} deg field - ${flash}ms flash - hold ${span}${dist ? ` - ${dist} clutter` : ""}`,
      parameters: {
        trials: 20,
        eccDeg: ecc,
        // the LEAD-IN is where the early levels get their gentleness — not the flash. A full
        // 1.8s at level 1 so the athlete parks their eyes and the flash never ambushes them.
        readyMs: ilerp50(1800, 700, i),
        flashMs: flash,
        maskMs: 180,
        // the "now answer" beat after the mask — the single biggest fix for "it feels fast":
        // there is finally a clear moment that hands the trial from seeing to answering.
        settleMs: ilerp50(650, 280, i),
        span,
        distractors: dist,
        contrast: band >= 3 ? lerp50(1, 0.45, i) : 1,
        // the timeout window for each flick. A flick takes well under a second, so this is
        // generous — but NOT huge, because when it is huge the worst-case budget that spaces
        // the trials balloons and a fast athlete waits out a long idle before the next flash.
        // The gentleness of the early levels lives in the lead-in and the settle beat, which
        // is where "it feels fast" actually comes from — not in a bloated answer window.
        responseMs: ilerp50(2200, 1400, i),
        // a real breath between trials, longest at the start
        interTrialMs: ilerp50(1500, 700, i),
      },
    };
  }),
  buildTrials: (params, rng) => buildDualTaskTrials(params as unknown as PFParams, rng, "pf"),

  /**
   * THE FIELD MAP. This is the payload — not an accuracy number, but WHERE the athlete
   * can and cannot see. Per-direction hit rates, ranked. Most athletes are measurably
   * worse in one quadrant, and it is usually the one their sport punishes.
   */
  analyze: (events) => {
    const per = events.filter((e) => e.trialId.includes("-where"));
    const cen = events.filter((e) => e.trialId.includes("-what"));
    if (!per.length) return [];

    const byDir = new Map<string, { n: number; ok: number }>();
    for (const e of per) {
      const d = String(e.expectedAction ?? "?");
      const b = byDir.get(d) ?? { n: 0, ok: 0 };
      b.n++;
      if (e.correct) b.ok++;
      byDir.set(d, b);
    }
    const rows = [...byDir.entries()]
      .map(([d, b]) => ({ d, pct: Math.round((b.ok / b.n) * 100), n: b.n }))
      .sort((a, b) => a.pct - b.pct);

    const pAcc = Math.round((per.filter((e) => e.correct).length / per.length) * 100);
    const cAcc = cen.length
      ? Math.round((cen.filter((e) => e.correct).length / cen.length) * 100)
      : 0;

    const notes = [
      `FIELD MAP — ${rows.map((r) => `${r.d} ${r.pct}%`).join("  ")}`,
      `Peripheral localization ${pAcc}%  ·  central recall ${cAcc}%.`,
    ];
    if (rows.length >= 2 && rows[0].pct < rows[rows.length - 1].pct - 25) {
      notes.push(`Weakest field: ${rows[0].d.toUpperCase()} (${rows[0].pct}%) vs strongest ${rows[rows.length - 1].d.toUpperCase()} (${rows[rows.length - 1].pct}%).`);
    }
    /**
     * The dissociation is the diagnostic. Good periphery with a collapsed centre means
     * the athlete is CHEATING — saccading out to the target and losing what they were
     * holding. It is not a better score; it is the wrong strategy, and it is the single
     * most important thing this drill can tell a coach.
     */
    if (pAcc > 70 && cAcc < 55) {
      notes.push("Central recall collapsed while peripheral stayed high — the athlete is breaking fixation to chase the target. Drop a level and rebuild the habit.");
    }
    return notes;
  },

  durationMs: (params) => {
    const p = params as unknown as PFParams;
    const perSym = p.flashMs + (p.span > 1 ? 240 : 90);
    const perTrial =
      p.readyMs + p.span * perSym + p.maskMs + p.settleMs
      + p.responseMs * (1 + p.span) + p.interTrialMs;
    return 1600 + p.trials * perTrial + 1500;
  },
};


/**
 * SIMPLE PERIPHERAL TARGETS — for the drills that consume this as a COMPONENT.
 *
 * Chaos Arena and Contrast Signal do not want the dual-task paradigm; they want a
 * stream of peripheral targets to mix into a larger drill. They were calling the old
 * builder with `as never`, and when the dual-task rewrite changed the parameter shape
 * underneath them, TypeScript said nothing and both drills silently started producing
 * ZERO trials. `as never` is not a cast, it is a request to stop being warned.
 *
 * So this is a separate, explicitly-typed export with its own contract. Break it, and
 * the compiler will now say so.
 */
export interface SimplePeripheralParams {
  trialCount: number;
  eccentricityDeg: number;
  targetDurationMs: number;
  isiMinMs: number;
  isiMaxMs: number;
  distractorRatio: number;
  contrast: number;
}

export function buildPeripheralTrials(
  p: SimplePeripheralParams,
  rng: () => number,
  idp = "pf",
): TrialSpec[] {
  const out: TrialSpec[] = [];
  let t = 1000;
  for (let i = 0; i < p.trialCount; i++) {
    const o = OCTANTS[Math.floor(rng() * OCTANTS.length)];
    const isDistractor = rng() < p.distractorRatio;
    const ecc = p.eccentricityDeg * (0.85 + rng() * 0.3);
    /**
     * Chaos Arena and Contrast Signal are STRIKE drills — the athlete reaches out and
     * hits these. So they belong on the strike shell (~0.68 m), not on the pointer plane
     * at 1.3 m where the dual-task drill lives. Handing them pointer-plane coordinates
     * put every target a full arm's length beyond reach.
     */
    const zone: TargetZone = o.dir.includes("Left") || o.dir === "left" ? "left"
      : o.dir.includes("Right") || o.dir === "right" ? "right"
      : o.dir === "up" ? "up" : "down";
    out.push({
      id: `${idp}-${i}`,
      spawnAt: t,
      duration: p.targetDurationMs,
      kind: isDistractor ? "distractor" : "go",
      zone,
      position: strikePosition(zone, ecc, 0.1, rng),
      color: isDistractor ? DIM : dim(TEAL, p.contrast),
      emissive: isDistractor ? undefined : dim(TEAL, p.contrast),
      shape: isDistractor ? "box" : "sphere",
      scale: 0.07,
    });
    t += p.targetDurationMs + p.isiMinMs + rng() * Math.max(0, p.isiMaxMs - p.isiMinMs);
  }
  return out;
}
