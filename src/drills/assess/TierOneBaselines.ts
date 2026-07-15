import type { DrillDefinition, TrialSpec, SliceDirection } from "@/ares/drillTypes";
import { pick } from "@/utils/rng";

/**
 * TIER-1 PERFORMANCE BASELINES.
 * The perception-action and divided-attention layer the sensory battery
 * doesn't reach. All three resolve to a threshold or an error distribution
 * (not a raw latency), which is what makes them repeatable.
 *
 * PHASE 1 PROTOTYPE: experience/design validation only. Values here are NOT
 * validated measurements; validated thresholds come from the native build.
 */

const WHITE = "#EAF0FF";
const TEAL = "#2998AA";
const PURPLE = "#8B5CF6";
const GOLD = "#C4B5FD";
const Z = -0.9;
const DIRS = ["up", "down", "left", "right"] as const;

const STANDARD = (parameters: Record<string, unknown> = {}) => [
  { level: 1, label: "Standard Protocol", parameters },
];

// ================= 1. COINCIDENCE-ANTICIPATION TIMING (CAT) =================
// A marker travels toward a thin CONTACT LINE. The athlete fires the trigger at
// the exact instant the marker's centre crosses the line. We are NOT measuring
// reaction time — we are measuring how tightly their motor output is
// synchronized to what their visual system sees.
//
//   score per trial = press_time - exact_crossing_time
//        + = LATE (it already crossed)      - = EARLY (fired before it got there)
//   perfect = 0
//
// The marker ACCELERATES across the 20 trials, and every trial is jittered in
// speed, direction and delay so no rhythm can be learned.
const CAT_TRIALS = 20;
const CAT_Z = -1.0;
const CAT_LINE_X = 0.34;      // the contact line
const CAT_FLIGHT_SLOW = 1900; // trial 1 — easy read
const CAT_FLIGHT_FAST = 700;  // trial 20 — fast
const CAT_JITTER = 0.18;      // +/-18% unpredictability on every trial

export const CoincidenceAnticipation: DrillDefinition = {
  id: "assess-cat",
  name: "Coincidence-Anticipation Timing",
  shortName: "Anticipation Timing",
  phase: "Assess",
  description:
    "A marker travels toward a thin CONTACT LINE — pull the trigger at the exact instant it crosses. Not a reaction test: it measures how precisely your motor output is synchronized to what you see. Early fires score negative, late fires positive, perfect is zero. The marker speeds up and its timing is randomized every trial so no rhythm can be learned. 20 trials.",
  purpose: "Visuomotor synchronization — signed timing error against the contact line.",
  interaction: "touch",
  responseMode: "trigger",
  environment: "arena",
  mvp: true,
  assessment: true,
  anticipation: { arriveMs: 0 }, // per-trial arrival is carried on each stimulus
  instructions: [
    "1. A thin TEAL CONTACT LINE stands in front of you.",
    "2. A marker travels toward it. Watch it approach.",
    "3. Pull EITHER trigger at the EXACT moment the marker crosses the line.",
    "4. Fire early = negative score. Fire late = positive. DEAD ON THE LINE = zero.",
    "5. It gets faster and the timing is randomized - do not try to find a rhythm. 20 trials.",
  ],
  controlsHint: "FIRE THE INSTANT IT CROSSES THE LINE - 0ms IS PERFECT",
  levels: STANDARD({ trials: CAT_TRIALS }),
  buildTrials: (params, rng) => {
    const p = params as { trials: number };
    const trials: TrialSpec[] = [];
    let t = 1800;
    for (let i = 0; i < p.trials; i++) {
      // accelerating base + per-trial jitter => speeds up, stays unpredictable
      const f = i / Math.max(1, p.trials - 1);
      const base = CAT_FLIGHT_SLOW + (CAT_FLIGHT_FAST - CAT_FLIGHT_SLOW) * f;
      const flightMs = Math.round(base * (1 - CAT_JITTER + rng() * CAT_JITTER * 2));
      const leftToRight = rng() < 0.5; // direction randomized too
      const y = 1.34 + (rng() - 0.5) * 0.28; // crosses the line at a random height
      const startX = leftToRight ? -0.72 : 0.72 + (CAT_LINE_X * 2);
      const lineX = leftToRight ? CAT_LINE_X : -CAT_LINE_X;
      const dist = Math.abs(lineX - startX);
      const speed = dist / (flightMs / 1000); // m/s
      const overshoot = 0.45; // keeps travelling past the line

      // the contact LINE (thin vertical bar, decor)
      trials.push({
        id: `cat-${i}-line`, spawnAt: t, duration: flightMs + 1100, kind: "distractor", decor: true,
        zone: "center", position: [lineX, 1.34, CAT_Z],
        color: TEAL, emissive: "#7FD3DE", shape: "line", scale: 0.19,
      });
      // the marker — GO from spawn so BOTH early and late presses are scored.
      // meta.arriveMs = the exact ms its centre crosses the line's centre.
      trials.push({
        id: `cat-${i}`, spawnAt: t, duration: flightMs + 900, kind: "go",
        zone: "center", position: [startX, y, CAT_Z],
        velocity: [(leftToRight ? 1 : -1) * speed, 0, 0],
        color: PURPLE, emissive: PURPLE, shape: "sphere", scale: 0.035,
        meta: { arriveMs: flightMs },
      });
      // random inter-trial delay — no learnable cadence
      t += flightMs + 900 + 700 + Math.round(rng() * 900) + (overshoot * 0);
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number };
    return 1800 + p.trials * (CAT_FLIGHT_SLOW + 900 + 700 + 900) + 2500;
  },
};

// ====== 2. DYNAMIC VISUAL ACUITY — monocular OD / OS / OU ======
// Three blocks: RIGHT eye only (OD, left occluded), LEFT eye only (OS, right
// occluded), then BOTH (OU). 15 trials per block. Within a block the arrow
// sweeps FASTER and gets SMALLER each trial, with a fully random direction.
// THREE consecutive wrong answers ends that block early and moves to the next.
const DVA_TRIALS_PER_BLOCK = 15;
const DVA_Z = -1.0;
const DVA_V_SLOW = 30;   // deg/s
const DVA_V_FAST = 260;  // deg/s
const DVA_SCALE_BIG = 0.075;
const DVA_SCALE_SMALL = 0.026;

type DvaBlock = "od" | "os" | "ou";
const DVA_BLOCKS: { id: DvaBlock; label: string; blockEye?: "left" | "right" }[] = [
  { id: "od", label: "RIGHT EYE (OD) — LEFT COVERED", blockEye: "left" },
  { id: "os", label: "LEFT EYE (OS) — RIGHT COVERED", blockEye: "right" },
  { id: "ou", label: "BOTH EYES (OU)" },
];

interface DvaState {
  wrongRun: Record<DvaBlock, number>;
  done: Record<DvaBlock, boolean>;
  lastBlock: DvaBlock | null;
  prevEvents: number;
}
const dvaState: DvaState = {
  wrongRun: { od: 0, os: 0, ou: 0 },
  done: { od: false, os: false, ou: false },
  lastBlock: null,
  prevEvents: 0,
};
const dvaPlan: { block: DvaBlock; idx: number; degS: number }[] = [];

export const DynamicVisualAcuity: DrillDefinition = {
  id: "assess-dva-motion",
  name: "Dynamic Visual Acuity (OD / OS / OU)",
  shortName: "Dynamic Acuity",
  phase: "Assess",
  description:
    "Monocular then binocular. RIGHT eye alone (left covered), LEFT eye alone (right covered), then BOTH. An arrow sweeps across your view — flick the joystick the way it points. Each trial it moves faster and gets smaller. Three wrong in a row ends that eye and moves to the next. 15 trials per block.",
  purpose: "Dynamic visual acuity per eye and binocularly (velocity + size threshold).",
  interaction: "touch",
  responseMode: "joystick",
  environment: "arena",
  mvp: true,
  assessment: true,
  monocular: true,
  instructions: [
    "1. A banner tells you which eye is being tested - the other eye is BLACKED OUT.",
    "2. An ARROW sweeps across your view. Read which way it POINTS.",
    "3. FLICK the joystick in that exact direction (up / down / left / right).",
    "4. Every trial the arrow moves FASTER and gets SMALLER.",
    "5. Three wrong in a row ends that eye and moves to the next. RIGHT eye, then LEFT, then BOTH.",
  ],
  controlsHint: "READ THE SWEEPING ARROW - FLICK THE JOYSTICK THAT WAY",
  levels: STANDARD({ trialsPerBlock: DVA_TRIALS_PER_BLOCK }),
  buildTrials: (params, rng) => {
    const p = params as { trialsPerBlock: number };
    dvaState.wrongRun = { od: 0, os: 0, ou: 0 };
    dvaState.done = { od: false, os: false, ou: false };
    dvaState.lastBlock = null;
    dvaState.prevEvents = 0;
    dvaPlan.length = 0;
    const trials: TrialSpec[] = [];
    let t = 2400;
    for (const blk of DVA_BLOCKS) {
      // eye banner
      trials.push({
        id: `dva-banner-${blk.id}`, spawnAt: t, duration: 2400, kind: "distractor",
        zone: "center", position: [0, 1.72, DVA_Z], color: TEAL, emissive: TEAL, shape: "diamond", scale: 0.001,
        label: blk.label,
        meta: { decor: true, ...(blk.blockEye ? { blockEye: blk.blockEye } : {}), labelInside: true, labelSize: 0.05, labelColor: "#7FD3DE" },
      });
      t += 2600;

      for (let n = 0; n < p.trialsPerBlock; n++) {
        const f = n / Math.max(1, p.trialsPerBlock - 1);
        const degS = Math.round(DVA_V_SLOW + (DVA_V_FAST - DVA_V_SLOW) * f); // faster each trial
        const scale = DVA_SCALE_BIG + (DVA_SCALE_SMALL - DVA_SCALE_BIG) * f;  // smaller each trial
        const dir = pick(rng, DIRS);                                          // fully random direction
        const leftToRight = rng() < 0.5;
        const vms = (degS * Math.PI) / 180 * Math.abs(DVA_Z);                 // deg/s -> m/s
        const travel = 1.5;
        dvaPlan.push({ block: blk.id, idx: n, degS });
        trials.push({
          id: `dva-${blk.id}-${n}`, spawnAt: t,
          duration: (travel / vms) * 1000 + 250,
          kind: "go",
          zone: "center",
          position: [leftToRight ? -0.75 : 0.75, 1.45 + (rng() - 0.5) * 0.16, DVA_Z],
          velocity: [(leftToRight ? 1 : -1) * vms, 0, 0],
          requiredDirection: dir,
          color: WHITE, emissive: TEAL, shape: "arrow", scale,
          meta: { pointDir: dir, dvaBlock: blk.id, dvaIdx: n, ...(blk.blockEye ? { blockEye: blk.blockEye } : {}) },
        });
        t += (travel / vms) * 1000 + 250 + 900;
      }
      t += 600;
    }
    return trials;
  },
  onSpawnAdapt: (spec, snapshot) => {
    const blk = spec.meta?.dvaBlock as DvaBlock | undefined;
    if (!blk) return;
    // fold in the previous trial's outcome (only when a new event actually landed)
    const events = snapshot.hits + snapshot.errors;
    if (events > dvaState.prevEvents && dvaState.lastBlock && snapshot.lastEventCorrect !== undefined) {
      if (snapshot.lastEventCorrect) dvaState.wrongRun[dvaState.lastBlock] = 0;
      else {
        dvaState.wrongRun[dvaState.lastBlock] += 1;
        if (dvaState.wrongRun[dvaState.lastBlock] >= 3) dvaState.done[dvaState.lastBlock] = true;
      }
    }
    dvaState.prevEvents = events;
    // this block is finished (3 wrong in a row) — skip its remaining trials
    if (dvaState.done[blk]) {
      spec.kind = "distractor";
      spec.meta = { ...spec.meta, decor: true };
      spec.duration = 10;
      return;
    }
    dvaState.lastBlock = blk;
  },
  analyze: (events) => {
    const notes: string[] = [];
    for (const blk of DVA_BLOCKS) {
      const evts = events.filter((e) => e.trialId.startsWith(`dva-${blk.id}-`) && e.errorType !== "correctRejection");
      if (!evts.length) { notes.push(`${blk.id.toUpperCase()}: not reached.`); continue; }
      const correct = evts.filter((e) => e.correct).length;
      const acc = Math.round((correct / evts.length) * 1000) / 10;
      let fastest = 0;
      for (const e of evts) {
        if (!e.correct) continue;
        const m = e.trialId.match(/-(\d+)$/);
        const idx = m ? Number(m[1]) : -1;
        const rec = dvaPlan.find((r) => r.block === blk.id && r.idx === idx);
        if (rec) fastest = Math.max(fastest, rec.degS);
      }
      notes.push(
        `${blk.id.toUpperCase()}: ${acc}% over ${evts.length} trial(s) — fastest arrow correctly read ${fastest || "—"} deg/s${dvaState.done[blk.id] ? " (ended on 3 consecutive misses)" : ""}.`,
      );
    }
    notes.push("Monocular OD/OS then binocular OU — 15 trials each. PROTOTYPE (design validation) — non-validating.");
    return notes;
  },
  durationMs: (params) => {
    const p = params as { trialsPerBlock: number };
    return 2400 + 3 * (2600 + p.trialsPerBlock * 3200 + 600) + 3000;
  },
};

// ================= 3. USEFUL FIELD OF VIEW (monocular) =================
// MONOCULAR protocol. One eye is fully occluded (true per-eye render layer);
// the other is tested. LEFT eye is covered first (RIGHT eye tested), then they
// swap. 15 trials per eye = 30 total.
//
// Within each eye the demand ramps two ways at once:
//   - the flash moves progressively OUTWARD (central -> far periphery)
//   - the flash gets progressively FASTER (long exposure -> very brief)
// Sector order is fully randomized from a balanced deck so every one of the 8
// field sectors is probed at least once and most are probed twice per eye.
const UFOV_TRIALS_PER_EYE = 15;
const UFOV_SECTORS = 8; // N, NE, E, SE, S, SW, W, NW
const UFOV_Z = -1.1;    // viewing plane (1.1 m) — eccentricity computed from this
const UFOV_R_NEAR = 0.20; // ~10 deg
const UFOV_R_FAR = 0.78;  // ~35 deg
const UFOV_EXP_SLOW = 380;
const UFOV_EXP_FAST = 60;

interface UfovRec { eye: "right" | "left"; sector: number; eccDeg: number; expMs: number }
const ufovPlan: UfovRec[] = [];
const degOf = (r: number) => Math.round((Math.atan(r / Math.abs(UFOV_Z)) * 180) / Math.PI);
/** the eight sectors, as joystick-flick directions (sector 0 = right, going counter-clockwise). */
const UFOV_OCT: SliceDirection[] = ["right", "upRight", "up", "upLeft", "left", "downLeft", "down", "downRight"];

export const UsefulFieldOfView: DrillDefinition = {
  id: "assess-ufov",
  name: "Useful Field of View (Monocular)",
  shortName: "Useful Field",
  phase: "Assess",
  description:
    "MONOCULAR field test. One eye is blacked out while the other is tested — left eye covered first (right eye tested), then swapped. Hold central fixation; a target flashes somewhere in the periphery, then FLICK the joystick toward where it was. The flashes move further out and get faster as you go. 15 trials per eye; every field sector is probed.",
  purpose: "Monocular useful field of view — how far out, and how fast, each eye can localize.",
  interaction: "touch",
  responseMode: "joystick",
  eightWay: true,
  environment: "arena",
  mvp: true,
  assessment: true,
  monocular: true,
  instructions: [
    "1. ONE EYE IS COVERED. A banner tells you which eye is being tested.",
    "2. Keep your eyes locked on the CENTER cue - do not look around the field.",
    "3. A target FLASHES briefly out in your periphery, then vanishes.",
    "4. FLICK the joystick toward WHERE it flashed - the eight faint rings show the directions.",
    "5. It moves further out and flashes faster as you go. 15 trials per eye, then eyes swap.",
  ],
  controlsHint: "HOLD CENTER - FLICK THE STICK TOWARD WHERE IT FLASHED",
  options: [
    { id: "dominantHand", label: "Joystick hand", defaultValue: "right",
      values: [ { id: "right", label: "Right" }, { id: "left", label: "Left" } ] },
  ],
  levels: STANDARD({ trialsPerEye: UFOV_TRIALS_PER_EYE }),
  buildTrials: (params, rng) => {
    const p = params as { trialsPerEye: number };
    ufovPlan.length = 0;
    const trials: TrialSpec[] = [];
    let t = 2600;
    // LEFT eye covered first => RIGHT eye tested first
    const blocks: { tested: "right" | "left"; blocked: "left" | "right" }[] = [
      { tested: "right", blocked: "left" },
      { tested: "left", blocked: "right" },
    ];
    let g = 0;
    for (const blk of blocks) {
      // balanced sector deck: 2x each of 8 sectors -> take trialsPerEye
      const deck: number[] = [];
      for (let rep = 0; rep < 2; rep++) for (let sct = 0; sct < UFOV_SECTORS; sct++) deck.push(sct);
      for (let k = deck.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [deck[k], deck[j]] = [deck[j], deck[k]];
      }
      const sectors = deck.slice(0, p.trialsPerEye);

      // eye-change banner
      trials.push({
        id: `ufov-banner-${blk.tested}`, spawnAt: t, duration: 2400, kind: "distractor",
        zone: "center", position: [0, 1.72, UFOV_Z], color: TEAL, emissive: TEAL, shape: "diamond", scale: 0.001,
        label: `${blk.tested.toUpperCase()} EYE — ${blk.blocked.toUpperCase()} COVERED`,
        meta: { decor: true, blockEye: blk.blocked, labelInside: true, labelSize: 0.055, labelColor: "#7FD3DE" },
      });
      t += 2600;

      for (let n = 0; n < p.trialsPerEye; n++) {
        const f = n / Math.max(1, p.trialsPerEye - 1); // 0 -> 1 across the block
        const r = UFOV_R_NEAR + (UFOV_R_FAR - UFOV_R_NEAR) * f;   // central -> peripheral
        const expMs = Math.round(UFOV_EXP_SLOW + (UFOV_EXP_FAST - UFOV_EXP_SLOW) * f); // slow -> fast
        const sector = sectors[n];
        const ang = (sector / UFOV_SECTORS) * Math.PI * 2 + rng() * 0.12; // slight jitter, same sector
        const groupId = `ufov-${blk.tested}-${g++}`;
        ufovPlan.push({ eye: blk.tested, sector, eccDeg: degOf(r), expMs });

        // central fixation cue — holds through the whole trial (the attention load)
        trials.push({
          id: `${groupId}-fix`, spawnAt: t, duration: expMs + 2600, kind: "distractor", decor: true,
          zone: "center", position: [0, 1.45, UFOV_Z], color: GOLD, emissive: GOLD, shape: "sphere", scale: 0.016,
          meta: { blockEye: blk.blocked },
        });
        // the peripheral FLASH — brief, then gone
        trials.push({
          id: `${groupId}-flash`, spawnAt: t + 260, duration: expMs, kind: "distractor", decor: true,
          zone: "center",
          position: [Math.cos(ang) * r, 1.45 + Math.sin(ang) * r * 0.78, UFOV_Z],
          color: WHITE, emissive: WHITE, shape: "sphere", scale: 0.035,
          groupId, meta: { blockEye: blk.blocked },
        });
        // RESPONSE = an 8-way joystick FLICK toward the sector where the flash was. Pointing at
        // a thin response ring was unreliable — the ray slips through the hole and misses the
        // torus tube. A flick has no such aiming problem: the athlete simply pushes the stick
        // the way they saw it, and the sector maps 1:1 onto the eight octant directions.
        const respAt = t + 260 + expMs + 60;
        // faint sector rings, DECOR only, so the athlete can calibrate the eight directions
        for (let k = 0; k < UFOV_SECTORS; k++) {
          const a = (k / UFOV_SECTORS) * Math.PI * 2;
          trials.push({
            id: `${groupId}-guide${k}`, spawnAt: respAt, duration: 2400, kind: "distractor", decor: true,
            zone: "center",
            position: [Math.cos(a) * r, 1.45 + Math.sin(a) * r * 0.78, UFOV_Z],
            color: "#2A3050", emissive: "#38406B", shape: "ring", scale: 0.045,
            groupId, meta: { blockEye: blk.blocked, decor: true },
          });
        }
        // the single flick target — invisible at centre, answered by flicking toward the sector
        trials.push({
          id: `${groupId}-flick`, spawnAt: respAt, duration: 2400, kind: "go",
          zone: "center", position: [0, 1.45, UFOV_Z],
          requiredDirection: UFOV_OCT[sector],
          color: PURPLE, emissive: PURPLE, shape: "ring", scale: 0.001,
          groupId, meta: { blockEye: blk.blocked, axes: 8, prompt: true },
        });
        // a central "WHERE?" prompt ring so the athlete knows the response window is open
        trials.push({
          id: `${groupId}-cue`, spawnAt: respAt, duration: 2400, kind: "distractor", decor: true,
          zone: "center", position: [0, 1.45, UFOV_Z],
          color: TEAL, emissive: TEAL, shape: "ring", scale: 0.03,
          groupId, meta: { blockEye: blk.blocked, decor: true },
        });
        t += 260 + expMs + 2400 + 700;
      }
    }
    return trials;
  },
  analyze: (events) => {
    const notes: string[] = [];
    for (const eye of ["right", "left"] as const) {
      const evts = events.filter((e) => e.trialId.startsWith(`ufov-${eye}-`) && e.errorType !== "correctRejection");
      if (!evts.length) continue;
      const correct = evts.filter((e) => e.correct).length;
      const acc = Math.round((correct / evts.length) * 1000) / 10;
      // deepest eccentricity + fastest flash still localized correctly
      const plan = ufovPlan.filter((r) => r.eye === eye);
      let deepest = 0;
      let fastest = 9999;
      evts.forEach((e, i) => {
        if (!e.correct) return;
        const rec = plan[i];
        if (!rec) return;
        deepest = Math.max(deepest, rec.eccDeg);
        fastest = Math.min(fastest, rec.expMs);
      });
      notes.push(
        `${eye.toUpperCase()} eye: ${acc}% localization over ${evts.length} trials — furthest correct ${deepest} deg eccentricity, briefest correct flash ${fastest === 9999 ? "—" : fastest + "ms"}.`,
      );
    }
    notes.push("Monocular protocol — 15 trials per eye, all 8 field sectors probed. PROTOTYPE (design validation) — non-validating.");
    return notes;
  },
  durationMs: (params) => {
    const p = params as { trialsPerEye: number };
    // 2 eyes x (banner + trials)
    return 2600 + 2 * (2600 + p.trialsPerEye * (260 + UFOV_EXP_SLOW + 2400 + 700)) + 3000;
  },
};

export const TIER_ONE_BASELINES = [
  CoincidenceAnticipation,
  DynamicVisualAcuity,
  UsefulFieldOfView,
];
