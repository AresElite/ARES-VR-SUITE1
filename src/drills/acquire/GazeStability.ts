import type { DrillDefinition, TrialSpec } from "@/ares/drillTypes";
import { levels50, lerp50, ilerp50 } from "../shared/levels";
import { pick } from "@/utils/rng";

/**
 * GAZE STABILIZATION ENGINE — the three-axis difficulty lattice.
 * One parameterized template covering VORx1 (world-fixed optotype, athlete
 * rotates the head) and VORx2 (optotype counter-drifts against the head).
 *
 * The three independently graded axes:
 *   1. HEAD VELOCITY  — the optotype is visible ONLY while head angular
 *      speed exceeds the level's threshold (behavioral DVA/GST analog)
 *   2. PREDICTABILITY — metronomic cadence at low levels, randomized at high
 *   3. BACKGROUND     — plain field → drifting optokinetic clutter
 *
 * PHASE 1 PROTOTYPE: experience/design validation only. Velocity dosing here
 * is NOT validated measurement; validated thresholds come from the native
 * Phase 2 build. Never surfaced as a medical or diagnostic result.
 */

const DIRS = ["up", "down", "left", "right"] as const;
const WHITE = "#EAF0FF";
const TEAL = "#2998AA";
const FOCAL_Z = -1.3; // primary action plane at/near the pancake focal plane

interface GazeParams {
  trials: number;
  hvMinDegS: number;   // axis 1: head-velocity gate
  exposureMs: number;
  cadenceMs: number;
  jitterMs: number;    // axis 2: 0 = metronomic, large = random
  bgDensity: number;   // axis 3: 0 = plain, 1 = full optokinetic field
  counterDrift: number; // VORx2: optotype drift speed against the head (m/s)
}

function gazeTrials(p: GazeParams, rng: () => number, idp: string): TrialSpec[] {
  const trials: TrialSpec[] = [];
  let t = 2500;
  // optokinetic background: lateral-drifting decor spheres (axis 3)
  const bgCount = Math.round(p.bgDensity * 26);
  for (let b = 0; b < bgCount; b++) {
    const dirSign = b % 2 === 0 ? 1 : -1;
    trials.push({
      id: `${idp}-bg${b}`, spawnAt: 1200, duration: 2500 + p.trials * (p.cadenceMs + p.jitterMs) + 4000,
      kind: "distractor", decor: true, zone: "center",
      position: [-dirSign * 1.6, 0.9 + rng() * 1.3, FOCAL_Z - 0.7 - rng() * 0.8],
      velocity: [dirSign * (0.12 + rng() * 0.1), 0, 0],
      color: "#38406B", shape: "sphere", scale: 0.03 + rng() * 0.02,
    });
  }
  // velocity-gated optotypes (axes 1 + 2)
  for (let i = 0; i < p.trials; i++) {
    const dir = pick(rng, DIRS);
    trials.push({
      id: `${idp}-${i}`, spawnAt: t, duration: p.exposureMs, kind: "go",
      zone: "center",
      position: [(rng() - 0.5) * 0.14, 1.45 + (rng() - 0.5) * 0.1, FOCAL_Z],
      ...(p.counterDrift > 0
        ? { velocity: [(i % 2 === 0 ? 1 : -1) * p.counterDrift, 0, 0] }
        : {}),
      requiredDirection: dir,
      color: WHITE, emissive: TEAL, shape: "arrow", scale: 0.06,
      meta: { pointDir: dir, hvMinDegS: p.hvMinDegS },
    });
    t += p.cadenceMs + rng() * p.jitterMs;
  }
  return trials;
}

function gazeAnalyze(idp: string, hv: number) {
  return (events: { trialId: string; correct: boolean; errorType?: string }[]): string[] => {
    const scored = events.filter((e) => e.trialId.startsWith(`${idp}-`) && !e.trialId.includes("bg") && e.errorType !== "correctRejection");
    if (!scored.length) return [];
    const acc = Math.round((scored.filter((e) => e.correct).length / scored.length) * 1000) / 10;
    return [
      `Gaze-stability analog: ${acc}% identification at the >=${hv} deg/s head-velocity gate.`,
      "PROTOTYPE (design validation) - not a validated velocity dose or measurement.",
    ];
  };
}

const GAZE_INSTRUCTIONS = (x2: boolean) =>
  x2
    ? [
        "1. A DOT drifts across your view. Track it with your EYES while turning your head.",
        "2. The RING around the dot fills TEAL when your head is turning fast enough.",
        "3. While the ring is teal, an ARROW flashes on the moving dot - read it and FLICK the dominant joystick that way.",
        "4. Keep the dot sharp the whole time; if your gaze slips it blurs and you miss.",
        "5. Purpose: keep a MOVING object clear while your head turns - the sport-real reflex.",
      ]
    : [
        "1. Lock your EYES on the CENTER dot and do not look away.",
        "2. Turn your head smoothly LEFT and RIGHT (like shaking 'no'). The RING fills TEAL when you are fast enough.",
        "3. While the ring is teal, an ARROW flashes on the dot - read it and FLICK the dominant joystick that way.",
        "4. Hold the dot sharp with your eyes as your head moves; let the stick recenter between flicks.",
        "5. Purpose: train your eyes to hold a target sharp while your head moves.",
      ];

function makeGazeDrill(x2: boolean): DrillDefinition {
  const idp = x2 ? "vx2" : "vx1";
  return {
    id: x2 ? "gaze-stab-vorx2" : "gaze-stab-vorx1",
    name: x2 ? "Gaze Stabilization x2" : "Gaze Stabilization x1",
    shortName: x2 ? "Gaze Stab x2" : "Gaze Stab x1",
    phase: "Acquire",
    description: x2
      ? "Track a MOVING dot with your eyes while turning your head. A ring shows when your head is turning fast enough; an arrow flashes on the moving dot - read it and flick the joystick. The harder, sport-real gaze-stabilization variant."
      : "Lock your eyes on a fixed center dot and turn your head side to side. A ring shows when you are turning fast enough; an arrow flashes on the dot - read it and flick the joystick. Trains the reflex that keeps vision sharp during head motion.",
    purpose: "Gaze stability under head motion (behavioral DVA/GST analog - prototype).",
    interaction: "touch",
    responseMode: "joystick",
    environment: "arena",
    mvp: true,
    gazeStability: true,
    instructions: GAZE_INSTRUCTIONS(x2),
    controlsHint: x2 ? "TRACK THE MOVING DOT - FILL THE RING - FLICK THE ARROW" : "EYES ON THE DOT - FILL THE RING - FLICK THE ARROW",
    levels: levels50((i) => {
      const hv = Math.round(lerp50(25, x2 ? 110 : 130, i));
      const band = i < 17 ? "metronomic" : i < 34 ? "loosening cadence" : "random + clutter";
      return {
        label: `>=${hv} deg/s — ${band}`,
        parameters: {
          trials: 20,
          hvMinDegS: hv,
          exposureMs: ilerp50(1100, 550, i),
          cadenceMs: ilerp50(2600, 1700, i),
          jitterMs: i < 17 ? 0 : ilerp50(0, 1400, i),
          bgDensity: i < 34 ? lerp50(0, 0.35, i) : lerp50(0.35, 1, i),
          counterDrift: x2 ? lerp50(0.22, 0.6, i) : 0,
        } as unknown as Record<string, unknown>,
      };
    }),
    buildTrials: (params, rng) => gazeTrials(params as unknown as GazeParams, rng, idp),
    analyze: (events) => {
      // hv for the note comes from the trials themselves via closure-free parse
      return gazeAnalyze(idp, 0)(events).map((n) => n.replace(">=0 deg/s", "the level's head-velocity"));
    },
    durationMs: (params) => {
      const p = params as unknown as GazeParams;
      return 2500 + p.trials * (p.cadenceMs + p.jitterMs) + p.exposureMs + 2000;
    },
  };
}

export const GazeStabilizationX1 = makeGazeDrill(false);
export const GazeStabilizationX2 = makeGazeDrill(true);
