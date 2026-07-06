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
export type TargetShape = "sphere" | "box" | "diamond" | "ring" | "cone";

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
