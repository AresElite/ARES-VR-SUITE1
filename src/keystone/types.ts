/**
 * A.R.E.S. KEYSTONE
 * Whole-body visual-motor integration and stimulus synchronization.
 *
 * Named for the stone that locks an arch: every element holds every other one
 * in place, and removing any single one collapses the whole. That is precisely
 * what this drill measures — not whether the athlete can hit a thing, but
 * whether head, torso, and both arms can operate as ONE connected system.
 *
 * The identity, and the thing that separates it from AEGIS and Sequence Command:
 *
 *   visual stimulus -> WHOLE-BODY ORGANIZATION -> coordinated pattern -> timed
 *   stabilization
 *
 * There is no target to hit. There is a BODY POSITION to arrive at, on time,
 * with the correct segments moving and the correct segments holding still — and
 * then to STABILIZE in, while the visual field keeps moving around you.
 *
 * The hardest thing in this drill is not moving. It is stopping.
 */

// ------------------------------------------------------------------ SEGMENTS
export type Segment = "head" | "torso" | "left" | "right";

/**
 * What a segment has been told to do (§9). At Beginner one or two of these are
 * live; at GOAT all four carry different, sometimes opposing roles.
 */
export type BodyRole =
  | "move"        // travel to the endpoint
  | "hold"        // arrive and stay — the stabilization demand
  | "stabilize"   // do NOT move, actively resist the visual pull
  | "oppose"      // move in the direction opposite the stimulus
  | "lead"        // initiate BEFORE the other segments
  | "delay"       // initiate AFTER the other segments
  | "inhibit"     // do nothing. Any motion is an error.
  | "neutral";    // unconstrained

// ---------------------------------------------------------------- STIMULI (§7)
export type StimulusKind =
  | "align"        // organize into a defined coordinated posture
  | "expand"       // hands travel outward from centre
  | "compress"     // hands travel inward toward centre
  | "rotate"       // controlled head/torso rotation with coordinated arms
  | "counter"      // segments move in OPPOSING directions
  | "pulse"        // a brief, precisely timed movement and return
  | "hold"         // reach a position and maintain it
  | "release"      // exit a held posture at the correct moment
  | "redirect"     // a force vector arrives and must be sent elsewhere
  | "absorb"       // receive a force with a stable bilateral posture
  | "stabilize"    // hold organization while the world moves around you
  | "transition"   // move pattern -> pattern WITHOUT returning to neutral
  | "noGo"         // inhibit completely
  | "cancel"       // a prepared movement must be aborted before execution
  | "reverse"      // the active pattern inverts
  | "mirror"       // left/right roles swap
  | "split"        // each hand gets a DIFFERENT rule
  | "sync"         // both hands must ARRIVE TOGETHER
  | "desync"       // hands must arrive at DIFFERENT times, per the rule
  | "recovery";    // the simplified pattern used to rebuild after a failure

/** Commands that FORBID motion. Moving is a critical error. */
export const INHIBIT_STIMULI: StimulusKind[] = ["noGo", "cancel"];

/**
 * REDUNDANT CODING (§8). Never colour alone. Each stimulus family owns a colour,
 * a silhouette, an orientation, and a motion signature — any one of which is
 * sufficient to identify it. If colour were load-bearing we would be measuring
 * colour vision and calling it synchronization.
 */
export const STIMULUS_VISUAL: Record<StimulusKind, {
  color: string; shape: string; motion: string; label: string;
}> = {
  align:      { color: "#8B5CF6", shape: "frame",    motion: "settle",   label: "ALIGN" },
  expand:     { color: "#2998AA", shape: "outward",  motion: "unfold",   label: "EXPAND" },
  compress:   { color: "#2998AA", shape: "inward",   motion: "fold",     label: "COMPRESS" },
  rotate:     { color: "#8B5CF6", shape: "arc",      motion: "sweep",    label: "ROTATE" },
  counter:    { color: "#C9A6FF", shape: "opposed",  motion: "shear",    label: "COUNTER" },
  pulse:      { color: "#E8E9F0", shape: "spike",    motion: "flash",    label: "PULSE" },
  hold:       { color: "#2998AA", shape: "ring",     motion: "steady",   label: "HOLD" },
  release:    { color: "#E8E9F0", shape: "openRing", motion: "burst",    label: "RELEASE" },
  redirect:   { color: "#C9A6FF", shape: "vane",     motion: "deflect",  label: "REDIRECT" },
  absorb:     { color: "#8B5CF6", shape: "wall",     motion: "press",    label: "ABSORB" },
  stabilize:  { color: "#2998AA", shape: "anchor",   motion: "swirl",    label: "STABILIZE" },
  transition: { color: "#C9A6FF", shape: "chevron",  motion: "flow",     label: "TRANSITION" },
  noGo:       { color: "#6A7086", shape: "bar",      motion: "still",    label: "NO-GO" },
  cancel:     { color: "#FF4D6D", shape: "cross",    motion: "snap",     label: "CANCEL" },
  reverse:    { color: "#C9A6FF", shape: "uturn",    motion: "invert",   label: "REVERSE" },
  mirror:     { color: "#C9A6FF", shape: "mirror",   motion: "flip",     label: "MIRROR" },
  split:      { color: "#E8E9F0", shape: "fork",     motion: "diverge",  label: "SPLIT" },
  sync:       { color: "#2998AA", shape: "converge", motion: "lock",     label: "SYNC" },
  desync:     { color: "#E8E9F0", shape: "stagger",  motion: "offset",   label: "DESYNC" },
  recovery:   { color: "#2998AA", shape: "frame",    motion: "settle",   label: "RESET" },
};

// -------------------------------------------------------------- ENDPOINT ZONES
/**
 * We do NOT do skeletal tracking, and we do not pretend to (§10). A Quest gives
 * us a headset and two controllers. Everything about "posture" here is INFERRED
 * from the geometry those three points make with each other — and the metrics
 * are named accordingly. There are no claims about spines or hips anywhere in
 * this file, because we cannot see spines or hips.
 *
 * An endpoint is a TOLERANCE ZONE, not an anatomical pose. It says: your left
 * hand belongs roughly here, your right hand roughly there, your head pointing
 * roughly this way, and your torso proxy no further than this from neutral.
 */
export interface EndpointZone {
  /** target position for each hand, in calibrated body-relative units */
  left: [number, number, number];
  right: [number, number, number];
  /** how far off the mark a hand may be and still count (metres) */
  tolM: number;
  /** required head yaw/pitch, radians. undefined = head unconstrained */
  headYaw?: number;
  headPitch?: number;
  headTolRad: number;
  /** maximum permitted torso-proxy displacement from neutral (metres) */
  torsoMaxM: number;
  /** how long the position must be HELD, and how still (m of drift allowed) */
  holdMs: number;
  stabilityTolM: number;
}

/** One phase of a multi-stage movement event (§17). */
export interface MovementPhase {
  kind: StimulusKind;
  roles: Record<Segment, BodyRole>;
  endpoint: EndpointZone;
  /** ms from event GO at which this phase must be satisfied */
  dueMs: number;
  timingWindowMs: number;
  /** force vector, if this phase carries one (§11) */
  force?: ForceVector;
  /** bilateral timing rule: 0 = arrive together; >0 = right arrives this late */
  bilateralOffsetMs: number;
}

/** An abstract directional field — never a ball, block, punch, or weapon (§11). */
export interface ForceVector {
  /** unit direction of travel */
  dir: [number, number, number];
  magnitude: number;
  curvature: number;
  /** ms from phase start at which it arrives */
  impactMs: number;
  /** what the athlete must do with it */
  response: "absorb" | "redirect" | "oppose" | "evade";
  /** for redirect: the direction it must be sent */
  redirectTo?: [number, number, number];
}

// ------------------------------------------------------------------- EVENTS
export type KeyOutcome =
  | "correct"
  // ---- CRITICAL: these stop the active pattern and trigger recovery (§25)
  | "wrongPattern"
  | "prohibited"        // moved during a no-go
  | "bilateralReversal" // left did the right's job and vice versa
  | "unsafeRange"       // exceeded the calibrated safe envelope
  | "failedRuleChange"
  // ---- NON-CRITICAL: the pattern continues (§25)
  | "timing"
  | "endpointMiss"
  | "stabilityFail"     // arrived, could not hold
  | "incompleteRange"
  | "asymmetry"
  | "missedTransition"
  | "earlyRelease"
  | "lateInitiation"
  | "overshoot"
  | "falseStart";       // moved before the go — leakage

export const CRITICAL_OUTCOMES: KeyOutcome[] = [
  "wrongPattern", "prohibited", "bilateralReversal", "unsafeRange", "failedRuleChange",
];

/** Where in the loop the athlete actually broke (§24). */
export type BreakdownDomain =
  | "interpretation"  // misread the stimulus
  | "selection"       // read it, chose the wrong pattern
  | "initiation"      // chose right, started at the wrong time
  | "bilateral"       // the two sides did not agree
  | "headHand"        // head and hands did not integrate
  | "torsoArm"
  | "direction"
  | "endpoint"        // got there, but not to the right place
  | "stabilization"   // got there, could not STOP there
  | "inhibition"      // could not withhold
  | "transition"      // could not move pattern-to-pattern
  | "adaptation"      // could not absorb a live rule change
  | "efficiency";     // got there, but wastefully

export interface KeyEvent {
  t: number;
  eventId: string;
  phaseIdx: number;
  kind: StimulusKind;
  outcome: KeyOutcome;
  correct: boolean;
  critical: boolean;
  breakdown?: BreakdownDomain;

  /**
   * PRIMARY METRIC (§31): actionable visual cue -> first VALID COORDINATED
   * movement onset. Deliberately not "first controller motion" — a twitch is not
   * an initiation, and counting it would reward fidgeting.
   */
  initiationMs?: number;
  /** cue -> endpoint reached */
  toEndpointMs?: number;
  /** signed timing error vs the required arrival: + late, - early */
  timingErrorMs?: number;

  // ---- bilateral (§19)
  leftInitMs?: number;
  rightInitMs?: number;
  initiationGapMs?: number;   // |left - right|
  arrivalGapMs?: number;
  /** the gap the RULE asked for — a desync event WANTS a nonzero gap */
  requiredGapMs?: number;

  // ---- endpoint & stability (§21)
  leftErrM?: number;
  rightErrM?: number;
  headErrRad?: number;
  torsoErrM?: number;
  /** RMS drift during the hold — the stabilization measure */
  driftM?: number;
  overshootM?: number;
  corrections?: number;

  // ---- efficiency (§22)
  pathLeftM?: number;
  pathRightM?: number;
  /** actual path / straight-line ideal. 1.0 = perfect. */
  pathRatio?: number;
  headTravelM?: number;

  /** perfect / good / poor, on the endpoint (shared suite-wide localization) */
  precisionZone?: import("@/ares/precision").PrecisionZone;

  predictive: boolean;   // could the athlete have anticipated this (§15)
  scoreDelta: number;
  bonusStage?: number;
}

export type KeyTier = "beginner" | "intermediate" | "advanced" | "pro" | "goat";
export type KeyMode = "training" | "assessment";
export type SessionPhase = "main" | "bonus" | "complete";

export interface KeySettings {
  tier: KeyTier;
  mode: KeyMode;
  bonusEnabled: boolean;
  custom?: Partial<KeyTuning>;
}

/** Every knob (§23, §29). */
export interface KeyTuning {
  stimulusSpeed: number;       // how fast the visual field develops
  prepMs: number;              // cue -> GO
  timingWindowMs: number;
  endpointTolM: number;
  holdMs: number;
  stabilityTolM: number;
  phasesMin: number;           // multi-stage depth (§17)
  phasesMax: number;
  asymmetry: number;           // share of patterns with different L/R roles
  headInvolve: number;         // share with an active head role
  torsoInvolve: number;
  headHandConflict: number;    // head and hands told to do OPPOSING things
  rhythmVariance: number;      // 0 = metronome, 1 = deceptive
  forceRate: number;           // share of phases carrying a force vector
  forceCurve: number;
  transformRate: number;
  inhibitRate: number;
  falsePulseRate: number;      // preparation cues that must NOT be acted on
  transitionRate: number;      // pattern->pattern with no neutral reset
  desyncRate: number;          // intentional bilateral offset
  asyncStreams: boolean;       // independent L/R rhythms
  predictiveMix: number;       // 0 = all reactive, 1 = all predictable
  simultaneous: number;        // concurrent demands
  feedback: number;
  haptics: number;
  durationMs: number;
}
