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

  // rhythm tracks: score timing offset against the beat (arrival moment)
  if (def.rhythm) {
    const lvParams = def.levels[opts.level - 1]?.parameters as { approachSec?: number } | undefined;
    const approachMs = lvParams?.approachSec ? lvParams.approachSec * 1000 : def.rhythm.approachMs;
    const offsets = events
      .filter((e) => e.correct && e.reactionMs !== undefined)
      .map((e) => e.reactionMs! - approachMs);
    if (offsets.length) {
      const abs = offsets.map(Math.abs);
      metrics.timingPerfect = abs.filter((o) => o <= 60).length;
      metrics.timingGood = abs.filter((o) => o > 60 && o <= 140).length;
      metrics.avgAbsTimingMs = Math.round(abs.reduce((a, b) => a + b, 0) / abs.length);
      const early = offsets.filter((o) => o < -60).length;
      const late = offsets.filter((o) => o > 60).length;
      notes.push(
        `Beat timing: ${metrics.timingPerfect} PERFECT / ${metrics.timingGood} GOOD — avg ${metrics.avgAbsTimingMs}ms off the beat${early > late * 1.5 ? " (tends EARLY — rushing the beat)" : late > early * 1.5 ? " (tends LATE — chasing the beat)" : ""}.`,
      );
    }
  }

  // stopwatch protocols: completion time = GO to the final resolved target
  if (def.stopwatch) {
    const scored = events.filter((e) => e.errorType !== "correctRejection");
    if (scored.length) metrics.completionTimeMs = Math.max(0, Math.round(Math.max(...scored.map((e) => e.timestamp)) - 600));
  }

  // assessment-specific performance interpretation
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
