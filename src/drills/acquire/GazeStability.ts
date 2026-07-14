import type { DrillDefinition, TrialSpec } from "@/ares/drillTypes";
import { levels50, lerp50, ilerp50 } from "../shared/levels";
import { pick } from "@/utils/rng";

/**
 * THE TWO GAZE DRILLS ARE NOW GENUINELY DIFFERENT DRILLS.
 *
 * They used to be one template with a single flag flipped: x1 put a stationary
 * arrow at the centre, x2 drifted the same centre arrow sideways a little. In the
 * headset that reads as the same drill twice, because it very nearly was — the
 * optotype was in the same place, the task was the same, and the only difference
 * was a lateral drift the athlete could barely perceive.
 *
 * They now dissect gaze stability along the axis that actually matters:
 *
 *   x1 — CENTRAL HOLD.  The optotype is world-fixed at the fixation point. The
 *        athlete locks their eyes on it and rotates the head. The eyes must
 *        counter-rotate exactly as fast as the head, or the target smears. This is
 *        the VOR gain-1 demand and NOTHING ELSE: no search, no gaze shift, no
 *        peripheral load. Pure foveal stabilization.
 *
 *   x2 — PERIPHERAL ACQUIRE.  The optotype flashes OUT IN THE PERIPHERAL FIELD,
 *        at an eccentricity that grows with level, while the head is still
 *        rotating. The athlete must detect it off-axis, shift gaze to it, read it,
 *        and re-stabilize — all with the VOR already loaded. This is gaze SHIFT
 *        under head motion, which is a different reflex and a different failure.
 *        At the top bands the target also counter-drifts against the head (the
 *        true x2 demand: the eyes must move faster than the head).
 *
 * The distinction is not cosmetic. An athlete can have a clean VOR gain and still
 * fall apart the moment they have to leave fixation while the head is moving —
 * which is exactly the moment sport asks for: tracking the ball while turning to
 * find a teammate. Two drills, two failures, two prescriptions.
 *
 * PHASE 1 PROTOTYPE: experience/design validation only. Velocity dosing here is
 * NOT validated measurement; validated thresholds come from the native Phase 2
 * build. Never surfaced as a medical or diagnostic result.
 */

const DIRS = ["up", "down", "left", "right"] as const;
const WHITE = "#EAF0FF";
const TEAL = "#2998AA";
const FOCAL_Z = -1.3; // primary action plane at/near the pancake focal plane
const DEG = Math.PI / 180;

interface GazeParams {
  trials: number;
  hvMinDegS: number;    // the head-velocity gate: the optotype only shows above it
  exposureMs: number;
  cadenceMs: number;
  jitterMs: number;     // 0 = metronomic, large = unpredictable
  bgDensity: number;    // optokinetic clutter
  eccDeg: number;       // x2 ONLY: how far into the periphery the optotype appears
  counterDrift: number; // x2 upper bands: target moves AGAINST the head
}

function gazeTrials(p: GazeParams, rng: () => number, idp: string, peripheral: boolean): TrialSpec[] {
  const trials: TrialSpec[] = [];
  let t = 2500;

  // optokinetic background: lateral-drifting decor. It is DECOR — it can never be
  // struck, and it never sits on the fixation point.
  const bgCount = Math.round(p.bgDensity * 26);
  for (let b = 0; b < bgCount; b++) {
    const dirSign = b % 2 === 0 ? 1 : -1;
    trials.push({
      id: `${idp}-bg${b}`,
      spawnAt: 1200,
      duration: 2500 + p.trials * (p.cadenceMs + p.jitterMs) + 4000,
      kind: "distractor", decor: true, zone: "center",
      position: [-dirSign * 1.6, 0.9 + rng() * 1.3, FOCAL_Z - 0.7 - rng() * 0.8],
      velocity: [dirSign * (0.12 + rng() * 0.1), 0, 0],
      color: "#38406B", shape: "sphere", scale: 0.03 + rng() * 0.02,
    });
  }

  for (let i = 0; i < p.trials; i++) {
    const dir = pick(rng, DIRS);

    /**
     * WHERE THE OPTOTYPE APPEARS — the entire difference between the two drills.
     *
     * x1: dead centre, on the fixation dot. A tiny jitter only, so it cannot be
     *     anticipated as a pixel-perfect location, but it is foveal every time.
     *
     * x2: out at the level's eccentricity, on a random bearing, so the athlete
     *     cannot predict WHERE and must genuinely search the periphery while the
     *     head is already in motion.
     */
    let x: number, y: number;
    if (peripheral) {
      const bearing = rng() * Math.PI * 2;
      const off = Math.tan(p.eccDeg * DEG) * Math.abs(FOCAL_Z);
      x = Math.cos(bearing) * off;
      y = 1.45 + Math.sin(bearing) * off * 0.75; // flatten vertically — safe head range
    } else {
      x = (rng() - 0.5) * 0.05;
      y = 1.45 + (rng() - 0.5) * 0.04;
    }

    trials.push({
      id: `${idp}-${i}`,
      spawnAt: t,
      duration: p.exposureMs,
      kind: "go",
      zone: "center",
      position: [x, y, FOCAL_Z],
      // the counter-drift is x2's upper-band demand: the target moves AGAINST the
      // head, so the eyes must travel faster than the head to hold it — VOR x2.
      ...(p.counterDrift > 0
        ? { velocity: [(i % 2 === 0 ? 1 : -1) * p.counterDrift, 0, 0] }
        : {}),
      requiredDirection: dir,
      color: WHITE, emissive: TEAL, shape: "arrow", scale: peripheral ? 0.07 : 0.06,
      meta: { pointDir: dir, hvMinDegS: p.hvMinDegS },
    });
    t += p.cadenceMs + rng() * p.jitterMs;
  }
  return trials;
}

function gazeAnalyze(idp: string, peripheral: boolean) {
  return (events: { trialId: string; correct: boolean; errorType?: string; reactionMs?: number }[]): string[] => {
    const scored = events.filter(
      (e) => e.trialId.startsWith(`${idp}-`) && !e.trialId.includes("bg") && e.errorType !== "correctRejection",
    );
    if (!scored.length) return [];
    const acc = Math.round((scored.filter((e) => e.correct).length / scored.length) * 1000) / 10;
    const rts = scored.filter((e) => e.correct && e.reactionMs !== undefined).map((e) => e.reactionMs!);
    const avg = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;
    return peripheral
      ? [
          `Peripheral acquisition under head motion: ${acc}% identified, ${avg}ms to answer.`,
          "Slow answers here with a clean x1 score = the gaze SHIFT is the bottleneck, not the VOR.",
          "PROTOTYPE (design validation) - not a validated velocity dose or measurement.",
        ]
      : [
          `Central gaze hold: ${acc}% identified at the level's head-velocity gate, ${avg}ms to answer.`,
          "A low score here is a stabilization problem: the target is smearing on the fovea.",
          "PROTOTYPE (design validation) - not a validated velocity dose or measurement.",
        ];
  };
}

const X1_INSTRUCTIONS = [
  "1. Lock your EYES on the CENTER dot. Do not look away from it. Not once.",
  "2. Turn your head smoothly LEFT and RIGHT, like shaking your head 'no'.",
  "3. The RING fills TEAL when your head is turning fast enough. Keep it teal.",
  "4. An ARROW flashes ON the dot - read it WITHOUT looking away, and FLICK the stick that way.",
  "5. This trains one thing only: holding a target sharp on the fovea while your head moves.",
];

const X2_INSTRUCTIONS = [
  "1. Keep turning your head smoothly LEFT and RIGHT. The RING must stay TEAL.",
  "2. The ARROW does NOT appear in the center. It flashes OUT IN YOUR PERIPHERAL VISION.",
  "3. Find it, look at it, read it, and FLICK the stick that way - all while your head keeps moving.",
  "4. At higher levels the arrow also DRIFTS AGAINST your head turn. Stay with it.",
  "5. This trains the harder reflex: leaving fixation and re-stabilizing while the head is in motion.",
];

function makeGazeDrill(peripheral: boolean): DrillDefinition {
  const idp = peripheral ? "vx2" : "vx1";
  return {
    id: peripheral ? "gaze-stab-vorx2" : "gaze-stab-vorx1",
    name: peripheral ? "Gaze Stabilization x2 - Peripheral" : "Gaze Stabilization x1 - Central",
    shortName: peripheral ? "Gaze x2 Peripheral" : "Gaze x1 Central",
    phase: "Acquire",
    description: peripheral
      ? "Turn your head and keep the ring teal. The arrow does NOT appear in the center - it flashes out in your PERIPHERAL field. Find it, read it, flick it, while your head keeps moving. Higher levels drift the target against your head turn. This is gaze SHIFT under head motion - the harder, sport-real reflex."
      : "Lock your eyes on the CENTER dot and turn your head side to side. The ring fills teal when you are turning fast enough. An arrow flashes ON the dot - read it without looking away and flick the joystick. This is pure foveal stabilization: hold one target sharp while the head moves.",
    purpose: peripheral
      ? "Gaze shift + re-stabilization under head motion (peripheral acquisition - prototype)."
      : "Foveal gaze stability under head motion (VOR gain-1 analog - prototype).",
    interaction: "touch",
    responseMode: "joystick",
    environment: "arena",
    mvp: true,
    gazeStability: true,
    instructions: peripheral ? X2_INSTRUCTIONS : X1_INSTRUCTIONS,
    controlsHint: peripheral
      ? "RING TEAL - FIND THE ARROW IN THE PERIPHERY - FLICK IT"
      : "EYES ON THE DOT - RING TEAL - FLICK THE ARROW",
    levels: levels50((i) => {
      const hv = Math.round(lerp50(25, peripheral ? 110 : 130, i));
      const band = i < 17 ? "metronomic" : i < 34 ? "loosening cadence" : "random + clutter";
      const ecc = peripheral ? Math.round(lerp50(10, 34, i)) : 0;
      return {
        label: peripheral
          ? `>=${hv} deg/s - ${ecc} deg out - ${band}`
          : `>=${hv} deg/s - ${band}`,
        parameters: {
          trials: 20,
          hvMinDegS: hv,
          // a peripheral target needs a longer look — the athlete has to FIND it first
          exposureMs: peripheral ? ilerp50(1400, 700, i) : ilerp50(1100, 550, i),
          cadenceMs: ilerp50(2600, 1700, i),
          jitterMs: i < 17 ? 0 : ilerp50(0, 1400, i),
          bgDensity: i < 34 ? lerp50(0, 0.35, i) : lerp50(0.35, 1, i),
          eccDeg: ecc,
          // x2 only, and only in the top third: the true "x2" counter-motion demand
          counterDrift: peripheral && i >= 33 ? lerp50(0, 0.5, i) : 0,
        } as unknown as Record<string, unknown>,
      };
    }),
    buildTrials: (params, rng) => gazeTrials(params as unknown as GazeParams, rng, idp, peripheral),
    analyze: gazeAnalyze(idp, peripheral),
    durationMs: (params) => {
      const p = params as unknown as GazeParams;
      return 2500 + p.trials * (p.cadenceMs + p.jitterMs) + p.exposureMs + 2000;
    },
  };
}

export const GazeStabilizationX1 = makeGazeDrill(false);
export const GazeStabilizationX2 = makeGazeDrill(true);
