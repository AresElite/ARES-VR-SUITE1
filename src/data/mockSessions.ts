import type { ARESDrillSessionResult } from "./schemas";

/** Seed data for the history screen in a fresh install (dev convenience). */
export const MOCK_SESSIONS: ARESDrillSessionResult[] = [
  {
    sessionId: "mock-0001",
    athleteId: "a-001",
    athleteName: "J. Carter",
    drillId: "peripheral-field",
    drillName: "Peripheral Field VR",
    phase: "Acquire",
    startedAt: "2026-07-01T15:04:00.000Z",
    endedAt: "2026-07-01T15:05:30.000Z",
    device: {
      headset: "Quest 3",
      browser: "Meta Quest Browser",
      webXRSupported: true,
      handTrackingSupported: true,
      controllerTrackingSupported: true,
    },
    progression: { level: 2, label: "Level 2 — Wider field", parameters: {} },
    metrics: {
      precision: { perfectPct: 0, goodPct: 0, poorPct: 0, meanRadial: 0, localizationIndex: 0, biasX: 0, biasY: 0, biasZ: 0, spreadM: 0, contacts: 0 },
    trials: 24,
      correct: 20,
      incorrect: 4,
      accuracyPct: 83.3,
      avgReactionMs: 512,
      medianReactionMs: 495,
      fastestReactionMs: 361,
      slowestReactionMs: 842,
      peripheralMisses: 3,
      leftRightAsymmetryPct: 9,
      fatigueDriftPct: 6,
      timingConsistencyMs: 96,
      speedAccuracyIndex: 0.98,
    },
    aq: {
      acquire: 74,
      overall: 74,
      notes: ["Right-field latency 9% slower than left."],
      recommendation: "Stay at this level",
    },
    rawEvents: [],
  },
];
