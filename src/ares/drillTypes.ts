import type { ARESPhase } from "./phases";

/** Spatial zone of a target relative to the athlete's central fixation. */
export type TargetZone =
  | "center"
  | "left"
  | "right"
  | "up"
  | "down"
  | "upLeft"
  | "upRight"
  | "downLeft"
  | "downRight";

export type TargetKind = "go" | "noGo" | "distractor";
export type HandRule = "left" | "right" | "either" | "both";
export type Hand = "left" | "right" | "both" | "unknown";
export type TargetShape = "sphere" | "box" | "diamond" | "ring" | "cone" | "pyramid" | "arc" | "pad" | "plate" | "stereo" | "grating" | "arrow" | "line" | "landolt";

export type SliceDirection =
  | "up"
  | "down"
  | "left"
  | "right"
  | "upLeft"
  | "upRight"
  | "downLeft"
  | "downRight";

/** One scheduled stimulus inside a drill run. */
export interface TrialSpec {
  id: string;
  /** ms from drill start */
  spawnAt: number;
  /** ms the target stays live before it counts as a miss / correct rejection */
  duration: number;
  kind: TargetKind;
  zone: TargetZone;
  position: [number, number, number];
  /** world units/second — targets with velocity move (Depth Slice, Pathways) */
  velocity?: [number, number, number];
  /** bounded oscillation around the spawn anchor (Focus-Frenzy): the target
      moves in free space but stays within amplitude of its anchor, so streams
      in separated anchors can never overlap */
  wander?: { ax: number; ay: number; wx: number; wy: number; px: number; py: number };
  /** completion-sequenced grid index (Schulte): grid 0 spawns at start,
      grid n spawns when grid n-1 is fully completed — trial-paced, not timed */
  gridSeq?: number;
  /** curved-lane parameter for Route drills */
  lane?: { radius: number; angularSpeed: number; phase: number; y: number };
  requiredHand?: HandRule;
  requiredDirection?: SliceDirection;
  color: string;
  emissive?: string;
  shape: TargetShape;
  scale: number;
  label?: string;
  /** targets sharing a groupId form one decision — hitting any member resolves the group */
  groupId?: string;
  /** decorative stimulus: rendered and animated but cannot be struck */
  decor?: boolean;
  /** group resolution mode: single (default) = first hit resolves group;
      all = every go member must be hit; ordered = hit in seq order */
  groupMode?: "single" | "all" | "ordered";
  /** position in an ordered group */
  seq?: number;
  /** chained spawning: members of a chain spawn when the previous resolves.
      spawnAt of non-first members is ignored (use -1). */
  chainId?: string;
  chainGapMs?: number;
  /** ms after spawn at which the target visually switches color (with switchKindAt) */
  switchColor?: string;
  /** Ishihara-style plate spec (shape "plate") */
  plate?: { digit: number; axis: "control" | "rg" | "by"; seed: number };
  /** dichoptic disparity offset in meters (shape "stereo"; + = crossed) */
  stereoShiftM?: number;
  /** grating disc spec (shape "grating"): Michelson contrast %, cycles, angle */
  grating?: { contrastPct: number; cycles: number; angleDeg: number; seed: number };
  /** Landolt-C spec (shape "landolt"): gap bearing in degrees, drawn at luminance.target */
  landolt?: { gapDeg: number; seed: number };
  /**
   * THE VISIBILITY ENVIRONMENT for this trial.
   *
   * Contrast is not a property of a target — it is a RELATIONSHIP between a target
   * and the field it sits in. So the field is specified per trial and the whole world
   * changes with it: bright sky, floodlit night, flat dusk, washout, glare, clutter.
   *
   * Luminances are 0-255 display units. Weber contrast = (Lt - Lb) / Lb, and its SIGN
   * matters enormously to an athlete: a dark ball on a bright sky and a bright ball on
   * a dark sky are different visual problems solved by different mechanisms, and most
   * people are measurably better at one of them.
   */
  luminance?: {
    bg: number;          // background field luminance (0-255)
    target: number;      // target luminance (0-255)
    glare: number;       // 0-1: veiling glare source near the target
    mottle: number;      // 0-1: background clutter / dapple
    condition: string;   // human-readable label for the results panel
  };
  /** ms from drill start at which this target's kind flips (late cue change) */
  switchKindAt?: number;
  switchKindTo?: TargetKind;
  meta?: Record<string, unknown>;
}

export interface ProgressionLevel {
  level: number;
  label: string;
  parameters: Record<string, unknown>;
}

export type InteractionMode = "ray" | "touch";

/** How the athlete responds: physical strike (default) or index-trigger click. */
export type ResponseMode = "strike" | "trigger" | "joystick" | "pointer";

/** Trainer-configurable drill option (rendered as a dropdown on the dock). */
export interface DrillOptionDef {
  id: string;
  label: string;
  values: { id: string; label: string }[];
  defaultValue: string;
}

export type SportId =
  | "baseball"
  | "hockey"
  | "football"
  | "soccer"
  | "basketball"
  | "racing"
  | "tactical"
  | "racquet";

export type EnvironmentId = "arena" | "visibility" | SportId;

/** A drill definition: pure config + trial-plan builder. Engines are shared. */
export interface DrillDefinition {
  id: string;
  name: string;
  phase: ARESPhase;
  shortName: string;
  description: string;
  purpose: string;
  interaction: InteractionMode;
  environment: EnvironmentId;
  levels: ProgressionLevel[];
  /** true = shipped MVP drill; false = scaffolded prototype config */
  mvp: boolean;
  /** Clear, numbered athlete-facing directions shown before the drill */
  instructions: string[];
  /** strike (reach out and hit) or trigger (index-trigger click) */
  responseMode?: ResponseMode;
  /** render the central ball launcher prop during the drill */
  launcher?: boolean;
  /** render the six-hole hexagon launcher wall (gross-motor assessments) */
  hexWall?: boolean;
  /** drill ends exactly at durationMs even if trials remain (60s formats) */
  hardStop?: boolean;
  /** baseline assessment: fixed standardized protocol (single level) */
  assessment?: boolean;
  /** adaptive hook: mutate a trial at the moment it spawns (speed ladders,
      staircases) using the live snapshot; api.finishEarly() ends the plan */
  onSpawnAdapt?: (
    spec: TrialSpec,
    snapshot: { streak: number; hits: number; errors: number; lastEventCorrect?: boolean },
    api: { finishEarly(): void },
  ) => void;
  /** assessment-specific interpretation appended to result notes */
  analyze?: (events: RawEvent[]) => string[];
  /** hand-color rules matter: strike orbs render purple(R)/teal(L); when
      absent the hands stay neutral so target colors are unambiguous */
  handIdentity?: boolean;
  /** coincidence-anticipation protocol: signed timing error scored against a
      fixed arrival time (reactionMs - arriveMs); + = late, - = early */
  anticipation?: { arriveMs: number };
  /** timed completion protocol (DEM): HUD shows a stopwatch counting UP,
      and the clock stops the instant the final target is resolved */
  stopwatch?: boolean;
  /** show a 3-2-1-GO countdown between completion-sequenced grids (Schulte) */
  interTrialCountdown?: boolean;
  /** stroboscopic occlusion is offered as a pre-drill option (motion drills) */
  supportsStrobe?: boolean;
  /** monocular protocol: one eye is fully occluded per block (per-eye layers) */
  monocular?: boolean;
  /** gaze-stabilization drill: render fixation dot + head-speed feedback ring */
  gazeStability?: boolean;
  /** joystick flicks resolve to 8 octants, not 4 cardinals (diagonal answers are valid) */
  eightWay?: boolean;
  /**
   * DUAL INPUT. The athlete STRIKES with their hands and pulls TRIGGERS, at the same time,
   * for two different tasks. Required by genuine dual-task drills, where the whole point is
   * that the two channels compete: reaching for a peripheral target costs you the central
   * problem, and that cost is the measurement.
   *
   * Strike resolves ordinary targets; the trigger resolves only targets flagged
   * meta.triggerTarget, and strike ignores those. Without that routing the trigger would
   * grab whichever target spawned first — which is almost always a peripheral one — and the
   * central task would be unanswerable.
   */
  dualInput?: boolean;
  /**
   * The level ORDER is authored by the drill's own difficulty formula (a direct port of
   * the touchscreen suite's calcDiff), not by a monotone parameter ramp. A generic
   * ease-index estimator will disagree with it in places, and when it does, the estimator
   * is the one that is wrong — the authored curve IS the instrument.
   */
  authoredLadder?: boolean;
  /** completion-paced session (Schulte): length is trial-driven, not timed —
      the declared duration is only a generous ceiling */
  trialPaced?: boolean;
  /**
   * OPEN SEARCH. The field NEVER expires and a wrong click never ends the trial. The
   * athlete searches until they find it, however long that takes.
   *
   * This is the only honest way to run a visual search. A timeout censors exactly the
   * data you care about — the hard searches — and replaces a real search time with the
   * timeout value, which is not a measurement of anything. And auto-advancing on a decoy
   * click hands the athlete an escape hatch: spam-click out of a search you are losing.
   * Under openSearch a decoy click is scored as an error and the decoy STAYS on the field,
   * so the search is not made easier by failing at it.
   */
  openSearch?: boolean;
  /** suppress the central fixation marker (drills where fixation is not the task) */
  noFixationMarker?: boolean;
  /** beat-locked track (Perform): timing windows scored against arrival */
  rhythm?: { approachMs: number; bpm: number; style: "pulse" | "drive" | "wave" | "storm"; lengthBeats: number; countInBeats: number };
  /** trainer-configurable dropdowns; selections merge into build parameters */
  options?: DrillOptionDef[];
  /** One-line control reminder shown during the countdown */
  controlsHint: string;
  /** deterministic trial plan for a given level (rng is seeded) */
  buildTrials(params: Record<string, unknown>, rng: () => number): TrialSpec[];
  /** total run length in ms (HUD countdown) */
  durationMs(params: Record<string, unknown>): number;
}

export type RawEvent = {
  trialId: string;
  timestamp: number;
  targetId?: string;
  targetPosition?: { x: number; y: number; z: number };
  expectedAction?: string;
  actualAction?: string;
  correct: boolean;
  reactionMs?: number;
  hand?: Hand;
  errorType?: string;
  zone?: TargetZone;
  /** hand-to-target-center distance at contact (meters) */
  precisionM?: number;
  /** the target's contact radius (m). precisionM is meaningless without it — a
      7cm miss on a big pad and a 7cm miss on a small one are not the same error. */
  radiusM?: number;
  /** perfect (centre 10%) / good / poor (outer 30%) */
  precisionZone?: import("./precision").PrecisionZone;
  /** anticipation protocols: the exact ms (from spawn) the stimulus reaches the
      contact line — signed error = reactionMs - arriveMs (+late / -early) */
  arriveMs?: number;
};
