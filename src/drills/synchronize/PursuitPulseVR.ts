import type { DrillDefinition, TrialSpec, ProgressionLevel, SliceDirection } from "@/ares/drillTypes";

/**
 * PURSUIT PULSE — 100 levels, 60 seconds, ported whole.
 *
 * A ball glides continuously across your field and you TRACK it — smooth pursuit, the eye
 * movement you use to follow a thrown ball or a skating opponent. Every so often it flashes an
 * ARROW, and you flick the stick:
 *   TEAL arrow  — flick the way it points.
 *   RED arrow   — flick the OPPOSITE way (anti-saccade), from level 71 up.
 *
 * The demand is doing both at once: hold smooth pursuit on a moving target AND resolve a brief
 * directional cue riding on top of it, in the response window before it is gone. Miss the ball
 * with your eyes and you cannot read the arrow; fixate the arrow and you lose the pursuit. That
 * coupling — track-and-decide — is the skill, and it is exactly what a fast sport demands.
 *
 * The ladder speeds the ball, shrinks it and the arrow, tightens the response window, and
 * complicates the path (orthogonal → diagonal → zigzag → random → chaotic). From level 51 it
 * adds moving DISTRACTORS, and from 71 anti-saccade cues you must invert.
 *
 * VR MAPPING. Reference is a touch-swipe over a moving ball; here the ball rides an analytic
 * path and the arrow prompt rides the SAME path (shared anchor and amplitude, phase-offset to
 * the prompt's spawn), so it sits exactly on the ball while you answer with an 8-way flick.
 */

const DURATION = 60_000;
const BALL_SPAWN = 400;    // the pursuit ball's spawn time — phase reference for riding prompts
const Z = -1.6;
const AX = 0.52, AY = 0.30;         // path half-extents (m)
const CY = 1.5;
const TEAL = "#2998AA";
const RED = "#EF4444";
const DIM = "#3A3F55";

const DIRS: SliceDirection[] = ["up", "down", "left", "right", "upLeft", "upRight", "downLeft", "downRight"];
const OPP: Record<SliceDirection, SliceDirection> = {
  up: "down", down: "up", left: "right", right: "left",
  upLeft: "downRight", upRight: "downLeft", downLeft: "upRight", downRight: "upLeft",
};

export interface PPLevel {
  lvl: number; ballRadius: number; arrowSize: number; speed: number; arrowMs: number;
  responseWindowMs: number; itiMs: number; pattern: string;
  distractorCount: number; occlusionChance: number; antiSaccadeChance: number; flashChance: number;
}

/** The exact 100-level table. */
export function ppLevel(level: number): PPLevel {
  const lvl = Math.min(Math.max(level, 1), 100);
  const i = lvl - 1;
  if (lvl <= 50) {
    const ballRadius = Math.max(18, 58 - i * 0.8);
    const arrowSize = Math.max(26, 82 - i * 1.0);
    const speed = 120 + i * 9;
    const arrowMs = Math.max(480, 1250 - i * 15);
    const responseWindowMs = Math.max(720, arrowMs + 260 - i * 3);
    const itiMs = Math.max(500, 1150 - i * 11);
    let pattern = "orthogonal";
    if (lvl >= 4) pattern = "ortho+diag";
    if (lvl >= 9) pattern = "zigzag";
    if (lvl >= 16) pattern = "random";
    if (lvl >= 28) pattern = "random+bursts";
    return { lvl, ballRadius, arrowSize, speed, arrowMs, responseWindowMs, itiMs, pattern, distractorCount: 0, occlusionChance: 0, antiSaccadeChance: 0, flashChance: 0 };
  }
  const j = i - 50;
  const ballRadius = Math.max(14, 18 - j * 0.08);
  const arrowSize = Math.max(20, 26 - j * 0.12);
  const speed = 570 + j * 8;
  const arrowMs = Math.max(250, 480 - j * 4.6);
  const responseWindowMs = Math.max(450, 720 - j * 5.4);
  const itiMs = Math.max(350, 500 - j * 3);
  let pattern = "random+bursts";
  if (lvl >= 71) pattern = "chaotic";
  let distractorCount = 0;
  if (lvl >= 51 && lvl <= 60) distractorCount = 1;
  if (lvl >= 61 && lvl <= 80) distractorCount = 2;
  if (lvl >= 81) distractorCount = 3;
  let occlusionChance = 0;
  if (lvl >= 61 && lvl <= 70) occlusionChance = 0.4;
  if (lvl >= 71 && lvl <= 90) occlusionChance = 0.6;
  if (lvl >= 91) occlusionChance = 0.8;
  let antiSaccadeChance = 0;
  if (lvl >= 71 && lvl <= 80) antiSaccadeChance = 0.25;
  if (lvl >= 81 && lvl <= 90) antiSaccadeChance = 0.4;
  if (lvl >= 91) antiSaccadeChance = 0.5;
  let flashChance = 0;
  if (lvl >= 56 && lvl <= 70) flashChance = 0.3;
  if (lvl >= 71 && lvl <= 90) flashChance = 0.5;
  if (lvl >= 91) flashChance = 0.8;
  return { lvl, ballRadius, arrowSize, speed, arrowMs, responseWindowMs, itiMs, pattern, distractorCount, occlusionChance, antiSaccadeChance, flashChance };
}

// path angular rates (rad/s) — a Lissajous whose speed grows with the level. Incommensurate
// x/y rates keep the ball from retracing a simple line.
function rates(speed: number): { wx: number; wy: number } {
  const base = speed * 0.0021;
  return { wx: 0.45 + base, wy: 0.63 + base * 1.18 };
}

const PX = 0.0011;

function buildPPTrials(level: number, rng: () => number): TrialSpec[] {
  const L = ppLevel(level);
  const { wx, wy } = rates(L.speed);
  const pxb = rng() * Math.PI * 2, pyb = rng() * Math.PI * 2;   // ball phase
  const ballR = Math.max(0.03, L.ballRadius * PX);
  const out: TrialSpec[] = [];

  // THE PURSUIT BALL — decor, glides for the whole minute. This is what you track.
  out.push({
    id: "pp-ball", spawnAt: BALL_SPAWN, duration: DURATION,
    kind: "distractor", decor: true, zone: "center",
    position: [0, CY, Z],
    wander: { ax: AX, ay: AY, wx, wy, px: pxb, py: pyb },
    color: TEAL, emissive: TEAL, shape: "sphere", scale: ballR,
    meta: { decor: true, ...(L.occlusionChance > 0 ? { flicker: true } : {}) },
  });

  // DISTRACTORS — moving clutter on their own paths, from level 51.
  for (let dI = 0; dI < L.distractorCount; dI++) {
    out.push({
      id: `pp-dist${dI}`, spawnAt: BALL_SPAWN, duration: DURATION,
      kind: "distractor", decor: true, zone: "center",
      position: [0, CY, Z],
      wander: { ax: AX * 0.9, ay: AY * 0.9, wx: wx * (1.1 + dI * 0.2), wy: wy * (0.85 + dI * 0.15), px: rng() * 6.28, py: rng() * 6.28 },
      color: DIM, emissive: DIM, shape: "sphere", scale: ballR * 0.9,
      meta: { decor: true },
    });
  }

  // ARROW PROMPTS — each rides the ball. Shared anchor+amplitude; phase offset by the ball's
  // rate times the prompt's spawn time, so the arrow sits exactly on the ball while it is lit.
  let t = BALL_SPAWN + 900;      // first prompt after the ball has been moving a beat
  let k = 0;
  const arrowScale = Math.max(0.03, L.arrowSize * PX);
  while (t < DURATION - L.responseWindowMs - 200) {
    const dir = DIRS[Math.floor(rng() * DIRS.length)];
    const isAnti = L.antiSaccadeChance > 0 && rng() < L.antiSaccadeChance;
    const answer = isAnti ? OPP[dir] : dir;
    // phase relative to the BALL's spawn, so arrow age (now - t) and ball age (now - BALL_SPAWN)
    // land on the same point of the path.
    const s = (t - BALL_SPAWN) / 1000;
    out.push({
      id: `pp-${k}-${isAnti ? "anti" : "pro"}`,
      spawnAt: t, duration: L.responseWindowMs,
      kind: "go", zone: "center",
      position: [0, CY, Z],
      // ride the ball: same amplitude and rate, phase advanced to the ball's phase at time t
      wander: { ax: AX, ay: AY, wx, wy, px: pxb + wx * s, py: pyb + wy * s },
      requiredDirection: answer,
      color: isAnti ? RED : TEAL, emissive: isAnti ? RED : TEAL,
      shape: "arrow", scale: arrowScale,
      meta: { pointDir: dir, axes: 8, anti: isAnti, ...(L.flashChance > 0 && rng() < L.flashChance ? { flicker: true } : {}) },
    });
    t += L.arrowMs + L.itiMs;
    k++;
  }
  return out;
}

const levels: ProgressionLevel[] = Array.from({ length: 100 }, (_, i) => {
  const L = ppLevel(i + 1);
  const extra = [
    L.distractorCount ? `${L.distractorCount} distractor${L.distractorCount > 1 ? "s" : ""}` : "",
    L.antiSaccadeChance ? `${Math.round(L.antiSaccadeChance * 100)}% anti` : "",
  ].filter(Boolean).join(" · ");
  return {
    level: i + 1,
    label: `L${i + 1} · ${L.pattern} · ${Math.round(L.speed)}px/s · ${Math.round(L.responseWindowMs)}ms${extra ? " · " + extra : ""}`,
    parameters: { level: i + 1 },
  };
});

export const PursuitPulse: DrillDefinition = {
  id: "pursuit-pulse",
  name: "Pursuit Pulse",
  shortName: "Pursuit Pulse",
  phase: "Synchronize",
  interaction: "touch",
  responseMode: "joystick",
  eightWay: true,
  authoredLadder: true,
  hardStop: true,
  environment: "arena",
  mvp: true,
  description:
    "Track the gliding ball with your eyes for 60 seconds. When it flashes an arrow, flick the stick: TEAL = the way it points, RED = the opposite (anti-saccade). 100 levels: the ball speeds up, shrinks, and takes a more chaotic path; the window tightens; distractors and inversions arrive. Holding smooth pursuit while resolving the cue is the whole test.",
  purpose: "Smooth pursuit under a concurrent directional decision — track-and-decide.",
  instructions: [
    "1. TRACK the moving ball with your eyes. Keep it centred in your gaze.",
    "2. When it shows an ARROW, FLICK the stick before the arrow disappears.",
    "3. TEAL arrow: flick the way it points. RED arrow: flick the OPPOSITE way.",
    "4. Don't stop tracking to answer - if you lose the ball you lose the next arrow.",
    "5. 60 seconds. Higher levels add moving distractors and faster, shorter cues.",
  ],
  controlsHint: "TRACK THE BALL  ·  TEAL ARROW = ITS WAY  ·  RED ARROW = OPPOSITE",
  levels,
  buildTrials: (params, rng) => buildPPTrials((params.level as number) ?? 1, rng),

  analyze: (events) => {
    const ev = events.filter((e) => e.trialId.startsWith("pp-") && (e.trialId.includes("-pro") || e.trialId.includes("-anti")));
    if (!ev.length) return [];
    const pro = ev.filter((e) => e.trialId.includes("-pro"));
    const anti = ev.filter((e) => e.trialId.includes("-anti"));
    const mean = (v: number[]) => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0);
    const acc = (g: typeof ev) => (g.length ? Math.round((g.filter((e) => e.correct).length / g.length) * 100) : 0);
    const rt = (g: typeof ev) => mean(g.filter((e) => e.correct && e.reactionMs !== undefined).map((e) => e.reactionMs!));

    const notes = [
      `Cues resolved under pursuit: ${acc(ev)}% of ${ev.length}, ${rt(ev)}ms mean.`,
    ];
    if (anti.length) {
      notes.push(`Anti-saccade cues: ${acc(anti)}% correct vs ${acc(pro)}% pro — the cost of inverting the response while tracking.`);
    }
    if (acc(ev) < 55) {
      notes.push("Cue accuracy is low — the athlete is likely dropping pursuit to read each arrow, then reacquiring the ball. Slow down and keep the ball first.");
    }
    return notes;
  },

  durationMs: () => DURATION,
};
