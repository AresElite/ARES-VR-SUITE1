import type { ARESPhase } from "@/ares/phases";
import type { RawEvent } from "@/ares/drillTypes";

export type { ARESPhase };

export type HeadsetKind = "Quest 2" | "Quest 3S" | "Quest 3" | "Desktop" | "Unknown";

export interface DeviceInfo {
  headset: HeadsetKind;
  browser: string;
  webXRSupported: boolean;
  handTrackingSupported?: boolean;
  controllerTrackingSupported?: boolean;
}

export interface SessionMetrics {
  trials: number;
  correct: number;
  incorrect: number;
  accuracyPct: number;
  avgReactionMs?: number;
  medianReactionMs?: number;
  fastestReactionMs?: number;
  slowestReactionMs?: number;
  choiceReactionMs?: number;
  falseStarts?: number;
  noGoFailures?: number;
  peripheralMisses?: number;
  wrongHandErrors?: number;
  leftRightAsymmetryPct?: number;
  upperLowerAsymmetryPct?: number;
  centralPeripheralSplitPct?: number;
  fatigueDriftPct?: number;
  timingConsistencyMs?: number;
  speedAccuracyIndex?: number;
  /** mean hand-to-target-center distance at contact (cm) — eye-hand precision */
  avgPrecisionCm?: number;
  /** mean slowdown of the response following an error vs overall pace (ms) */
  postErrorSlowingMs?: number;
  /** longest run of consecutive correct responses */
  bestStreak?: number;
  /** go targets that expired unanswered */
  misses?: number;
  leftAvgReactionMs?: number;
  rightAvgReactionMs?: number;
  leftAccuracyPct?: number;
  rightAccuracyPct?: number;
  /** rhythm tracks: strikes within the 60ms / 140ms windows of the beat */
  timingPerfect?: number;
  timingGood?: number;
  avgAbsTimingMs?: number;
  /** stopwatch protocols (DEM): GO-to-final-answer completion time */
  completionTimeMs?: number;
  /** coincidence-anticipation: signed timing error (bias), + = late/- = early */
  catBiasMs?: number;
  /** coincidence-anticipation: mean absolute timing error */
  catAbsErrorMs?: number;
  /** coincidence-anticipation: SD of signed error (consistency of timing) */
  catVariabilityMs?: number;
  /** dynamic visual acuity: highest target angular velocity still identified (deg/s) */
  dvaThresholdDegS?: number;
  /** useful field of view: shortest exposure with correct peripheral localization (ms) */
  ufovThresholdMs?: number;
}

export interface AQBlock {
  acquire?: number;
  route?: number;
  execute?: number;
  synchronize?: number;
  assess?: number;
  perform?: number;
  overall?: number;
  notes?: string[];
  recommendation?: string;
}

/**
 * Standardized session result. Every VR drill produces exactly this shape.
 * Flat, typed, serializable — the placeholder API layer in
 * `src/data/api.ts` will ship these objects unchanged when future sync lands.
 */
export interface ARESDrillSessionResult {
  sessionId: string;
  athleteId?: string;
  athleteName?: string;
  drillId: string;
  drillName: string;
  phase: ARESPhase;
  startedAt: string;
  endedAt: string;
  device: DeviceInfo;
  progression: {
    level: number;
    label: string;
    parameters: Record<string, unknown>;
  };
  metrics: SessionMetrics;
  aq: AQBlock;
  rawEvents: RawEvent[];
}

export interface Athlete {
  id: string;
  name: string;
  sport: string;
  position?: string;
  notes?: string;
  /** external record/EMR profile id — where validated (Phase 2) metrics route */
  externalProfileId?: string;
}
