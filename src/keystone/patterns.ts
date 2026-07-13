import type {
  EndpointZone, MovementPhase, StimulusKind, BodyRole, Segment, KeyTuning, ForceVector,
} from "./types";

export type V3 = [number, number, number];

/**
 * THE MOVEMENT-PATTERN LIBRARY and the SAFETY VALIDATOR (§13, §45).
 *
 * This is the most safety-critical file in the entire suite. Every other drill
 * asks the athlete to reach for a thing that the engine placed. This one tells
 * the athlete to PUT THEIR BODY somewhere. A bad endpoint here is not a missed
 * target — it is a shoulder at end range, or two controllers arriving at the
 * same point in space at the same moment, which is a real collision with real
 * knuckles.
 *
 * So safety is a CONSTRUCTION CONSTRAINT, not a filter. Endpoints are clamped
 * into the safe envelope as they are built. A rejection loop can starve; a clamp
 * cannot, and a starved generator under load would silently start emitting
 * whatever it had left.
 */

/** Neutral athletic stance. The athlete stands here and does not step. */
export const NEUTRAL = {
  head: [0, 1.62, 0] as V3,
  left: [-0.22, 1.20, -0.28] as V3,
  right: [0.22, 1.20, -0.28] as V3,
};

/**
 * THE SAFE ENVELOPE. Defaults; calibration scales them per athlete (§44).
 * Every one of these numbers exists because violating it hurts someone.
 */
export const SAFE = {
  /** shoulder-safe: no reaching further out than this */
  maxLateral: 0.72,
  /** no extreme overhead (impingement), no floor-scraping (flexion under load) */
  minY: 0.82,
  maxY: 1.92,
  /** never behind the coronal plane — that is where shoulders get hurt */
  minZ: -0.85,
  maxZ: 0.10,
  /** the two controllers may never be commanded closer than this. Knuckles. */
  minHandSeparation: 0.22,
  /** neither hand may be commanded into this sphere around the head. Face. */
  headClearance: 0.28,
  /** cross-body is allowed, but bounded — no wrapping the arm across the chest */
  maxCrossBody: 0.16,
  /** head yaw/pitch limits — comfortable, not end-range cervical rotation */
  maxYaw: 0.62,      // ~35deg
  maxPitch: 0.36,    // ~20deg
  /** the torso proxy may not be displaced further than this from neutral */
  maxTorso: 0.20,
  /** a hold longer than this becomes an isometric endurance task, not a drill */
  maxHoldMs: 2200,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Clamp one commanded hand position into the safe envelope. */
function safeHand(p: V3, side: "left" | "right"): V3 {
  const x = clamp(p[0], -SAFE.maxLateral, SAFE.maxLateral);
  const y = clamp(p[1], SAFE.minY, SAFE.maxY);
  const z = clamp(p[2], SAFE.minZ, SAFE.maxZ);
  // bound cross-body: a left hand may cross the midline, but only a little
  const bounded = side === "left"
    ? Math.min(x, SAFE.maxCrossBody)
    : Math.max(x, -SAFE.maxCrossBody);
  return [bounded, y, z];
}

/**
 * THE VALIDATOR. Exported so the test harness can hammer it directly against
 * millions of generated endpoints — which it does.
 */
export function validateEndpoint(e: EndpointZone): string[] {
  const bad: string[] = [];
  for (const [name, p] of [["left", e.left], ["right", e.right]] as [string, V3][]) {
    if (Math.abs(p[0]) > SAFE.maxLateral + 1e-6) bad.push(`${name}: beyond shoulder-safe lateral reach`);
    if (p[1] < SAFE.minY - 1e-6 || p[1] > SAFE.maxY + 1e-6) bad.push(`${name}: beyond safe vertical range`);
    if (p[2] < SAFE.minZ - 1e-6 || p[2] > SAFE.maxZ + 1e-6) bad.push(`${name}: behind the coronal plane`);
    if (dist(p, NEUTRAL.head) < SAFE.headClearance - 1e-6) bad.push(`${name}: commanded into the head`);
  }
  // THE COLLISION CHECK. Two controllers converging on the same point is the
  // single most likely way to actually injure someone in this drill.
  if (dist(e.left, e.right) < SAFE.minHandSeparation - 1e-6) {
    bad.push("hands commanded into a collision");
  }
  // cross-body must be bounded on BOTH hands
  if (e.left[0] > SAFE.maxCrossBody + 1e-6) bad.push("left hand wraps too far across the body");
  if (e.right[0] < -SAFE.maxCrossBody - 1e-6) bad.push("right hand wraps too far across the body");

  if (e.headYaw !== undefined && Math.abs(e.headYaw) > SAFE.maxYaw + 1e-6) bad.push("head yaw beyond comfortable rotation");
  if (e.headPitch !== undefined && Math.abs(e.headPitch) > SAFE.maxPitch + 1e-6) bad.push("head pitch beyond comfortable range");
  if (e.torsoMaxM > SAFE.maxTorso + 1e-6) bad.push("torso displacement beyond safe range");
  if (e.holdMs > SAFE.maxHoldMs + 1e-6) bad.push("hold is an isometric endurance task, not a drill");
  if (e.tolM <= 0) bad.push("endpoint tolerance is zero — unsatisfiable");
  return bad;
}

/** Build a safe endpoint from a desired pair of hand positions. */
export function makeEndpoint(
  wantL: V3, wantR: V3, tune: KeyTuning,
  opts: { headYaw?: number; headPitch?: number; hold?: number; torso?: number } = {},
): EndpointZone {
  let left = safeHand(wantL, "left");
  let right = safeHand(wantR, "right");

  // SEPARATE THE HANDS. If the pattern wants them together, push them apart along
  // the axis that already separates them, symmetrically, until they clear.
  const d = dist(left, right);
  if (d < SAFE.minHandSeparation) {
    const need = (SAFE.minHandSeparation - d) / 2 + 0.01;
    const axis: V3 = d > 1e-4
      ? [(left[0] - right[0]) / d, (left[1] - right[1]) / d, (left[2] - right[2]) / d]
      : [-1, 0, 0]; // degenerate: identical points. Split them laterally.
    left = safeHand([left[0] + axis[0] * need, left[1] + axis[1] * need, left[2] + axis[2] * need], "left");
    right = safeHand([right[0] - axis[0] * need, right[1] - axis[1] * need, right[2] - axis[2] * need], "right");
  }
  // PUSH THE HANDS OUT OF THE FACE. Down and forward, never sideways through it.
  for (const h of [left, right]) {
    if (dist(h, NEUTRAL.head) < SAFE.headClearance) {
      h[1] = Math.min(h[1], NEUTRAL.head[1] - SAFE.headClearance * 0.75);
      h[2] = Math.min(h[2], -0.24);
    }
  }

  /**
   * THE MOVEMENT MUST BE A MOVEMENT.
   *
   * Beginner has a generous 22cm endpoint tolerance — and several patterns placed
   * their endpoint less than 22cm from the neutral stance. The zone therefore
   * already CONTAINED the athlete's resting hands, and the entire tier could be
   * completed by standing perfectly still: instant "arrival" at GO, no movement
   * onset ever recorded, and a timing error of nearly a full second on every
   * single rep. The easiest tier in the drill was a no-op.
   *
   * So every endpoint is pushed out to at least 1.8x its own tolerance from
   * neutral. If we are going to allow a wide margin for error, the target has to
   * be far enough away that the margin still requires a real reach.
   */
  const minTravel = Math.max(0.20, tune.endpointTolM * 1.8);
  for (const [h, neutral] of [[left, NEUTRAL.left], [right, NEUTRAL.right]] as [V3, V3][]) {
    const d = dist(h, neutral);
    if (d >= minTravel) continue;
    const away: V3 = d > 1e-4
      ? [(h[0] - neutral[0]) / d, (h[1] - neutral[1]) / d, (h[2] - neutral[2]) / d]
      : [h === left ? -1 : 1, 0.3, -0.4];
    const mag = Math.hypot(...away) || 1;
    const push = minTravel - d + 0.01;
    const out = safeHand([
      h[0] + (away[0] / mag) * push,
      h[1] + (away[1] / mag) * push,
      h[2] + (away[2] / mag) * push,
    ], h === left ? "left" : "right");
    h[0] = out[0]; h[1] = out[1]; h[2] = out[2];
  }
  // re-separate after the push, in case it drove the hands together
  if (dist(left, right) < SAFE.minHandSeparation) {
    left[0] = Math.min(left[0], -SAFE.minHandSeparation / 2);
    right[0] = Math.max(right[0], SAFE.minHandSeparation / 2);
  }

  /**
   * HEAD CLEARANCE HAS THE LAST WORD.
   *
   * The min-travel push above solved one problem and created another: pushing a
   * hand "away from neutral" can push it straight into the athlete's face. So the
   * face check runs LAST, after every other adjustment, and it wins. Order of
   * operations in a safety clamp is not a detail — an earlier version cleared the
   * head and then moved the hand again, which is the same as never clearing it.
   */
  for (const h of [left, right]) {
    let guard = 0;
    while (dist(h, NEUTRAL.head) < SAFE.headClearance && guard++ < 8) {
      const d = dist(h, NEUTRAL.head) || 1e-4;
      const away: V3 = [
        (h[0] - NEUTRAL.head[0]) / d,
        (h[1] - NEUTRAL.head[1]) / d,
        (h[2] - NEUTRAL.head[2]) / d,
      ];
      // never push UP and never push BACK toward the face — down and forward only
      const dir: V3 = [away[0], Math.min(away[1], -0.35), Math.min(away[2], -0.35)];
      const m = Math.hypot(...dir) || 1;
      const push = SAFE.headClearance - d + 0.02;
      const out = safeHand([
        h[0] + (dir[0] / m) * push,
        h[1] + (dir[1] / m) * push,
        h[2] + (dir[2] / m) * push,
      ], h === left ? "left" : "right");
      h[0] = out[0]; h[1] = out[1]; h[2] = out[2];
    }
  }
  // and one final separation pass, because clearing the head can converge them
  if (dist(left, right) < SAFE.minHandSeparation) {
    left[0] = Math.min(left[0], -SAFE.minHandSeparation / 2 - 0.01);
    right[0] = Math.max(right[0], SAFE.minHandSeparation / 2 + 0.01);
  }

  return {
    left, right,
    tolM: tune.endpointTolM,
    headYaw: opts.headYaw !== undefined ? clamp(opts.headYaw, -SAFE.maxYaw, SAFE.maxYaw) : undefined,
    headPitch: opts.headPitch !== undefined ? clamp(opts.headPitch, -SAFE.maxPitch, SAFE.maxPitch) : undefined,
    headTolRad: 0.16 + (1 - tune.stimulusSpeed) * 0.06,
    torsoMaxM: Math.min(SAFE.maxTorso, opts.torso ?? SAFE.maxTorso),
    holdMs: Math.min(SAFE.maxHoldMs, opts.hold ?? tune.holdMs),
    stabilityTolM: tune.stabilityTolM,
  };
}

// --------------------------------------------------------------- ROLE HELPERS
const ROLES = (h: BodyRole, t: BodyRole, l: BodyRole, r: BodyRole): Record<Segment, BodyRole> =>
  ({ head: h, torso: t, left: l, right: r });

/**
 * THE PATTERN LIBRARY. Each entry returns the endpoint AND the role assignment,
 * because in this drill they are inseparable — "left hand high" means nothing
 * without knowing whether the right hand is supposed to follow it or hold still.
 */
export function buildPhase(
  kind: StimulusKind,
  tune: KeyTuning,
  rng: () => number,
  dueMs: number,
): MovementPhase {
  const reach = 0.30 + rng() * 0.28;
  const high = 1.52 + rng() * 0.26;
  const low = 0.95 + rng() * 0.18;
  const mid = 1.24 + rng() * 0.12;
  const asym = rng() < tune.asymmetry;
  const headActive = rng() < tune.headInvolve;
  const conflict = rng() < tune.headHandConflict;

  let roles: Record<Segment, BodyRole>;
  let ep: EndpointZone;
  let force: ForceVector | undefined;

  switch (kind) {
    case "expand": {
      // hands travel OUTWARD. Symmetric, or one side further than the other.
      const lx = -(reach + (asym ? rng() * 0.18 : 0));
      const rx = reach + (asym ? rng() * 0.18 : 0);
      roles = ROLES(headActive ? "hold" : "neutral", "stabilize", "move", "move");
      ep = makeEndpoint([lx, asym ? high : mid, -0.32], [rx, mid, -0.32], tune,
        { headYaw: headActive ? 0 : undefined });
      break;
    }
    case "compress": {
      // hands travel INWARD toward centre — and must DECELERATE, not collide.
      // The validator guarantees they are never commanded closer than 22cm.
      roles = ROLES("neutral", "stabilize", "move", "move");
      ep = makeEndpoint([-0.13, mid, -0.30], [0.13, mid, -0.30], tune);
      break;
    }
    case "rotate": {
      const dir = rng() < 0.5 ? -1 : 1;
      roles = ROLES("move", "move", "move", "move");
      ep = makeEndpoint(
        [-reach * 0.8 + dir * 0.1, mid, -0.30],
        [reach * 0.8 + dir * 0.1, mid, -0.30],
        tune, { headYaw: dir * (0.3 + rng() * 0.28), torso: 0.14 },
      );
      break;
    }
    case "counter": {
      /**
       * COUNTER-ROTATION. The head goes one way, a hand goes the other, and the
       * opposite hand anchors. This is the pattern that most reliably separates
       * athletes: the vestibular pull to let the arm follow the head is powerful,
       * and resisting it is a trained skill.
       */
      const dir = rng() < 0.5 ? -1 : 1;
      roles = dir < 0
        ? ROLES("move", "stabilize", "hold", "move")
        : ROLES("move", "stabilize", "move", "hold");
      ep = makeEndpoint(
        dir < 0 ? [-0.1, mid, -0.26] : [-reach, high, -0.32],
        dir < 0 ? [reach, high, -0.32] : [0.1, mid, -0.26],
        tune, { headYaw: dir * (0.34 + rng() * 0.22) },
      );
      break;
    }
    case "pulse": {
      roles = ROLES("neutral", "stabilize", "move", "move");
      ep = makeEndpoint([-reach * 0.7, mid, -0.36], [reach * 0.7, mid, -0.36], tune, { hold: 160 });
      break;
    }
    case "hold":
    case "stabilize": {
      /**
       * STABILIZE. The athlete holds position while the visual field keeps moving
       * around them. This is the inverse of every other drill in the suite: the
       * correct answer is to NOT respond to motion, which is exactly the reflex
       * every other drill has trained.
       */
      roles = ROLES(headActive ? "stabilize" : "neutral", "stabilize", "hold", "hold");
      ep = makeEndpoint([-reach * 0.6, mid, -0.30], [reach * 0.6, mid, -0.30], tune,
        { hold: tune.holdMs * (kind === "stabilize" ? 1.3 : 1) });
      break;
    }
    case "release": {
      roles = ROLES("neutral", "stabilize", "move", "move");
      ep = makeEndpoint([-reach, mid, -0.34], [reach, mid, -0.34], tune, { hold: 120 });
      break;
    }
    case "align":
    case "recovery": {
      roles = ROLES(headActive ? "hold" : "neutral", "stabilize", "move", "move");
      ep = makeEndpoint([-reach * 0.75, mid, -0.30], [reach * 0.75, mid, -0.30], tune,
        { headYaw: headActive ? 0 : undefined });
      break;
    }
    case "split": {
      // each hand gets a DIFFERENT rule: one moves, one holds
      const leftMoves = rng() < 0.5;
      roles = ROLES("neutral", "stabilize", leftMoves ? "move" : "stabilize", leftMoves ? "stabilize" : "move");
      ep = makeEndpoint(
        leftMoves ? [-reach, high, -0.34] : [NEUTRAL.left[0], NEUTRAL.left[1], NEUTRAL.left[2]],
        leftMoves ? [NEUTRAL.right[0], NEUTRAL.right[1], NEUTRAL.right[2]] : [reach, high, -0.34],
        tune,
      );
      break;
    }
    case "absorb":
    case "redirect":
    case "oppose" as StimulusKind: {
      const from: V3 = [(rng() * 2 - 1) * 0.8, 1.1 + rng() * 0.6, -3.2];
      const len = Math.hypot(...from) || 1;
      force = {
        dir: [-from[0] / len, -from[1] / len, -from[2] / len],
        magnitude: 0.5 + rng() * 0.5,
        curvature: tune.forceCurve * rng(),
        impactMs: 500 + rng() * 500,
        response: kind === "absorb" ? "absorb" : "redirect",
        redirectTo: kind === "redirect"
          ? [rng() < 0.5 ? -1 : 1, 0.3, -0.6] : undefined,
      };
      roles = kind === "absorb"
        ? ROLES("hold", "stabilize", "move", "move")          // symmetric wall
        : ROLES("neutral", "stabilize", "move", "stabilize"); // one deflects, one anchors
      ep = kind === "absorb"
        ? makeEndpoint([-0.24, mid, -0.42], [0.24, mid, -0.42], tune)
        : makeEndpoint([-reach * 0.9, mid + 0.1, -0.38], [NEUTRAL.right[0], NEUTRAL.right[1], NEUTRAL.right[2]], tune);
      break;
    }
    case "sync":
    case "desync": {
      roles = ROLES("neutral", "stabilize", "move", "move");
      ep = makeEndpoint([-reach, asym ? high : mid, -0.32], [reach, asym ? low : mid, -0.32], tune);
      break;
    }
    case "noGo":
    case "cancel": {
      // NOTHING moves. The endpoint is neutral, and reaching it is a failure.
      roles = ROLES("inhibit", "inhibit", "inhibit", "inhibit");
      ep = makeEndpoint(NEUTRAL.left, NEUTRAL.right, tune, { hold: 400 });
      break;
    }
    case "transition":
    case "reverse":
    case "mirror":
    default: {
      const lead: BodyRole = rng() < 0.5 ? "lead" : "delay";
      roles = ROLES(
        headActive ? (conflict ? "oppose" : "move") : "neutral",
        "stabilize",
        asym ? lead : "move",
        asym ? (lead === "lead" ? "delay" : "lead") : "move",
      );
      ep = makeEndpoint([-reach, asym ? high : mid, -0.32], [reach, asym ? low : mid, -0.32], tune,
        { headYaw: headActive ? (conflict ? -0.3 : 0.3) : undefined });
      break;
    }
  }

  /**
   * BILATERAL OFFSET (§19). A SYNC phase demands the hands arrive together; a
   * DESYNC phase demands they arrive DELIBERATELY APART, by a specified amount.
   * Both are hard, and they are hard in opposite ways — the second is harder,
   * because bilateral coupling is the default state of the motor system and
   * breaking it on purpose takes real control.
   */
  let bilateralOffsetMs = 0;
  if (kind === "desync" || rng() < tune.desyncRate) {
    bilateralOffsetMs = (rng() < 0.5 ? -1 : 1) * (150 + rng() * 250);
  }

  return { kind, roles, endpoint: ep, dueMs, timingWindowMs: tune.timingWindowMs, force, bilateralOffsetMs };
}

/** Straight-line ideal path length for a phase — the denominator of efficiency. */
export function idealPath(from: { left: V3; right: V3 }, ep: EndpointZone): number {
  return dist(from.left, ep.left) + dist(from.right, ep.right);
}
