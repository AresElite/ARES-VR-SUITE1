import type { DrillDefinition, SliceDirection, TrialSpec, TargetZone } from "@/ares/drillTypes";
import { pick } from "@/utils/rng";
import { strikePosition, PERIPHERAL_ZONES } from "../shared/zones";
import { levels25, lerp25, ilerp25, levels50, lerp50, ilerp50 } from "../shared/levels";

/**
 * SYNCHRONIZE — direct ports of the A.R.E.S. Performance Suite drills.
 */

const TEAL = "#2998AA";
const PURPLE = "#8B5CF6";
const GOLD = "#F5B648";
const GREEN = "#22C55E";
const RED = "#EF5A6F";
const WHITE = "#EAF0FF";
const Z = -0.62;

// ============================ NEURAL PHASE LOCK ============================
// Strike when the expanding ring hits MAXIMUM size. Blackout pulses must be
// timed with the internal clock.
export const NeuralPhaseLock: DrillDefinition = {
  id: "neural-phase-lock",
  name: "Neural Phase Lock",
  shortName: "Phase Lock",
  phase: "Synchronize",
  description: "An expanding ring pulses on a fixed rhythm. Strike it exactly at MAXIMUM size — and keep the rhythm through blackout pulses using your internal clock.",
  purpose: "Rhythmic timing, internal clock stability under occlusion.",
  interaction: "touch", environment: "arena", mvp: true,
  instructions: [
    "1. The ring ahead expands and contracts on a fixed rhythm.",
    "2. Strike it exactly when it reaches MAXIMUM size.",
    "3. Striking early (small ring) counts against you.",
    "4. On blackout pulses the ring goes invisible - keep striking on the beat with your internal clock.",
  ],
  controlsHint: "STRIKE AT MAXIMUM SIZE - KEEP THE BEAT IN BLACKOUTS",
  levels: levels50((i) => ({
    label: `${ilerp50(1900, 800, i)}ms pulse, ${ilerp50(0, 65, i)}% blackout`,
    parameters: { pulses: i < 30 ? 24 : 26, periodMs: ilerp50(1900, 800, i), blackoutRatio: lerp50(0, 0.65, i) },
  })),
  buildTrials: (params, rng) => {
    const p = params as { pulses: number; periodMs: number; blackoutRatio: number };
    const trials: TrialSpec[] = [];
    let t = 1500;
    for (let i = 0; i < p.pulses; i++) {
      const blackout = rng() < p.blackoutRatio;
      trials.push({
        id: `npl-${i}`,
        spawnAt: t,
        duration: p.periodMs * 0.64,
        kind: "distractor",
        switchKindAt: t + p.periodMs * 0.38,
        switchKindTo: "go",
        zone: "center",
        position: [0, 1.45, Z],
        color: TEAL,
        emissive: TEAL,
        shape: "ring",
        scale: 0.07,
        meta: { pulsePeriodMs: p.periodMs, ...(blackout ? { blackout: true } : {}) },
      });
      t += p.periodMs;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { pulses: number; periodMs: number };
    return 1500 + p.pulses * p.periodMs + 2000;
  },
};

// ======================= DUAL STREAM: NEURAL COLLIDER =======================
// Energy streams converge on the core — strike the core exactly at collision.
// RED streams are anti-matter: do NOT strike.
export const DualStreamNeuralCollider: DrillDefinition = {
  id: "dual-stream-neural-collider",
  name: "Dual Stream: Neural Collider",
  shortName: "Neural Collider",
  phase: "Synchronize",
  description: "Energy streams converge on the core. Strike the core at the exact moment of collision — unless the particles are RED (anti-matter): then hold.",
  purpose: "Convergent timing prediction with inhibition gating.",
  interaction: "touch", environment: "arena", mvp: true,
  instructions: [
    "1. Two energy orbs sweep in from the sides toward the core ahead.",
    "2. Strike the CORE at the exact moment they collide.",
    "3. Too early counts against you. Too late is a miss.",
    "4. RED particles are ANTI-MATTER: do NOT strike the core. Hold completely.",
  ],
  controlsHint: "STRIKE THE CORE AT COLLISION - NEVER ON RED",
  levels: levels50((i) => ({
    label: `${ilerp50(2600, 1000, i)}ms approach, ${ilerp50(12, 48, i)}% anti-matter`,
    parameters: { trials: i < 30 ? 16 : 18, approachMs: ilerp50(2600, 1000, i), antiRatio: lerp50(0.12, 0.48, i), windowMs: ilerp50(340, 200, i) },
  })),
  buildTrials: (params, rng) => {
    const p = params as { trials: number; approachMs: number; antiRatio: number; windowMs: number };
    const trials: TrialSpec[] = [];
    let t = 1800;
    // deck-based anti-matter allocation: go-trial count is exact per level,
    // never RNG-starved (standardized scoreable volume)
    const antiCount = Math.min(p.trials - 9, Math.round(p.trials * p.antiRatio));
    const deck = Array.from({ length: p.trials }, (_, k) => k < antiCount);
    for (let k = deck.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [deck[k], deck[j]] = [deck[j], deck[k]];
    }
    for (let i = 0; i < p.trials; i++) {
      const anti = deck[i];
      const c = anti ? RED : TEAL;
      const speed = 0.55 / (p.approachMs / 1000);
      for (const side of [-1, 1]) {
        trials.push({
          id: `dsc-${i}-s${side}`, spawnAt: t, duration: p.approachMs, kind: "distractor", decor: true,
          zone: side < 0 ? "left" : "right",
          position: [side * 0.55, 1.45, Z], velocity: [-side * speed, 0, 0],
          color: c, emissive: c, shape: "sphere", scale: 0.045,
        });
      }
      trials.push({
        id: `dsc-${i}-core`, spawnAt: t, duration: p.approachMs + p.windowMs,
        kind: anti ? "noGo" : "distractor",
        ...(anti ? {} : { switchKindAt: t + p.approachMs - p.windowMs / 2, switchKindTo: "go" as const }),
        zone: "center", position: [0, 1.45, Z],
        color: anti ? RED : PURPLE, emissive: anti ? RED : PURPLE, switchColor: GREEN,
        shape: "diamond", scale: 0.075,
      });
      t += p.approachMs + p.windowMs + 900 + rng() * 400;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; approachMs: number; windowMs: number };
    return 1800 + p.trials * (p.approachMs + p.windowMs + 1100) + 1500;
  },
};

// =============================== PURSUIT-PULSE ===============================
// Follow the orbiting orb; when it pulses with an arrow, strike THROUGH it
// in the arrow's direction. Arrows appear only briefly.
const PP_DIRS: SliceDirection[] = ["up", "down", "left", "right"];

export const PursuitPulse: DrillDefinition = {
  id: "pursuit-pulse",
  name: "Pursuit-Pulse",
  shortName: "Pursuit-Pulse",
  phase: "Synchronize",
  description: "Track the moving orb with smooth pursuit. When it pulses gold with an arrow, strike through it in that direction — the window is brief.",
  purpose: "Smooth pursuit with embedded reactive direction decisions.",
  interaction: "touch", environment: "arena", mvp: true,
  instructions: [
    "1. Follow the moving orb with your EYES - smooth pursuit, no jumping ahead.",
    "2. At random moments it pulses GOLD and shows an arrow.",
    "3. Strike THROUGH the orb in the arrow's direction before the pulse ends.",
    "4. Striking outside a pulse counts against you.",
  ],
  controlsHint: "TRACK THE ORB - STRIKE ON THE GOLD PULSE, MATCH THE ARROW",
  levels: levels50((i) => ({
    label: `${lerp50(0.28, 1.0, i).toFixed(2)} rad/s, ${ilerp50(1200, 480, i)}ms pulse`,
    parameters: { pulses: i < 30 ? 18 : 20, speed: lerp50(0.28, 1.0, i), pulseMs: ilerp50(1200, 480, i), betweenMs: ilerp50(1800, 1100, i) },
  })),
  buildTrials: (params, rng) => {
    const p = params as { pulses: number; speed: number; pulseMs: number; betweenMs: number };
    const trials: TrialSpec[] = [];
    let t = 1500;
    let phase = rng() * Math.PI * 2;
    for (let i = 0; i < p.pulses; i++) {
      const dir = pick(rng, PP_DIRS);
      const segMs = p.betweenMs + p.pulseMs;
      trials.push({
        id: `pp-${i}`, spawnAt: t, duration: segMs,
        kind: "distractor",
        switchKindAt: t + p.betweenMs, switchKindTo: "go",
        zone: "center",
        position: [Math.sin(phase) * 0.4, 1.42, Z],
        lane: { radius: 0.4, angularSpeed: (i % 2 === 0 ? 1 : -1) * p.speed, phase, y: 1.3 + rng() * 0.35 },
        requiredDirection: dir,
        color: TEAL, emissive: TEAL, switchColor: GOLD,
        shape: "sphere", scale: 0.07,
        label: dir,
      });
      phase += (i % 2 === 0 ? 1 : -1) * p.speed * (segMs / 1000);
      t += segMs + 300;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { pulses: number; pulseMs: number; betweenMs: number };
    return 1500 + p.pulses * (p.betweenMs + p.pulseMs + 300) + 1500;
  },
};

// ================================= OCCLUSION =================================
// A ball crosses the field, disappears behind the occlusion zone — strike the
// GREEN LINE exactly when the invisible ball crosses it.
export const Occlusion: DrillDefinition = {
  id: "occlusion",
  name: "Occlusion",
  shortName: "Occlusion",
  phase: "Synchronize",
  description: "A ball travels across the field and vanishes behind the occlusion zone. Keep the trajectory alive in your mind and strike the GREEN line exactly as the invisible ball crosses it.",
  purpose: "Predictive timing through occlusion — mental trajectory extrapolation.",
  interaction: "touch", environment: "arena", mvp: true,
  instructions: [
    "1. A ball sweeps across the field in front of you.",
    "2. Midway, it disappears behind the invisible occlusion zone. It is still moving.",
    "3. Strike the GREEN LINE pad exactly when you judge the hidden ball crosses it.",
    "4. Maintain the mental trajectory - do not guess early.",
  ],
  controlsHint: "STRIKE THE GREEN LINE WHEN THE HIDDEN BALL CROSSES",
  levels: levels50((i) => ({
    label: `${(lerp50(1.7, 0.72, i)).toFixed(2)}s crossing, ${ilerp50(30, 78, i)}% hidden`,
    parameters: { trials: i < 30 ? 16 : 18, crossMs: ilerp50(1700, 720, i), hiddenFrac: lerp50(0.3, 0.78, i), windowMs: ilerp50(300, 140, i) },
  })),
  buildTrials: (params, rng) => {
    const p = params as { trials: number; crossMs: number; hiddenFrac: number; windowMs: number };
    const trials: TrialSpec[] = [];
    let t = 1800;
    const startX = -0.55;
    const lineX = 0.38;
    for (let i = 0; i < p.trials; i++) {
      const y = 1.3 + rng() * 0.35;
      const speed = (lineX - startX + 0.15) / ((p.crossMs + 200) / 1000);
      const crossAt = ((lineX - startX) / speed) * 1000;
      // the ball (decor; hides partway)
      trials.push({
        id: `occ-${i}-ball`, spawnAt: t, duration: p.crossMs + 400, kind: "distractor", decor: true,
        zone: "center", position: [startX, y, Z], velocity: [speed, 0, 0],
        color: WHITE, emissive: WHITE, shape: "sphere", scale: 0.05,
        meta: { hideAfterMs: crossAt * (1 - p.hiddenFrac) },
      });
      // the green line pad — go only inside the crossing window
      trials.push({
        id: `occ-${i}-line`, spawnAt: t, duration: crossAt + p.windowMs / 2 + 300,
        kind: "distractor",
        switchKindAt: t + crossAt - p.windowMs / 2, switchKindTo: "go",
        zone: "right", position: [lineX, y, Z],
        color: GREEN, emissive: GREEN, shape: "pad", scale: 0.055,
      });
      t += p.crossMs + 1400 + rng() * 400;
    }
    return trials;
  },
  durationMs: (params) => {
    const p = params as { trials: number; crossMs: number };
    return 1800 + p.trials * (p.crossMs + 1800) + 1500;
  },
};

// ============================ COGNITIVE CROSSFIRE ============================
// Central go/no-go cognitive stream + simultaneous peripheral detection.
export const CognitiveCrossfire: DrillDefinition = {
  id: "cognitive-crossfire",
  name: "Cognitive Crossfire",
  shortName: "Crossfire",
  phase: "Synchronize",
  description: "Hold central gaze to solve the go/no-go stream while detecting and striking peripheral targets the moment they appear. Both tasks are scored.",
  purpose: "Central-peripheral integration under dual-task load.",
  interaction: "touch", environment: "arena", mvp: true,
  instructions: [
    "1. Keep your gaze CENTERED. A central stream shows go/no-go targets:",
    "2. Strike TEAL centers fast. Never strike PURPLE centers.",
    "3. At the same time, GOLD diamonds flash in your peripheral field.",
    "4. Tap them with your free hand WITHOUT breaking central focus.",
    "5. Both tasks are scored. Accuracy on both beats speed on one. 60 seconds.",
  ],
  controlsHint: "CENTER: TEAL GO / PURPLE NO - PERIPHERY: TAP THE GOLD",
  levels: levels50((i) => ({
    label: `${ilerp50(1400, 700, i)}ms central tempo`,
    parameters: {
      durationS: 60, centralMs: ilerp50(1400, 700, i), noGoRatio: 0.25,
      periphCount: ilerp50(8, 20, i), periphMs: ilerp50(1400, 750, i), eccDeg: ilerp50(20, 40, i),
    },
  })),
  buildTrials: (params, rng) => {
    const p = params as { durationS: number; centralMs: number; noGoRatio: number; periphCount: number; periphMs: number; eccDeg: number };
    const trials: TrialSpec[] = [];
    const totalMs = p.durationS * 1000;
    let t = 1500;
    let i = 0;
    while (t < totalMs - p.centralMs) {
      const isNoGo = rng() < p.noGoRatio;
      trials.push({
        id: `ccf-c${i}`, spawnAt: t, duration: p.centralMs * 0.8,
        kind: isNoGo ? "noGo" : "go",
        zone: "center", position: [(rng() - 0.5) * 0.12, 1.45 + (rng() - 0.5) * 0.1, Z],
        color: isNoGo ? PURPLE : TEAL, emissive: isNoGo ? PURPLE : TEAL,
        shape: "sphere", scale: 0.06,
      });
      t += p.centralMs + rng() * 300;
      i++;
    }
    for (let k = 0; k < p.periphCount; k++) {
      const zone = pick(rng, PERIPHERAL_ZONES) as TargetZone;
      trials.push({
        id: `ccf-p${k}`, spawnAt: 2500 + rng() * (totalMs - 4500), duration: p.periphMs,
        kind: "go", zone,
        position: strikePosition(zone, p.eccDeg * (0.75 + rng() * 0.5), 0.15, rng, 0.75),
        color: GOLD, emissive: GOLD, shape: "diamond", scale: 0.075,
      });
    }
    return trials.sort((a, b) => a.spawnAt - b.spawnAt);
  },
  durationMs: (params) => {
    const p = params as { durationS: number };
    return p.durationS * 1000 + 3000;
  },
};
