import { create } from "zustand";
import type { ARESPhase } from "@/ares/phases";
import type { Athlete, ARESDrillSessionResult, DeviceInfo } from "@/data/schemas";
import { MOCK_ATHLETES } from "@/data/mockAthletes";
import { loadSessions, saveSession } from "@/data/sessionStore";
import { syncSessionToEMR } from "@/data/api";
import { drillById } from "@/drills/registry";
import { groupForPhase as groupForPhaseLocal } from "@/ares/phases";
import { ORG_PIN } from "@/ares/constants";
import { createDrillSession } from "@/drills/shared/DrillSession";
import { buildSessionResult, type FinishedDrill } from "@/drills/shared/DrillResult";
import { levelFor } from "@/drills/shared/ProgressionEngine";
import { PERFORM_TIERS, TIER_GATE_ACCURACY, UNGATED_TIERS } from "@/perform/tiers";
import { modeAllowed, handRuleAllowed } from "@/aegis/tiers";
import { resolveEnvironment } from "@/ares/environments";

const TIER_KEY = "ares.perform.tierUnlocks.v1";
function loadTierUnlocks(): Record<string, number> {
  try {
    const raw = localStorage.getItem(TIER_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}
function saveTierUnlocks(t: Record<string, number>): void {
  try {
    localStorage.setItem(TIER_KEY, JSON.stringify(t));
  } catch {
    /* storage unavailable — unlocks stay session-local */
  }
}

const ENV_KEY = "ares.environment.v1";
function loadEnvPref(): import("@/ares/drillTypes").EnvironmentId {
  try {
    const raw = localStorage.getItem(ENV_KEY);
    return (raw as import("@/ares/drillTypes").EnvironmentId) || "arena";
  } catch {
    return "arena";
  }
}
function saveEnvPref(id: import("@/ares/drillTypes").EnvironmentId): void {
  try {
    localStorage.setItem(ENV_KEY, id);
  } catch {
    /* storage unavailable — the choice stays session-local */
  }
}
import type { DrillEngine, DrillSnapshot } from "@/drills/shared/DrillEngine";
import { detectHeadset, detectBrowser } from "@/utils/questDetection";
import { EMPTY_XR_SUPPORT, type XRSupportInfo } from "@/utils/xrSupport";
import { PERF_MODES, defaultPerfMode, type PerfModeId } from "@/utils/performance";

export type ArenaMode = "envSelect" | "home" | "setup" | "calibration" | "drill" | "results" | "aegisSetup" | "aegis" | "aegisResults" | "seqSetup" | "sequence" | "seqResults" | "keySetup" | "keystone" | "keyResults" | "gauntletSetup" | "gauntlet" | "gauntletResults";

interface AppState {
  // device & support
  xrSupport: XRSupportInfo;
  perfModeId: PerfModeId;
  seated: boolean;
  /**
   * Athlete's chosen surround venue. Applies to every drill that is not
   * environment-locked (see @/ares/environments). Persisted across sessions.
   */
  environmentPref: import("@/ares/drillTypes").EnvironmentId;
  strobeLevel: number;
  orgUnlocked: boolean;
  /** highest PERFORM tier unlocked per drill (earned, persisted) */
  tierUnlocks: Record<string, number>;
  /** AEGIS — the flagship eye-hand drill runs on its own continuous engine */
  aegis: import("@/aegis/types").AegisSettings;
  aegisResult: import("@/aegis/metrics").AegisMetrics | null;
  gauntlet: import("@/gauntlet/engine").GauntletSettings;
  gauntletResult: import("@/gauntlet/engine").GauntletMetrics | null;
  /** SEQUENCE COMMAND — peripheral intake -> central decision -> bilateral execution */
  sequence: import("@/sequence/types").SeqSettings;
  sequenceResult: import("@/sequence/metrics").SeqMetrics | null;
  /** KEYSTONE — whole-body visual-motor integration */
  keystone: import("@/keystone/types").KeySettings;
  keystoneResult: import("@/keystone/metrics").KeyMetrics | null;
  // session setup
  athlete: Athlete;
  group: import("@/ares/phases").ArenaGroupId | null;
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
  setEnvironmentPref(id: import("@/ares/drillTypes").EnvironmentId): void;
  openEnvironmentSelect(): void;
  setStrobeLevel(level: number): void;
  unlockOrg(pin: string): boolean;
  unlockedTier(drillId: string): number;
  setAegis(p: Partial<import("@/aegis/types").AegisSettings>): void;
  startAegis(): void;
  finishAegis(m: import("@/aegis/metrics").AegisMetrics): void;
  setGauntlet(p: Partial<import("@/gauntlet/engine").GauntletSettings>): void;
  startGauntlet(): void;
  finishGauntlet(m: import("@/gauntlet/engine").GauntletMetrics): void;
  setSequence(p: Partial<import("@/sequence/types").SeqSettings>): void;
  startSequence(): void;
  finishSequence(m: import("@/sequence/metrics").SeqMetrics): void;
  setKeystone(p: Partial<import("@/keystone/types").KeySettings>): void;
  startKeystone(): void;
  finishKeystone(m: import("@/keystone/metrics").KeyMetrics): void;
  setAthlete(a: Athlete): void;
  selectGroup(id: import("@/ares/phases").ArenaGroupId | null): void;
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
  environmentPref: loadEnvPref(),
  strobeLevel: 0,
  orgUnlocked: false,
  athlete: MOCK_ATHLETES[0],
  group: null,
  phase: null,
  sport: null,
  drillId: null,
  level: 1,
  tierUnlocks: loadTierUnlocks(),
  aegis: { tier: "intermediate", mode: "block", handRule: "asymmetric", bonusEnabled: true },
  aegisResult: null,
  gauntlet: { tier: "intermediate", handRule: "asymmetric", bonusEnabled: true },
  gauntletResult: null,
  sequence: { tier: "intermediate", mode: "training", bonusEnabled: true },
  sequenceResult: null,
  keystone: { tier: "intermediate", mode: "training", bonusEnabled: true },
  keystoneResult: null,
  drillOptions: {},
  arenaMode: "envSelect",
  engine: null,
  snapshot: null,
  lastFinished: null,
  lastSyncMessage: null,
  sessions: loadSessions(),

  setXRSupport: (info) => set({ xrSupport: info }),
  setPerfMode: (id) => set({ perfModeId: id }),
  setSeated: (seated) => set({ seated }),
  setEnvironmentPref: (id) => {
    saveEnvPref(id);
    set({ environmentPref: id });
  },
  openEnvironmentSelect: () => set({ arenaMode: "envSelect" }),
  setStrobeLevel: (level) => set({ strobeLevel: Math.max(0, Math.min(5, level)) }),
  unlockedTier: (drillId) => Math.max(UNGATED_TIERS, get().tierUnlocks[drillId] ?? UNGATED_TIERS),

  setAegis: (p) => {
    const next = { ...get().aegis, ...p };
    // Reserved combinations are guarded in the STORE as well as the engine, so a
    // stale UI selection can never smuggle Mixed or Adaptive into a low tier.
    if (!modeAllowed(next.tier, next.mode)) next.mode = "block";
    if (!handRuleAllowed(next.tier, next.handRule)) next.handRule = "asymmetric";
    set({ aegis: next });
  },
  startAegis: () => set({ arenaMode: "aegis", aegisResult: null }),
  finishAegis: (m) => set({ arenaMode: "aegisResults", aegisResult: m }),

  setGauntlet: (p) => set({ gauntlet: { ...get().gauntlet, ...p } }),
  startGauntlet: () => set({ arenaMode: "gauntlet", gauntletResult: null }),
  finishGauntlet: (m) => set({ arenaMode: "gauntletResults", gauntletResult: m }),

  setSequence: (p) => {
    const next = { ...get().sequence, ...p };
    // Assessment Mode never runs a bonus round — a bonus-until-fail tail is
    // adaptive by construction, and an adaptive tail would destroy the fixed,
    // repeatable protocol that makes a baseline worth anything.
    if (next.mode === "assessment") next.bonusEnabled = false;
    set({ sequence: next });
  },
  startSequence: () => set({ arenaMode: "sequence", sequenceResult: null }),
  finishSequence: (m) => set({ arenaMode: "seqResults", sequenceResult: m }),

  setKeystone: (p) => {
    const next = { ...get().keystone, ...p };
    // Assessment never runs a bonus round — a bonus-until-fail tail is adaptive by
    // construction, and adaptation destroys the fixed protocol a baseline requires.
    if (next.mode === "assessment") next.bonusEnabled = false;
    set({ keystone: next });
  },
  startKeystone: () => set({ arenaMode: "keystone", keystoneResult: null }),
  finishKeystone: (m) => set({ arenaMode: "keyResults", keystoneResult: m }),
  unlockOrg: (pin) => {
    const ok = pin === ORG_PIN;
    if (ok) set({ orgUnlocked: true });
    return ok;
  },
  setAthlete: (athlete) => set({ athlete }),

  selectGroup: (id) => {
    if (id === "assess") set({ group: id, phase: "Assess", sport: null, drillId: null, level: 1, arenaMode: "setup" });
    // Perform is now a THREE-portal suite (Synch / AEGIS / Sequence Command),
    // so selecting it opens a sub-menu rather than jumping straight to a drill.
    else if (id === "perform") set({ group: id, phase: null, sport: null, drillId: null, level: 1, arenaMode: "setup" });
    else if (id === "training") set({ group: id, phase: null, sport: null, drillId: null, level: 1, arenaMode: "setup" });
    else set({ group: null, phase: null, sport: null, drillId: null, arenaMode: "home" });
  },

  selectPhase: (phase) =>
    set({
      phase,
      group: phase ? groupForPhaseLocal(phase) : null,
      sport: null,
      drillId: null,
      level: 1,
      arenaMode: phase ? "setup" : "home",
    }),

  selectSport: (id) => set({ sport: id, drillId: null, level: 1 }),

  selectDrill: (drillId) => set({ drillId, level: 1, drillOptions: {} }),

  launchPrescribed: (drillId, level) => {
    const def = drillById(drillId);
    if (!def) return;
    set({ phase: def.phase, group: groupForPhaseLocal(def.phase), drillId, level, drillOptions: {}, arenaMode: "calibration" });
  },
  setLevel: (level) => set({ level }),
  setDrillOption: (id, value) =>
    set((s) => ({ drillOptions: { ...s.drillOptions, [id]: value } })),

  goHome: () => {
    get().engine?.stop();
    set({ arenaMode: "home", group: null, phase: null, sport: null, drillId: null, engine: null, snapshot: null });
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
    /**
     * Stamp the environment onto the record. Two runs of the same drill in
     * different venues are not automatically comparable, and the results view
     * needs to be able to say so rather than trending them silently.
     */
    finished.result.progression.parameters = {
      ...finished.result.progression.parameters,
      strobeLevel: get().strobeLevel,
      environment: resolveEnvironment(def, get().environmentPref),
    };

    // PERFORM TIER GATE — clearing a tier at >=85% accuracy unlocks the next
    // rung. Survival is not enough; the mechanic has to have been absorbed.
    let tierUnlocks = get().tierUnlocks;
    if (def.phase === "Perform" && finished.result.metrics.accuracyPct >= TIER_GATE_ACCURACY) {
      const earned = Math.min(PERFORM_TIERS, level + 1);
      const held = Math.max(UNGATED_TIERS, tierUnlocks[def.id] ?? UNGATED_TIERS);
      if (earned > held) {
        tierUnlocks = { ...tierUnlocks, [def.id]: earned };
        saveTierUnlocks(tierUnlocks);
      }
    }
    set({ lastFinished: finished, arenaMode: "results", engine: null, snapshot: null, tierUnlocks });
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
