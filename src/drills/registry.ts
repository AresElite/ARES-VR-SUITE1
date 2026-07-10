import type { ARESPhase } from "@/ares/phases";
import type { DrillDefinition } from "@/ares/drillTypes";
// ---- Direct ports of the A.R.E.S. Performance Suite (exact names) ----
import { SpeedSearch, SchulteTable, ContrastAssessment, RapidRecognition } from "./acquire/AcquireDrills";
import { Sternberg, SternbergDigits, SternbergLetters, FlankerCompatibility, Stroop, PatternMemory, MultipleObjectTracking } from "./route/RouteDrills";
import { ReactionGrid, EyeHandCoordination, RawReaction, ChoiceRT, GoNoGo, StopSignal, FocusFrenzy, SaccadeSwipe } from "./execute/ExecuteDrills";
import { NeuralPhaseLock, DualStreamNeuralCollider, PursuitPulse, Occlusion, CognitiveCrossfire } from "./synchronize/SynchronizeDrills";
// ---- VR-native originals (immersive extensions of the suite) ----
import { PeripheralFieldVR } from "./acquire/PeripheralFieldVR";
import { PredictivePathwayVR } from "./route/PredictivePathwayVR";
import { DepthSliceVR } from "./execute/DepthSliceVR";
import { ChaosArenaVR } from "./synchronize/ChaosArenaVR";
import { SportTransferLabVR, sportLabVariant } from "./synchronize/SportTransferLabVR";
import { ASSESS_DRILLS } from "./assess/AssessDrills";
import { ASSESS_ADOPTED } from "./assess/AssessAdopted";
import { TIER_ONE_BASELINES } from "./assess/TierOneBaselines";
import { PERFORM_DRILLS } from "@/perform/performDrills";
import { GazeStabilizationX1, GazeStabilizationX2 } from "./acquire/GazeStability";

/**
 * Drill registry — single source of truth.
 * The touchscreen suite's drills keep their EXACT names, rules, and
 * progression structure; VR-native drills extend the system in depth.
 */
export const ALL_DRILLS: DrillDefinition[] = [
  // ================= ASSESS (baseline baselines) =================
  ...ASSESS_DRILLS,
  ...ASSESS_ADOPTED,
  ...TIER_ONE_BASELINES,
  ...PERFORM_DRILLS,
  GazeStabilizationX1,
  GazeStabilizationX2,
  // ================= ACQUIRE =================
  ReactionGrid, // categorized EXECUTE, ACQUIRE in the suite — listed under Execute below
  SpeedSearch,
  SchulteTable,
  ContrastAssessment,
  RapidRecognition,
  PeripheralFieldVR,
  // ================= ROUTE =================
  Sternberg,
  SternbergDigits,
  SternbergLetters,
  FlankerCompatibility,
  Stroop,
  PatternMemory,
  MultipleObjectTracking,
  PredictivePathwayVR,
  // ================= EXECUTE =================
  EyeHandCoordination,
  RawReaction,
  ChoiceRT,
  GoNoGo,
  StopSignal,
  FocusFrenzy,
  SaccadeSwipe,
  DepthSliceVR,
  // ================= SYNCHRONIZE =================
  CognitiveCrossfire,
  NeuralPhaseLock,
  DualStreamNeuralCollider,
  PursuitPulse,
  Occlusion,
  ChaosArenaVR,
  SportTransferLabVR,
  sportLabVariant("racing"),
  sportLabVariant("tactical"),
];

export function drillsForPhase(phase: ARESPhase): DrillDefinition[] {
  return ALL_DRILLS.filter((d) => d.phase === phase);
}

export function drillById(id: string): DrillDefinition | undefined {
  return ALL_DRILLS.find((d) => d.id === id);
}

export const MVP_DRILLS = ALL_DRILLS.filter((d) => d.mvp);

/**
 * Stroboscopic occlusion is offered on drills with meaningful MOTION or
 * prediction — where seeing only glimpses actually trains anticipation.
 */
const STROBE_IDS = new Set<string>([
  "reaction-grid", "eye-hand-coordination", "raw-reaction", "choice-rt",
  "go-no-go", "stop-signal", "focus-frenzy", "depth-slice",
  "mot", "predictive-pathway",
  "occlusion", "neural-collider", "pursuit-pulse", "cognitive-crossfire",
  "chaos-arena", "sport-transfer",
  "assess-cat", "assess-gm-raw-rt", "assess-gm-choice-rt",
  ...Array.from({ length: 10 }, (_, i) => PERFORM_DRILLS[i]?.id).filter(Boolean) as string[],
]);
for (const d of ALL_DRILLS) {
  if (STROBE_IDS.has(d.id)) (d as { supportsStrobe?: boolean }).supportsStrobe = true;
}
