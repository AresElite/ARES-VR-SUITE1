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
export type TargetShape = "sphere" | "box" | "diamond" | "ring" | "cone" | "arc" | "pad";

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
export type ResponseMode = "strike" | "trigger";

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

export type EnvironmentId = "arena" | SportId;

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
  /** drill ends exactly at durationMs even if trials remain (60s formats) */
  hardStop?: boolean;
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
};
