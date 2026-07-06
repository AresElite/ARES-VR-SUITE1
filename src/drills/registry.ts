import type { ARESPhase } from "@/ares/phases";
import type { DrillDefinition } from "@/ares/drillTypes";
import { PeripheralFieldVR } from "./acquire/PeripheralFieldVR";
import { ContrastSignalVR } from "./acquire/ContrastSignalVR";
import { VisualSearchVR } from "./acquire/VisualSearchVR";
import { PredictivePathwayVR } from "./route/PredictivePathwayVR";
import { ChoiceMapVR } from "./route/ChoiceMapVR";
import { WorkingMemoryGridVR } from "./route/WorkingMemoryGridVR";
import { ReactionStrikeVR } from "./execute/ReactionStrikeVR";
import { DepthSliceVR } from "./execute/DepthSliceVR";
import { InhibitionGateVR } from "./execute/InhibitionGateVR";
import { ChaosArenaVR } from "./synchronize/ChaosArenaVR";
import { SportTransferLabVR, sportLabVariant } from "./synchronize/SportTransferLabVR";

/**
 * Drill registry — the single source of truth for every drill in the suite.
 * Migrating a 55" touchscreen drill = adding one DrillDefinition here.
 */
export const ALL_DRILLS: DrillDefinition[] = [
  // Acquire
  PeripheralFieldVR,
  ContrastSignalVR,
  VisualSearchVR,
  // Route
  PredictivePathwayVR,
  ChoiceMapVR,
  WorkingMemoryGridVR,
  // Execute
  ReactionStrikeVR,
  DepthSliceVR,
  InhibitionGateVR,
  // Synchronize
  ChaosArenaVR,
  SportTransferLabVR,
  sportLabVariant("racing"),
  sportLabVariant("tactical"),
  sportLabVariant("hockey"),
  sportLabVariant("soccer"),
];

export function drillsForPhase(phase: ARESPhase): DrillDefinition[] {
  return ALL_DRILLS.filter((d) => d.phase === phase);
}

export function drillById(id: string): DrillDefinition | undefined {
  return ALL_DRILLS.find((d) => d.id === id);
}

export const MVP_DRILLS = ALL_DRILLS.filter((d) => d.mvp);
