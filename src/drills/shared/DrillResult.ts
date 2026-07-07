import { computeMetrics } from "@/ares/scoring";
import { buildAQBlock } from "@/ares/aq";
import { recommendProgression, ACTION_LABELS } from "@/ares/progression";
import type { ProgressionRecommendation } from "@/ares/progression";
import type { ARESDrillSessionResult, DeviceInfo } from "@/data/schemas";
import type { DrillEngine } from "./DrillEngine";

export interface FinishedDrill {
  result: ARESDrillSessionResult;
  recommendation: ProgressionRecommendation;
}

/** Build the standardized session result from a finished engine. */
export function buildSessionResult(
  engine: DrillEngine,
  opts: {
    athleteId?: string;
    athleteName?: string;
    level: number;
    levelLabel: string;
    device: DeviceInfo;
  },
): FinishedDrill {
  const def = engine.definition;
  const events = engine.getEvents();
  const metrics = computeMetrics(events);
  const recommendation = recommendProgression(
    def.phase,
    metrics,
    opts.level,
    def.levels.length,
  );

  const notes: string[] = [];
  if (metrics.leftRightAsymmetryPct !== undefined && Math.abs(metrics.leftRightAsymmetryPct) >= 8) {
    notes.push(
      `${metrics.leftRightAsymmetryPct > 0 ? "Right" : "Left"}-field latency ${Math.abs(metrics.leftRightAsymmetryPct)}% slower.`,
    );
  }
  if ((metrics.fatigueDriftPct ?? 0) >= 15) {
    notes.push(`Fatigue drift ${metrics.fatigueDriftPct}% — timing slowed across the run.`);
  }
  if ((metrics.noGoFailures ?? 0) > 0) {
    notes.push(`${metrics.noGoFailures} inhibition failure(s) on no-go events.`);
  }
  if ((metrics.peripheralMisses ?? 0) > 2) {
    notes.push(`${metrics.peripheralMisses} peripheral targets missed — Acquire load exceeded.`);
  }

  // assessment-specific clinical interpretation
  if (def.analyze) notes.push(...def.analyze(events));

  const aq = buildAQBlock(def.phase, metrics, ACTION_LABELS[recommendation.action], notes);

  const result: ARESDrillSessionResult = {
    sessionId: `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    athleteId: opts.athleteId,
    athleteName: opts.athleteName,
    drillId: def.id,
    drillName: def.name,
    phase: def.phase,
    startedAt: engine.startedAtISO || new Date().toISOString(),
    endedAt: engine.endedAtISO || new Date().toISOString(),
    device: opts.device,
    progression: {
      level: opts.level,
      label: opts.levelLabel,
      parameters: engine.parameters,
    },
    metrics,
    aq,
    rawEvents: events,
  };

  return { result, recommendation };
}
