import type { ARESDrillSessionResult } from "@/data/schemas";
import { drillById } from "@/drills/registry";
import { TRACK_LIBRARY } from "@/perform/beatmap";

/**
 * THE CLOSED LOOP — assessment drives prescription.
 *
 * Every stored session feeds an athlete profile; rule-based triage turns the
 * profile into TODAY'S PLAN: up to five prioritized items targeting the
 * weakest visual-cognitive systems, each pinned to the level that should
 * hold the athlete near ~80% success — the optimal challenge point where
 * adaptation is fastest.
 */

export interface PrescriptionItem {
  drillId: string;
  drillName: string;
  level: number;
  reason: string;
  priority: number;
}

export interface AthleteProfile {
  hasBaselines: boolean;
  fineRtMs?: number;
  handAsymPct?: number;
  weakerHand?: "left" | "right";
  logCS?: number;
  stereoArcsec?: number;
  demAccuracy?: number;
  noGoFailRate?: number;
  fatigueDriftPct?: number;
  staleAssessments: string[];
  /** hardest Perform track cleared at >=75% accuracy */
  performClearedIdx: number;
  performReadyToClimb: boolean;
}

const DAY = 86400000;
const num = (notes: string[] | undefined, re: RegExp): number | undefined => {
  for (const n of notes ?? []) {
    const m = n.match(re);
    if (m) return parseFloat(m[1]);
  }
  return undefined;
};

export function buildProfile(sessions: ARESDrillSessionResult[], athleteId?: string): AthleteProfile {
  const mine = sessions
    .filter((s) => !athleteId || s.athleteId === athleteId)
    .sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  const latest = new Map<string, ARESDrillSessionResult>();
  for (const s of mine) latest.set(s.drillId, s);

  const g = (id: string) => latest.get(id);
  const fm = g("assess-fm-raw-rt");
  const fmc = g("assess-fm-choice-rt");
  const gmc = g("assess-gm-choice-rt");
  const choice = fmc ?? gmc;

  let handAsymPct: number | undefined;
  let weakerHand: "left" | "right" | undefined;
  if (choice?.metrics.leftAvgReactionMs && choice.metrics.rightAvgReactionMs) {
    const L = choice.metrics.leftAvgReactionMs;
    const R = choice.metrics.rightAvgReactionMs;
    handAsymPct = Math.round((Math.abs(L - R) / Math.min(L, R)) * 1000) / 10;
    weakerHand = L > R ? "left" : "right";
  }

  const noGoSessions = mine.filter((s) => (s.metrics.noGoFailures ?? 0) + (s.metrics.correct ?? 0) > 0 && s.metrics.noGoFailures !== undefined);
  const recent = noGoSessions.slice(-5);
  const noGoFailRate = recent.length
    ? recent.reduce((a, s) => a + (s.metrics.noGoFailures ?? 0), 0) / recent.length
    : undefined;

  const drifts = mine.slice(-6).map((s) => s.metrics.fatigueDriftPct ?? 0);
  const fatigueDriftPct = drifts.length ? Math.max(...drifts) : undefined;

  const staleAssessments: string[] = [];
  const now = Date.now();
  for (const id of ["assess-fm-choice-rt", "assess-gm-choice-rt", "assess-contrast-sensitivity", "assess-stereopsis"]) {
    const s = latest.get(id);
    if (s && now - Date.parse(s.endedAt) > 14 * DAY) staleAssessments.push(id);
  }

  // Perform ladder position: hardest track cleared at >=75%
  let performClearedIdx = -1;
  let performReadyToClimb = false;
  TRACK_LIBRARY.forEach((t, i) => {
    const s = latest.get(`perform-${t.map.id}`);
    if (s && s.metrics.accuracyPct >= 75) {
      performClearedIdx = Math.max(performClearedIdx, i);
      if (s.metrics.accuracyPct >= 88 && (s.metrics.avgAbsTimingMs ?? 999) <= 95) performReadyToClimb = true;
    }
  });

  return {
    hasBaselines: Boolean(fm || choice),
    fineRtMs: fm?.metrics.avgReactionMs,
    handAsymPct,
    weakerHand,
    logCS: num(g("assess-contrast-sensitivity")?.aq.notes, /logCS ([\d.]+)/),
    stereoArcsec: num(g("assess-stereopsis")?.aq.notes, /threshold achieved: (\d+) arcsec/),
    demAccuracy: g("assess-dem-arrows")?.metrics.accuracyPct,
    noGoFailRate,
    fatigueDriftPct,
    staleAssessments,
    performClearedIdx,
    performReadyToClimb,
  };
}

/** level that should hold ~80% success, from the athlete's last run of a drill */
function levelFor(drillId: string, sessions: ARESDrillSessionResult[]): number {
  const last = [...sessions].reverse().find((s) => s.drillId === drillId);
  if (!last) return 1;
  const lv = last.progression.level;
  if (last.metrics.accuracyPct >= 85) return Math.min(25, lv + 1);
  if (last.metrics.accuracyPct < 60) return Math.max(1, lv - 1);
  return lv;
}

export function buildPrescription(sessions: ARESDrillSessionResult[], athleteId?: string): PrescriptionItem[] {
  const p = buildProfile(sessions, athleteId);
  const items: PrescriptionItem[] = [];
  const add = (drillId: string, reason: string, priority: number, level?: number) => {
    const def = drillById(drillId);
    if (!def || items.some((i) => i.drillId === drillId)) return;
    items.push({
      drillId,
      drillName: def.shortName,
      level: level ?? (def.assessment || def.rhythm ? 1 : levelFor(drillId, sessions)),
      reason,
      priority,
    });
  };

  if (!p.hasBaselines) {
    add("assess-fm-choice-rt", "No baseline on record — establish fine-motor speed & hand split", 100);
    add("assess-gm-choice-rt", "Establish whole-arm interception ceiling", 98);
    add("assess-contrast-sensitivity", "Establish contrast threshold (logCS)", 96);
    add("assess-stereopsis", "Establish depth threshold (arcsec)", 94);
  } else {
    if (p.handAsymPct !== undefined && p.handAsymPct > 8 && p.weakerHand) {
      add("choice-rt", `${p.handAsymPct}% hand asymmetry — ${p.weakerHand.toUpperCase()} hand lags; balanced choice work closes the gap`, 90);
    }
    if (p.fineRtMs !== undefined && p.fineRtMs > 320) {
      add("raw-reaction", `Simple RT ${p.fineRtMs}ms — raw speed block before choice load`, 85);
    }
    if (p.logCS !== undefined && p.logCS < 1.6) {
      add("contrast-assessment", `Contrast sensitivity logCS ${p.logCS} — train low-contrast target pickup`, 82);
    }
    if (p.stereoArcsec !== undefined && p.stereoArcsec > 100) {
      add("depth-slice", `Stereo threshold ${p.stereoArcsec} arcsec — depth-interception work sharpens disparity use`, 80);
    }
    if (p.demAccuracy !== undefined && p.demAccuracy < 85) {
      add("saccade-swipe", `DEM accuracy ${p.demAccuracy}% — oculomotor sequencing needs reps`, 76);
    }
    if (p.noGoFailRate !== undefined && p.noGoFailRate > 2) {
      add("go-no-go", `Averaging ${Math.round(p.noGoFailRate * 10) / 10} no-go failures per session — inhibition block`, 72);
    }
    if (p.fatigueDriftPct !== undefined && p.fatigueDriftPct > 8) {
      add("pursuit-pulse", `${p.fatigueDriftPct}% late-session drift — endurance under load`, 66);
    }
    for (const id of p.staleAssessments.slice(0, 1)) {
      add(id, "Baseline older than 14 days — retest to keep the prescription honest", 60);
    }
    if (items.length === 0) {
      add("eye-hand-coordination", "No standout weakness — general coordination block at progression level", 55);
      add("reaction-grid", "Maintain scanning speed across the full grid", 54);
    }
  }

  // flow finisher: the right rung of the measured track ladder
  const idx = Math.max(0, Math.min(TRACK_LIBRARY.length - 1, p.performClearedIdx + (p.performReadyToClimb ? 1 : p.performClearedIdx < 0 ? 1 : 0)));
  const t = TRACK_LIBRARY[idx];
  add(
    `perform-${t.map.id}`,
    p.performClearedIdx < 0
      ? `Start the track ladder — "${t.map.title}" (D${t.difficulty.toFixed(1)})`
      : p.performReadyToClimb
        ? `Cleared D${TRACK_LIBRARY[p.performClearedIdx].difficulty.toFixed(1)} clean — climb to "${t.map.title}" (D${t.difficulty.toFixed(1)})`
        : `Hold "${t.map.title}" (D${t.difficulty.toFixed(1)}) until timing tightens`,
    50,
  );

  return items.sort((a, b) => b.priority - a.priority).slice(0, 5);
}
