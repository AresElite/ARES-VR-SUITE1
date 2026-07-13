/**
 * A.R.E.S. SEQUENCE COMMAND
 *
 * The athlete is not repeating a pattern. They are COMMANDING A CHANGING ACTION
 * PLAN — and the plan changes after they have already committed to it.
 *
 * The loop, literally:
 *   ACQUIRE      cues arrive in the PERIPHERY. Never in front of you.
 *   ROUTE        hold them through a delay, read the CENTRAL command, apply it
 *   EXECUTE      correct hand, correct action, correct zone, correct ORDER
 *   SYNCHRONIZE  two streams, asynchronous, updating independently, under load
 *
 * The single design line that separates this from a memory game: the central
 * command can arrive AFTER encoding and can change DURING execution. Memory is
 * necessary but never sufficient. An athlete with a perfect span who cannot
 * re-plan mid-swing will fail here, and that failure is the measurement.
 */

// ---------------------------------------------------------------- PERIPHERAL
/** Where a cue can appear. Always inside the safe forward field (§7). */
export type CueZone =
  | "upLeft" | "upRight" | "downLeft" | "downRight"   // the four fixed quadrants
  | "farLeft" | "farRight"                            // wide arc (Advanced+)
  | "upFarLeft" | "upFarRight" | "downFarLeft" | "downFarRight"; // deep (Pro+)

export const QUADRANTS: CueZone[] = ["upLeft", "upRight", "downLeft", "downRight"];
export const WIDE_ARC: CueZone[] = [...QUADRANTS, "farLeft", "farRight"];
export const DEEP_ARC: CueZone[] = [...WIDE_ARC, "upFarLeft", "upFarRight", "downFarLeft", "downFarRight"];

/** What the athlete must DO with a cue when its slot comes up (§13). */
export type SeqAction = "strike" | "block" | "catch" | "hold" | "trace" | "inhibit";

/** Which hand. */
export type SeqHand = "left" | "right";

/** Vertical execution band (§6 Pro: high/middle/low zones). */
export type SeqBand = "high" | "mid" | "low";

/**
 * A PERIPHERAL CUE — one element of the sequence to be encoded.
 *
 * REDUNDANT CODING (§8). Identity is carried FOUR independent ways: colour,
 * silhouette, symbol, and position. Any one of them is sufficient. This is not
 * an accessibility mode bolted on the side — it is the only mode, for every
 * athlete, because if colour were load-bearing we would be measuring colour
 * vision and calling it working memory.
 */
export interface Cue {
  id: string;
  zone: CueZone;
  hand: SeqHand;
  action: SeqAction;
  band: SeqBand;
  /** presentation time, ms from sequence start */
  atMs: number;
  /** a DISTRACTOR must be encoded as noise and never executed (§12, §25) */
  distractor: boolean;
  /** ANTI-SACCADIC: the most salient cue on screen, which the rule may forbid (§25) */
  salient: boolean;
  /** which of two competing sequences this cue belongs to (Advanced+, §10) */
  stream: "A" | "B";
}

// ------------------------------------------------------------------- CENTRAL
/**
 * The CENTRAL COMMAND converts peripheral information into an action plan (§9).
 * This is the pivot of the whole drill. Everything before it is intake;
 * everything after it is execution; the command is where thinking happens.
 */
export type CentralCommand =
  | "execute"        // play the sequence as encoded
  | "selectA"        // two sequences were shown — A is the live one
  | "selectB"
  | "reverse"        // play it backwards
  | "repeat"         // play it twice
  | "mirror"         // every hand assignment flips
  | "mirrorSpatial"  // hands AND zones flip (GOAT)
  | "skip"           // omit one named position
  | "replace"        // one or more positions are overwritten, live
  | "branchLeft"     // take the left branch
  | "branchRight"
  | "combine"        // splice two chunks together
  | "oppositeHand"   // execute with the hand NOT indicated — anti-saccadic
  | "oppositeCue"    // execute the cue you were NOT drawn to — anti-saccadic
  | "wait"           // do nothing until resume
  | "hold"           // freeze mid-sequence at a checkpoint
  | "resume"
  | "cancel"         // abandon the sequence. Any response is now forbidden.
  | "switchStream";  // the other stream is now the live one

/** A command that FORBIDS action. Responding is a critical error. */
export const NO_GO_COMMANDS: CentralCommand[] = ["wait", "cancel", "hold"];

/** Commands that transform an already-encoded plan (§19). Tracked separately. */
export const TRANSFORM_COMMANDS: CentralCommand[] = [
  "reverse", "repeat", "mirror", "mirrorSpatial", "skip", "replace", "combine",
  "oppositeHand", "oppositeCue",
];

// ------------------------------------------------------------------ EXECUTION
/** One resolved step of the action plan the athlete must actually perform. */
export interface PlanStep {
  /** position in the executed sequence, 0-based */
  slot: number;
  hand: SeqHand;
  action: SeqAction;
  band: SeqBand;
  /** which stream this step belongs to — Pro/GOAT run both at once (§18) */
  stream: "L" | "R";
  /** the cue this step derives from (for encoding-vs-execution error attribution) */
  cueId: string;
  /** required arrival time, ms from GO (rhythm) */
  dueMs: number;
  /** a MOVING execution target: it approaches, and must be met in its slot (§15) */
  moving: boolean;
  /**
   * PENDING (§16): the target is VISIBLE before its turn. Touching it early is
   * not a near-miss — it is an inhibition failure, and it is scored as one.
   */
  visibleFromMs: number;
  /** an element deliberately OMITTED from the cue — must be inferred (§26) */
  inferred: boolean;
  /** true once resolved */
  done?: boolean;
  outcome?: SeqOutcome;
}

// -------------------------------------------------------------------- ERRORS
/** §28 — critical errors end the sequence. Non-critical ones do not. */
export type SeqOutcome =
  | "correct"
  | "wrongHand"        // CRITICAL
  | "forbidden"        // CRITICAL — acted during wait/cancel/hold
  | "distractorHit"    // CRITICAL — responded to noise
  | "badTransform"     // CRITICAL — applied the wrong rule
  | "wrongBranch"      // CRITICAL when the rule forbids recovery
  | "timing"           // non-critical
  | "skipped"
  | "extra"
  | "outOfOrder"
  | "spatialMiss"      // right hand, right action, wrong band
  | "wrongAction"
  | "prematurePending" // touched a pending target before its slot
  | "movingMiss"
  | "crossStream";     // executed a step from the OTHER stream

export const CRITICAL: SeqOutcome[] = [
  "wrongHand", "forbidden", "distractorHit", "badTransform", "wrongBranch",
];

/**
 * ERROR ATTRIBUTION (§30). The engine does not just record THAT the athlete
 * failed — it records WHERE in the loop the failure happened. This is the whole
 * clinical value of the drill: two athletes can both score 70% and be broken in
 * completely different places, and the coaching response is not the same.
 */
export type BreakdownSource =
  | "encoding"      // never took the cue in
  | "memory"        // took it in, lost it across the delay
  | "decision"      // held it, misread the command
  | "transformation"// read the command, applied it wrong
  | "inhibition"    // could not withhold
  | "handSelection" // right plan, wrong hand
  | "timing"
  | "spatial"
  | "branch"
  | "dualStream"    // one stream contaminated the other
  | "motor";        // knew it, could not do it

// -------------------------------------------------------------------- EVENTS
export interface SeqEvent {
  t: number;
  sequenceId: string;
  slot: number;
  phase: SeqPhase;
  cueId: string;
  cueZone: CueZone;
  command: CentralCommand;
  transformed: boolean;
  expectedHand: SeqHand;
  expectedAction: SeqAction;
  expectedBand: SeqBand;
  actualHand?: SeqHand;
  actualAction?: SeqAction;
  actualBand?: SeqBand;
  outcome: SeqOutcome;
  correct: boolean;
  critical: boolean;
  breakdown?: BreakdownSource;

  /** PRIMARY metric (§35): central decision cue -> movement initiation. */
  decisionToMoveMs?: number;
  /** how long the athlete looked at the cue before it vanished */
  encodingMs?: number;
  /** GO -> this action */
  execMs?: number;
  /** gap since the previous action — inter-action interval */
  iaiMs?: number;
  /** signed timing error against the required beat: + late, - early */
  timingErrorMs?: number;
  stream: "L" | "R";
  scoreDelta: number;
  bonusStage?: number;
  /** Assessment Mode only (§34) */
  confidence?: number;
}

/** Where a single sequence is in its lifecycle (§5). */
export type SeqPhase =
  | "encode"     // peripheral cues presenting
  | "delay"      // retention interval, possibly with interference
  | "command"    // central decision cue up
  | "preview"    // (low tiers only) the resolved plan is shown back
  | "execute"
  | "result";

/** Session-level phase. */
export type SessionPhase = "main" | "bonus" | "recovery" | "complete";

export type SeqTier = "beginner" | "intermediate" | "advanced" | "pro" | "goat";
export type SeqMode = "training" | "assessment";

export interface SeqSettings {
  tier: SeqTier;
  mode: SeqMode;
  bonusEnabled: boolean;
  /** Custom Mode — scored, never ranked (§37) */
  custom?: Partial<SeqTuning>;
}

/** Every difficulty knob (§30). Custom Mode may touch any of them. */
export interface SeqTuning {
  seqLenMin: number;
  seqLenMax: number;
  cueDisplayMs: number;      // how long each peripheral cue is up
  cueGapMs: number;
  delayMinMs: number;        // retention interval
  delayMaxMs: number;
  interference: number;      // 0..1 — distractor activity during the delay
  distractorRate: number;    // share of cues that are noise
  salientConflict: number;   // anti-saccadic pressure
  commandMs: number;         // how long the central command is readable
  commandPersists: boolean;  // does the rule stay up during execution
  previewMs: number;         // 0 = no preview
  tempoMs: number;           // required inter-action interval
  timingWindowMs: number;
  transformRate: number;     // share of sequences carrying a transformation
  transformDepth: number;    // 1 = single rule, 2 = stacked (mirror+skip)
  branchRate: number;
  replaceRate: number;
  chunkRate: number;
  checkpointRate: number;
  liveUpdateRate: number;    // command changes DURING execution
  dualStream: boolean;
  asyncStreams: boolean;     // independent rhythms per hand
  movingRate: number;        // share of execution targets that approach
  pendingRate: number;       // share visible before their slot
  inferRate: number;         // share of elements omitted and inferred
  crossBodyRate: number;
  bands: SeqBand[];          // which vertical zones are in play
  cueZones: CueZone[];
  streams: 1 | 2;            // competing sequences A/B
  feedback: number;          // 0..1, tiered down as skill rises
  haptics: number;
  durationMs: number;
}
