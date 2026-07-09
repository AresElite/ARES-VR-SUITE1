import { create } from "zustand";
import type { ARESPhase } from "@/ares/phases";
import type { Athlete, ARESDrillSessionResult, DeviceInfo } from "@/data/schemas";
import { MOCK_ATHLETES } from "@/data/mockAthletes";
import { loadSessions, saveSession } from "@/data/sessionStore";
import { syncSessionToEMR } from "@/data/api";
import { drillById } from "@/drills/registry";
import { createDrillSession } from "@/drills/shared/DrillSession";
import { buildSessionResult, type FinishedDrill } from "@/drills/shared/DrillResult";
import { levelFor } from "@/drills/shared/ProgressionEngine";
import type { DrillEngine, DrillSnapshot } from "@/drills/shared/DrillEngine";
import { detectHeadset, detectBrowser } from "@/utils/questDetection";
import { EMPTY_XR_SUPPORT, type XRSupportInfo } from "@/utils/xrSupport";
import { PERF_MODES, defaultPerfMode, type PerfModeId } from "@/utils/performance";

export type ArenaMode = "home" | "setup" | "calibration" | "drill" | "results";

interface AppState {
  // device & support
  xrSupport: XRSupportInfo;
  perfModeId: PerfModeId;
  seated: boolean;
  // session setup
  athlete: Athlete;
  phase: ARESPhase | null;
  sport: string | null;
  drillId: string | null;
  level: number;
  drillOptions: Record<string, string>;
  // runtime
  arenaMode: ArenaMode;
  engine: DrillEngine | null;
  snapshot: DrillSnapshot | null;
  lastFinished: FinishedDrill | null;
  lastSyncMessage: string | null;
  sessions: ARESDrillSessionResult[];
  // actions
  setXRSupport(info: XRSupportInfo): void;
  setPerfMode(id: PerfModeId): void;
  setSeated(seated: boolean): void;
  setAthlete(a: Athlete): void;
  selectPhase(phase: ARESPhase | null): void;
  selectSport(id: string | null): void;
  launchPrescribed(drillId: string, level: number): void;
  selectDrill(drillId: string | null): void;
  setLevel(level: number): void;
  setDrillOption(id: string, value: string): void;
  goHome(): void;
  proceedToCalibration(): void;
  startDrill(): void;
  updateSnapshot(s: DrillSnapshot): void;
  pauseDrill(): void;
  resumeDrill(): void;
  stopDrill(): void;
  finishDrill(): void;
  saveLastSession(): Promise<void>;
  runAgain(atLevel?: number): void;
  refreshSessions(): void;
}

function deviceInfo(support: XRSupportInfo): DeviceInfo {
  return {
    headset: detectHeadset(),
    browser: detectBrowser(),
    webXRSupported: support.webXRSupported,
    handTrackingSupported: support.handTrackingLikely,
    controllerTrackingSupported: support.controllersLikely,
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  xrSupport: EMPTY_XR_SUPPORT,
  perfModeId: defaultPerfMode(),
  seated: false,
  athlete: MOCK_ATHLETES[0],
  phase: null,
  sport: null,
  drillId: null,
  level: 1,
  drillOptions: {},
  arenaMode: "home",
  engine: null,
  snapshot: null,
  lastFinished: null,
  lastSyncMessage: null,
  sessions: loadSessions(),

  setXRSupport: (info) => set({ xrSupport: info }),
  setPerfMode: (id) => set({ perfModeId: id }),
  setSeated: (seated) => set({ seated }),
  setAthlete: (athlete) => set({ athlete }),

  selectPhase: (phase) =>
    set({ phase, sport: null, drillId: null, level: 1, arenaMode: phase ? "setup" : "home" }),

  selectSport: (id) => set({ sport: id, drillId: null, level: 1 }),

  selectDrill: (drillId) => set({ drillId, level: 1, drillOptions: {} }),

  launchPrescribed: (drillId, level) => {
    const def = drillById(drillId);
    if (!def) return;
    set({ phase: def.phase, drillId, level, drillOptions: {}, arenaMode: "calibration" });
  },
  setLevel: (level) => set({ level }),
  setDrillOption: (id, value) =>
    set((s) => ({ drillOptions: { ...s.drillOptions, [id]: value } })),

  goHome: () => {
    get().engine?.stop();
    set({ arenaMode: "home", phase: null, sport: null, drillId: null, engine: null, snapshot: null });
  },

  proceedToCalibration: () => {
    if (get().drillId) set({ arenaMode: "calibration" });
  },

  startDrill: () => {
    const { drillId, level, perfModeId } = get();
    const def = drillId ? drillById(drillId) : undefined;
    if (!def) return;
    const engine = createDrillSession(
      def,
      level,
      PERF_MODES[perfModeId].maxPooledTargets,
      Date.now() % 2147483647,
      get().drillOptions,
    );
    engine.start();
    set({ engine, arenaMode: "drill", snapshot: engine.getSnapshot(), lastFinished: null });
  },

  updateSnapshot: (snapshot) => set({ snapshot }),

  pauseDrill: () => {
    const e = get().engine;
    e?.pause();
    if (e) set({ snapshot: e.getSnapshot() });
  },
  resumeDrill: () => {
    const e = get().engine;
    e?.resume();
    if (e) set({ snapshot: e.getSnapshot() });
  },
  stopDrill: () => {
    // Trainer stop — engine emits 'aborted'; finishDrill builds a partial result
    get().engine?.stop();
  },

  finishDrill: () => {
    const { engine, athlete, level, drillId, xrSupport } = get();
    const def = drillId ? drillById(drillId) : undefined;
    if (!engine || !def) return;
    const lvl = levelFor(def, level);
    const finished = buildSessionResult(engine, {
      athleteId: athlete.id,
      athleteName: athlete.name,
      level,
      levelLabel: lvl.label,
      device: deviceInfo(xrSupport),
    });
    set({ lastFinished: finished, arenaMode: "results", engine: null, snapshot: null });
  },

  saveLastSession: async () => {
    const { lastFinished } = get();
    if (!lastFinished) return;
    saveSession(lastFinished.result);
    const outcome = await syncSessionToEMR(lastFinished.result);
    set({ sessions: loadSessions(), lastSyncMessage: outcome.message });
  },

  runAgain: (atLevel) => {
    const { lastFinished } = get();
    if (atLevel !== undefined) set({ level: atLevel });
    else if (lastFinished) set({ level: lastFinished.recommendation.suggestedLevel });
    set({ arenaMode: "calibration", lastFinished: null });
  },

  refreshSessions: () => set({ sessions: loadSessions() }),
}));

/** Non-reactive accessor for frame-loop code (never re-renders). */
export const appStore = useAppStore;
