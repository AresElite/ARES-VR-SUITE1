import { useAppStore } from "@/app/providers/appStore";
import { SequenceRunner } from "@/vr/SequenceRunner";
import { SpatialPanel, PanelText, PanelButton } from "@/vr/SpatialPanel";
import { TIER_ORDER, TIER_LABEL, TIER_VERB } from "@/sequence/tiers";
import type { SeqTier, SeqMode } from "@/sequence/types";
import { ARES_COLORS } from "@/ares/colors";

export function SequenceSession() {
  const s = useAppStore((x) => x.sequence);
  const finish = useAppStore((x) => x.finishSequence);
  return (
    <SequenceRunner
      settings={s}
      seed={Date.now() % 2147483647}
      onComplete={finish}
      onExit={() => useAppStore.setState({ arenaMode: "seqSetup" })}
    />
  );
}

export function SequenceSetup() {
  const s = useAppStore((x) => x.sequence);
  const setSequence = useAppStore((x) => x.setSequence);
  const startSequence = useAppStore((x) => x.startSequence);
  const goHome = useAppStore((x) => x.goHome);

  const cycleTier = () => {
    const i = TIER_ORDER.indexOf(s.tier);
    setSequence({ tier: TIER_ORDER[(i + 1) % TIER_ORDER.length] as SeqTier });
  };
  const cycleMode = () =>
    setSequence({ mode: (s.mode === "training" ? "assessment" : "training") as SeqMode });

  const TIER_DESC: Record<SeqTier, string> = {
    beginner: "One cue at a time. No delay, no rules. Learn what a cue means.",
    intermediate: "Hold it across a delay. Play it on a beat. Repeat is introduced.",
    advanced: "Two sequences compete. The command picks one — and rewrites it.",
    pro: "No preview. The plan changes WHILE you are executing it.",
    goat: "Two streams. Two clocks. Both updating. Almost no feedback.",
  };

  return (
    <SpatialPanel position={[0, 1.5, -1.4]} width={1.62} height={1.6}
      title="SEQUENCE COMMAND" accent={ARES_COLORS.deepPurple}>
      <PanelText position={[-0.74, 0.64, 0]}
        text="PERIPHERAL INTAKE -> CENTRAL DECISION -> TRANSFORM -> BILATERAL EXECUTION"
        size={0.028} color={ARES_COLORS.softGray} />

      <PanelText position={[-0.74, 0.46, 0]} text="TIER" size={0.036} color={ARES_COLORS.softGray} />
      <PanelButton position={[0.34, 0.46, 0]} label={TIER_VERB[s.tier]}
        onClick={cycleTier} width={0.66} height={0.1} />
      <PanelText position={[-0.74, 0.34, 0]} text={TIER_LABEL[s.tier]} size={0.032}
        color={ARES_COLORS.electricTeal} />
      <PanelText position={[-0.74, 0.24, 0]} text={TIER_DESC[s.tier]} size={0.027}
        color={ARES_COLORS.softGray} />

      <PanelText position={[-0.74, 0.06, 0]} text="MODE" size={0.036} color={ARES_COLORS.softGray} />
      <PanelButton position={[0.34, 0.06, 0]} label={s.mode.toUpperCase()}
        onClick={cycleMode} width={0.66} height={0.1} />
      <PanelText position={[-0.74, -0.06, 0]}
        text={s.mode === "training"
          ? "Adaptive. Escalates on streaks. Ranked on the leaderboard."
          : "Fixed protocol. Nothing adapts. Repeatable. NOT ranked."}
        size={0.027} color={s.mode === "assessment" ? ARES_COLORS.electricTeal : ARES_COLORS.softGray} />

      <PanelText position={[-0.74, -0.24, 0]}
        text="PURPLE OCTAHEDRON = RIGHT HAND · TEAL CUBE = LEFT HAND"
        size={0.027} color={ARES_COLORS.white} />
      <PanelText position={[-0.74, -0.33, 0]}
        text="SYMBOL = ACTION  ( / strike · T block · U catch · = hold · ~ trace · X DO NOT TOUCH )"
        size={0.025} color={ARES_COLORS.softGray} />
      <PanelText position={[-0.74, -0.42, 0]}
        text="WATCH the ring. HOLD it. READ the core. Then GO."
        size={0.03} color={ARES_COLORS.electricTeal} />

      <PanelButton position={[-0.36, -0.62, 0]} label="BACK" onClick={goHome} width={0.5} height={0.12} />
      <PanelButton position={[0.36, -0.62, 0]} label="BEGIN" onClick={startSequence} width={0.5} height={0.12}
        color={ARES_COLORS.deepPurple} accent={ARES_COLORS.electricTeal} />
    </SpatialPanel>
  );
}

/** Results — seven headline metrics (§38), then the eight indices (§40). */
export function SequenceResultsPanel() {
  const m = useAppStore((x) => x.sequenceResult);
  const s = useAppStore((x) => x.sequence);
  const startSequence = useAppStore((x) => x.startSequence);
  const goHome = useAppStore((x) => x.goHome);
  if (!m) return null;

  const row = (y: number, k: string, v: string, c: string = ARES_COLORS.white) => (
    <group key={k}>
      <PanelText position={[-0.9, y, 0]} text={k} size={0.03} color={ARES_COLORS.softGray} />
      <PanelText position={[0.2, y, 0]} text={v} size={0.033} color={c} />
    </group>
  );
  const idx = (x: number, y: number, k: string, v: number) => (
    <group key={k}>
      <PanelText position={[x, y, 0]} text={String(v)} size={0.052}
        color={v >= 75 ? ARES_COLORS.electricTeal : v >= 50 ? ARES_COLORS.white : "#FF9F1C"} />
      <PanelText position={[x, y - 0.055, 0]} text={k} size={0.02} color={ARES_COLORS.softGray} />
    </group>
  );

  return (
    <SpatialPanel position={[0, 1.5, -1.42]} width={2.0} height={1.8}
      title="SEQUENCE COMMAND — COMPLETE" accent={ARES_COLORS.deepPurple}>
      <PanelText position={[-0.9, 0.75, 0]}
        text={`${TIER_LABEL[s.tier].toUpperCase()} · ${s.mode.toUpperCase()}${m.ranked ? "" : " · NOT RANKED"}`}
        size={0.03} color={ARES_COLORS.softGray} />

      {/* THE SEVEN HEADLINES (§38) */}
      {row(0.63, "TOTAL SCORE", m.score.toLocaleString(), ARES_COLORS.electricTeal)}
      {row(0.55, "SEQUENCE ACCURACY", `${m.sequenceAccuracyPct}%  (${m.perfect}/${m.sequences} perfect)`)}
      {row(0.47, "DECISION -> ACTION", `${m.avgDecisionToActionMs}ms`)}
      {row(0.39, "LONGEST PERFECT STREAK", String(m.longestPerfectStreak))}
      {row(0.31, "WORKING-MEMORY SPAN", m.workingMemorySpan ? `${m.workingMemorySpan} items` : "not established")}
      {row(0.23, "HAND SELECTION", `${m.handSelectionAccPct}%`,
        m.handSelectionAccPct >= 95 ? ARES_COLORS.electricTeal : "#FF9F1C")}
      {row(0.15, "BONUS STAGE", m.bonusStage
        ? `${m.bonusStage} · ${(m.bonusDurationMs / 1000).toFixed(0)}s · ${m.failCause ?? ""}`
        : "not reached")}

      {row(0.03, "COMPOSITE RATING", m.ranked ? m.compositeRating.toLocaleString() : "UNRANKED",
        ARES_COLORS.electricTeal)}

      {/* THE BREAKDOWN — this is the coaching payload. Two athletes can both sit
          at 70% and be broken in completely different places. */}
      {row(-0.09, "WEAKEST LINK", m.weakestDomain ? m.weakestDomain.toUpperCase() : "none isolated", "#FF9F1C")}
      {row(-0.17, "CRITICAL ERRORS", String(m.criticalErrors))}
      {row(-0.25, "BREAKDOWN POINT", m.eliteBreakdownPoint
        ? `bonus stage ${m.eliteBreakdownPoint}` : "never broke")}
      {row(-0.33, "LOCALIZATION",
        `PERFECT ${m.precision.perfectPct}%  ·  GOOD ${m.precision.goodPct}%  ·  POOR ${m.precision.poorPct}%`,
        m.precision.localizationIndex >= 70 ? ARES_COLORS.electricTeal
          : m.precision.localizationIndex >= 50 ? ARES_COLORS.white : "#FF9F1C")}

      {/* THE EIGHT INDICES (§40) */}
      {idx(-0.86, -0.44, "INTEGRATION", m.sequenceIntegration)}
      {idx(-0.60, -0.44, "PERIPH>CENT", m.peripheralToCentral)}
      {idx(-0.34, -0.44, "MEMORY", m.workingMemoryCapacity)}
      {idx(-0.08, -0.44, "BILATERAL", m.bilateralSequencing)}
      {idx(0.18, -0.44, "INHIBITION", m.inhibitionControl)}
      {idx(0.44, -0.44, "FLEXIBILITY", m.cognitiveFlexibility)}
      {idx(0.70, -0.44, "TEMPORAL", m.temporalPrecision)}
      {idx(0.94, -0.44, "RECOVERY", m.recoveryResilience)}
      {idx(1.18, -0.44, "LOCALIZE", m.precision.localizationIndex)}

      <PanelText position={[-0.9, -0.58, 0]} text={m.advanceReason} size={0.024}
        color={m.advanceReady ? ARES_COLORS.electricTeal : "#FF9F1C"} maxWidth={1.85} />
      <PanelText position={[-0.9, -0.65, 0]}
        text="Performance descriptors from this session only. Not diagnostic."
        size={0.022} color={ARES_COLORS.softGray} />

      <PanelButton position={[-0.36, -0.76, 0]} label="ARENA" onClick={goHome} width={0.5} height={0.12} />
      <PanelButton position={[0.36, -0.76, 0]} label="RUN AGAIN" onClick={startSequence} width={0.5} height={0.12}
        color={ARES_COLORS.deepPurple} accent={ARES_COLORS.electricTeal} />
    </SpatialPanel>
  );
}
