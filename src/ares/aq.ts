import type { ARESPhase } from "./phases";
import type { AQBlock, SessionMetrics } from "@/data/schemas";

/**
 * AQ Adaptive Neuroload Engine — scoring scaffold (v0).
 *
 * AQ is the translation layer between raw drill performance and usable
 * performance insight. This first version produces a 0–100 phase score from
 * accuracy, latency, stability, and error-discipline components. The weights
 * are deliberately explicit and centralized so they can be re-normed against
 * real athlete data without touching any drill engine.
 */

const clamp = (x: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));

/** Map an RT (ms) to 0–100 (250ms → 100, 900ms → 0). */
const latencyScore = (rt?: number) =>
  rt === undefined ? undefined : clamp(100 - ((rt - 250) / (900 - 250)) * 100);

/** Map RT stddev (ms) to 0–100 (40ms → 100, 260ms → 0). */
const consistencyScore = (sd?: number) =>
  sd === undefined ? undefined : clamp(100 - ((sd - 40) / (260 - 40)) * 100);

/** Penalty (0–100 scale) for discipline errors, normalized per trial count. */
const disciplinePenalty = (m: SessionMetrics) => {
  const t = Math.max(1, m.trials);
  const bad = (m.falseStarts ?? 0) + (m.noGoFailures ?? 0) + (m.wrongHandErrors ?? 0);
  return clamp((bad / t) * 200, 0, 40);
};

export function computePhaseAQ(phase: ARESPhase, m: SessionMetrics): number {
  const accuracy = clamp(m.accuracyPct);
  const latency = latencyScore(m.avgReactionMs);
  const consistency = consistencyScore(m.timingConsistencyMs);
  const fatigue =
    m.fatigueDriftPct === undefined ? undefined : clamp(100 - Math.max(0, m.fatigueDriftPct) * 3);

  // Phase-specific weighting of the same components.
  const weights: Record<ARESPhase, { acc: number; lat: number; con: number; fat: number }> = {
    Acquire: { acc: 0.55, lat: 0.25, con: 0.15, fat: 0.05 },
    Route: { acc: 0.6, lat: 0.2, con: 0.15, fat: 0.05 },
    Execute: { acc: 0.4, lat: 0.35, con: 0.2, fat: 0.05 },
    Synchronize: { acc: 0.35, lat: 0.2, con: 0.25, fat: 0.2 },
    Assess: { acc: 0.6, lat: 0.25, con: 0.15, fat: 0 },
    Perform: { acc: 0.35, lat: 0.1, con: 0.4, fat: 0.15 },
  };
  const w = weights[phase];

  let total = accuracy * w.acc;
  let used = w.acc;
  if (latency !== undefined) {
    total += latency * w.lat;
    used += w.lat;
  }
  if (consistency !== undefined) {
    total += consistency * w.con;
    used += w.con;
  }
  if (fatigue !== undefined) {
    total += fatigue * w.fat;
    used += w.fat;
  }
  const base = total / used;
  return Math.round(clamp(base - disciplinePenalty(m)));
}

export function buildAQBlock(phase: ARESPhase, m: SessionMetrics, recommendation: string, notes: string[]): AQBlock {
  const score = computePhaseAQ(phase, m);
  const block: AQBlock = {
    overall: score,
    notes,
    recommendation,
  };
  if (phase === "Acquire") block.acquire = score;
  if (phase === "Route") block.route = score;
  if (phase === "Execute") block.execute = score;
  if (phase === "Synchronize") block.synchronize = score;
  if (phase === "Assess") block.assess = score;
  if (phase === "Perform") block.perform = score;
  return block;
}

/** Human-readable AQ band for HUD / results panels. */
export function aqBand(score?: number): string {
  if (score === undefined) return "—";
  if (score >= 85) return "Elite";
  if (score >= 70) return "Advanced";
  if (score >= 55) return "Developing";
  if (score >= 40) return "Foundational";
  return "Rebuild";
}
