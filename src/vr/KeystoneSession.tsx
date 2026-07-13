import { useAppStore } from "@/app/providers/appStore";
import { KeystoneRunner } from "@/vr/KeystoneRunner";
import { SpatialPanel, PanelText, PanelButton } from "@/vr/SpatialPanel";
import { TIER_ORDER, TIER_LABEL, TIER_VERB } from "@/keystone/tiers";
import type { KeyTier, KeyMode } from "@/keystone/types";
import { ARES_COLORS } from "@/ares/colors";

export function KeystoneSession() {
  const s = useAppStore((x) => x.keystone);
  const finish = useAppStore((x) => x.finishKeystone);
  return (
    <KeystoneRunner
      settings={s}
      seed={Date.now() % 2147483647}
      onComplete={finish}
      onExit={() => useAppStore.setState({ arenaMode: "keySetup" })}
    />
  );
}

export function KeystoneSetup() {
  const s = useAppStore((x) => x.keystone);
  const setKeystone = useAppStore((x) => x.setKeystone);
  const startKeystone = useAppStore((x) => x.startKeystone);
  const goHome = useAppStore((x) => x.goHome);

  const cycleTier = () => {
    const i = TIER_ORDER.indexOf(s.tier);
    setKeystone({ tier: TIER_ORDER[(i + 1) % TIER_ORDER.length] as KeyTier });
  };
  const cycleMode = () =>
    setKeystone({ mode: (s.mode === "training" ? "assessment" : "training") as KeyMode });

  const DESC: Record<KeyTier, string> = {
    beginner: "Both hands, together, slowly. Learn what a coordinated position feels like.",
    intermediate: "One side works while the other stays STILL. Harder than it sounds.",
    advanced: "Pose, rhythm and force become one task. Head and arms diverge.",
    pro: "The pattern changes while you are executing it. Cancel what you loaded.",
    goat: "Four segments, four roles, two clocks. Almost no feedback.",
  };

  return (
    <SpatialPanel position={[0, 1.5, -1.4]} width={1.62} height={1.58}
      title="KEYSTONE" accent={ARES_COLORS.deepPurple}>
      <PanelText position={[-0.74, 0.62, 0]}
        text="WHOLE-BODY VISUAL-MOTOR INTEGRATION · 5:00 + BONUS UNTIL FAILURE"
        size={0.027} color={ARES_COLORS.softGray} />

      <PanelText position={[-0.74, 0.45, 0]} text="TIER" size={0.036} color={ARES_COLORS.softGray} />
      <PanelButton position={[0.34, 0.45, 0]} label={TIER_VERB[s.tier]}
        onClick={cycleTier} width={0.66} height={0.1} />
      <PanelText position={[-0.74, 0.33, 0]} text={TIER_LABEL[s.tier]} size={0.031}
        color={ARES_COLORS.electricTeal} />
      <PanelText position={[-0.74, 0.23, 0]} text={DESC[s.tier]} size={0.027}
        color={ARES_COLORS.softGray} />

      <PanelText position={[-0.74, 0.05, 0]} text="MODE" size={0.036} color={ARES_COLORS.softGray} />
      <PanelButton position={[0.34, 0.05, 0]} label={s.mode.toUpperCase()}
        onClick={cycleMode} width={0.66} height={0.1} />
      <PanelText position={[-0.74, -0.07, 0]}
        text={s.mode === "training"
          ? "Adaptive. Escalates on clean streaks. Ranked."
          : "Fixed protocol. Nothing adapts. Repeatable. NOT ranked."}
        size={0.027} color={s.mode === "assessment" ? ARES_COLORS.electricTeal : ARES_COLORS.softGray} />

      <PanelText position={[-0.74, -0.24, 0]}
        text="SPHERE = go there.   GREY RING = stay exactly where you are."
        size={0.028} color={ARES_COLORS.white} />
      <PanelText position={[-0.74, -0.33, 0]}
        text="Arriving is easy. STOPPING is the drill. The ring shows your drift."
        size={0.028} color={ARES_COLORS.electricTeal} />
      <PanelText position={[-0.74, -0.42, 0]}
        text="Planted stance. No stepping. Stay inside your calibrated reach."
        size={0.025} color={ARES_COLORS.softGray} />

      <PanelButton position={[-0.36, -0.6, 0]} label="BACK" onClick={goHome} width={0.5} height={0.12} />
      <PanelButton position={[0.36, -0.6, 0]} label="BEGIN" onClick={startKeystone} width={0.5} height={0.12}
        color={ARES_COLORS.deepPurple} accent={ARES_COLORS.electricTeal} />
    </SpatialPanel>
  );
}

export function KeystoneResultsPanel() {
  const m = useAppStore((x) => x.keystoneResult);
  const s = useAppStore((x) => x.keystone);
  const startKeystone = useAppStore((x) => x.startKeystone);
  const goHome = useAppStore((x) => x.goHome);
  if (!m) return null;

  const row = (y: number, k: string, v: string, c: string = ARES_COLORS.white) => (
    <group key={k}>
      <PanelText position={[-0.92, y, 0]} text={k} size={0.029} color={ARES_COLORS.softGray} />
      <PanelText position={[0.22, y, 0]} text={v} size={0.032} color={c} />
    </group>
  );
  const idx = (x: number, y: number, k: string, v: number) => (
    <group key={k}>
      <PanelText position={[x, y, 0]} text={String(v)} size={0.05}
        color={v >= 75 ? ARES_COLORS.electricTeal : v >= 50 ? ARES_COLORS.white : "#FF9F1C"} />
      <PanelText position={[x, y - 0.052, 0]} text={k} size={0.019} color={ARES_COLORS.softGray} />
    </group>
  );

  return (
    <SpatialPanel position={[0, 1.5, -1.42]} width={2.05} height={1.82}
      title="KEYSTONE — COMPLETE" accent={ARES_COLORS.deepPurple}>
      <PanelText position={[-0.92, 0.76, 0]}
        text={`${TIER_LABEL[s.tier].toUpperCase()} · ${s.mode.toUpperCase()}${m.ranked ? "" : " · NOT RANKED"}`}
        size={0.029} color={ARES_COLORS.softGray} />

      {/* THE SEVEN HEADLINES (§35) */}
      {row(0.64, "TOTAL SCORE", m.score.toLocaleString(), ARES_COLORS.electricTeal)}
      {row(0.56, "SYNCHRONIZATION ACCURACY", `${m.synchronizationAccuracyPct}%  (${m.perfect}/${m.events} clean)`)}
      {row(0.48, "STIMULUS -> MOVEMENT", `${m.initiationMs}ms`)}
      {row(0.40, "BILATERAL COORDINATION", String(m.bilateralCoordination))}
      {row(0.32, "MOVEMENT ECONOMY", `${m.movementEconomy}   (path ${m.meanPathRatio}x ideal)`)}
      {row(0.24, "STABILIZATION CONTROL", `${m.stabilizationControl}   (drift ${(m.meanDriftM * 100).toFixed(1)}cm)`,
        m.stabilizationControl >= 70 ? ARES_COLORS.electricTeal : "#FF9F1C")}
      {row(0.16, "BONUS STAGE", m.bonusStage
        ? `${m.bonusStage} · ${(m.bonusDurationMs / 1000).toFixed(0)}s · ${m.failCause ?? ""}` : "not reached")}

      {row(0.04, "COMPOSITE RATING", m.ranked ? m.compositeRating.toLocaleString() : "UNRANKED",
        ARES_COLORS.electricTeal)}

      {row(-0.08, "PREDICTIVE vs REACTIVE", `${m.predictiveTimingMs}ms  vs  ${m.reactiveTimingMs}ms`)}
      {row(-0.16, "WEAKEST LINK", m.weakestDomain ? m.weakestDomain.toUpperCase() : "none isolated", "#FF9F1C")}
      {row(-0.24, "BREAKDOWN POINT", m.breakdownPoint ? `bonus stage ${m.breakdownPoint}` : "never broke")}

      {/* THE TEN INDICES (§37) */}
      {idx(-0.90, -0.42, "WHOLE-BODY", m.wholeBodySync)}
      {idx(-0.68, -0.42, "COUPLING", m.visualMotorCoupling)}
      {idx(-0.46, -0.42, "BILATERAL", m.bilateralIntegration)}
      {idx(-0.24, -0.42, "POSTURAL*", m.posturalOrganization)}
      {idx(-0.02, -0.42, "TEMPORAL", m.temporalSync)}
      {idx(0.20, -0.42, "STABILIZE", m.stabilizationIndex)}
      {idx(0.42, -0.42, "ADAPT", m.motorAdaptability)}
      {idx(0.64, -0.42, "INHIBIT", m.inhibitionCancellation)}
      {idx(0.86, -0.42, "ECONOMY", m.economyIndex)}
      {idx(1.06, -0.42, "RECOVERY", m.recoveryResilience)}

      <PanelText position={[-0.92, -0.58, 0]} text={m.advanceReason} size={0.024}
        color={m.advanceReady ? ARES_COLORS.electricTeal : "#FF9F1C"} maxWidth={1.9} />
      <PanelText position={[-0.92, -0.65, 0]}
        text="*Postural = repeatability of headset/controller geometry. Not a postural assessment. Not diagnostic."
        size={0.021} color={ARES_COLORS.softGray} maxWidth={1.9} />

      <PanelButton position={[-0.36, -0.78, 0]} label="ARENA" onClick={goHome} width={0.5} height={0.12} />
      <PanelButton position={[0.36, -0.78, 0]} label="RUN AGAIN" onClick={startKeystone} width={0.5} height={0.12}
        color={ARES_COLORS.deepPurple} accent={ARES_COLORS.electricTeal} />
    </SpatialPanel>
  );
}
