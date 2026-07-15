import { useState } from "react";
import { useAppStore } from "@/app/providers/appStore";
import { AegisRunner } from "@/vr/AegisRunner";
import { SpatialPanel, PanelText, PanelButton } from "@/vr/SpatialPanel";
import { TIER_ORDER, TIER_LABEL, modeAllowed, handRuleAllowed } from "@/aegis/tiers";
import type { AegisMode, HandRule, AegisTier } from "@/aegis/types";
import { ARES_COLORS } from "@/ares/colors";

/** The live AEGIS session — the runner plus the trainer's stop control. */
export function AegisSession() {
  const settings = useAppStore((s) => s.aegis);
  const finishAegis = useAppStore((s) => s.finishAegis);
  // one fresh random seed PER session mount — different every run, stable during the run
  const [seed] = useState(() => (Date.now() ^ Math.floor(Math.random() * 2147483647)) % 2147483647);
  return (
    <group>
      <AegisRunner
        settings={settings}
        seed={seed}
        onComplete={(m) => finishAegis(m)}
        onExit={() => useAppStore.setState({ arenaMode: "aegisSetup" })}
      />
    </group>
  );
}

/**
 * AEGIS SETUP — tier, interaction mode, hand rule, bonus round.
 *
 * Every tier is selectable from the start (§17). There are no unlock gates here,
 * deliberately: an elite athlete should never have to grind through Beginner to
 * be measured at GOAT, and a novice should never be told they are not allowed to
 * look at the thing they are training toward. What IS gated is the reserved
 * combinations — Mixed mode and Adaptive rule-switching require the top tiers,
 * because below them the athlete does not yet have the base competencies those
 * modes assume, and measuring them would produce a number that means nothing.
 */
export function AegisSetup() {
  const a = useAppStore((s) => s.aegis);
  const setAegis = useAppStore((s) => s.setAegis);
  const startAegis = useAppStore((s) => s.startAegis);
  const goHome = useAppStore((s) => s.goHome);

  const cycleTier = () => {
    const i = TIER_ORDER.indexOf(a.tier);
    setAegis({ tier: TIER_ORDER[(i + 1) % TIER_ORDER.length] as AegisTier });
  };
  const cycleMode = () => {
    const all: AegisMode[] = ["block", "catch", "mixed"];
    const ok = all.filter((m) => modeAllowed(a.tier, m));
    setAegis({ mode: ok[(ok.indexOf(a.mode) + 1) % ok.length] });
  };
  const cycleRule = () => {
    const all: HandRule[] = ["symmetric", "asymmetric", "adaptive"];
    const ok = all.filter((r) => handRuleAllowed(a.tier, r));
    setAegis({ handRule: ok[(ok.indexOf(a.handRule) + 1) % ok.length] });
  };

  const MODE_DESC: Record<AegisMode, string> = {
    block: "Intercept valid objects. Drive INTO them.",
    catch: "Close the grip inside the window. Hold it.",
    mixed: "Read each object: block it, or catch it.",
  };
  const RULE_DESC: Record<HandRule, string> = {
    symmetric: "Either hand takes any target.",
    asymmetric: "Shape and colour decide the hand.",
    adaptive: "The hand rule flips mid-session. You are warned.",
  };

  return (
    <group position={[0, 0, 0]}>
      <SpatialPanel position={[0, 1.5, -1.35]} width={1.5} height={1.62}
        title="AEGIS" accent={ARES_COLORS.deepPurple}>
        <PanelText position={[-0.68, 0.66, 0]} text="EYE-HAND COORDINATION · 5:00 + BONUS UNTIL FAILURE"
          size={0.032} color={ARES_COLORS.softGray} />

        <PanelText position={[-0.68, 0.5, 0]} text="TIER" size={0.036} color={ARES_COLORS.softGray} />
        <PanelButton position={[0.3, 0.5, 0]} label={TIER_LABEL[a.tier].toUpperCase()}
          onClick={cycleTier} width={0.62} height={0.1} />

        <PanelText position={[-0.68, 0.32, 0]} text="MODE" size={0.036} color={ARES_COLORS.softGray} />
        <PanelButton position={[0.3, 0.32, 0]} label={a.mode.toUpperCase()}
          onClick={cycleMode} width={0.62} height={0.1} />
        <PanelText position={[-0.68, 0.2, 0]} text={MODE_DESC[a.mode]} size={0.028} color={ARES_COLORS.electricTeal} />

        <PanelText position={[-0.68, 0.04, 0]} text="HANDS" size={0.036} color={ARES_COLORS.softGray} />
        <PanelButton position={[0.3, 0.04, 0]} label={a.handRule.toUpperCase()}
          onClick={cycleRule} width={0.62} height={0.1} />
        <PanelText position={[-0.68, -0.08, 0]} text={RULE_DESC[a.handRule]} size={0.028} color={ARES_COLORS.electricTeal} />

        <PanelText position={[-0.68, -0.24, 0]} text="BONUS ROUND" size={0.036} color={ARES_COLORS.softGray} />
        <PanelButton position={[0.3, -0.24, 0]} label={a.bonusEnabled ? "ON" : "OFF"}
          onClick={() => setAegis({ bonusEnabled: !a.bonusEnabled })} width={0.62} height={0.1} />

        <PanelText position={[-0.68, -0.42, 0]}
          text="PURPLE OCTAHEDRON = RIGHT · TEAL CUBE = LEFT · WHITE SPHERE = EITHER"
          size={0.026} color={ARES_COLORS.softGray} />
        <PanelText position={[-0.68, -0.5, 0]}
          text="SPIKED = BOMB, DODGE WITH HEAD/TORSO · HOLLOW RING = NO-GO, DO NOT TOUCH"
          size={0.026} color="#FF4D6D" />

        <PanelButton position={[-0.36, -0.68, 0]} label="BACK" onClick={goHome} width={0.5} height={0.12} />
        <PanelButton position={[0.36, -0.68, 0]} label="BEGIN" onClick={startAegis} width={0.5} height={0.12}
          color={ARES_COLORS.deepPurple} accent={ARES_COLORS.electricTeal} />
      </SpatialPanel>
    </group>
  );
}

/** Results. Metrics first, derived indices second — nothing dressed up. */
export function AegisResultsPanel() {
  const m = useAppStore((s) => s.aegisResult);
  const a = useAppStore((s) => s.aegis);
  const startAegis = useAppStore((s) => s.startAegis);
  const goHome = useAppStore((s) => s.goHome);
  if (!m) return null;

  const row = (y: number, k: string, v: string, c: string = ARES_COLORS.white) => (
    <group key={k + y}>
      <PanelText position={[-0.86, y, 0]} text={k} size={0.03} color={ARES_COLORS.softGray} />
      <PanelText position={[0.16, y, 0]} text={v} size={0.032} color={c} />
    </group>
  );
  const idx = (x: number, y: number, k: string, v: number) => (
    <group key={k}>
      <PanelText position={[x, y, 0]} text={String(v)} size={0.055}
        color={v >= 75 ? ARES_COLORS.electricTeal : v >= 50 ? ARES_COLORS.white : "#FF9F1C"} />
      <PanelText position={[x, y - 0.06, 0]} text={k} size={0.022} color={ARES_COLORS.softGray} />
    </group>
  );

  return (
    <SpatialPanel position={[0, 1.5, -1.4]} width={1.95} height={1.75}
      title="AEGIS — SESSION COMPLETE" accent={ARES_COLORS.deepPurple}>
      <PanelText position={[-0.86, 0.72, 0]}
        text={`${a.tier.toUpperCase()} · ${a.mode.toUpperCase()} · ${a.handRule.toUpperCase()}${a.custom ? " · CUSTOM (UNRANKED)" : ""}`}
        size={0.03} color={ARES_COLORS.softGray} />

      {row(0.6, "SCORE", m.performanceScore.toLocaleString(), ARES_COLORS.electricTeal)}
      {row(0.52, "TOTAL HITS  ·  LONGEST STREAK", `${m.totalHits}  ·  ${m.longestStreak}`)}
      {row(0.44, "PERFECT · GOOD · POOR", `${m.precision.perfectPct}%  ·  ${m.precision.goodPct}%  ·  ${m.precision.poorPct}%`,
        m.precision.perfectPct >= 40 ? ARES_COLORS.electricTeal : m.precision.perfectPct >= 20 ? ARES_COLORS.white : "#FF9F1C")}
      {row(0.36, "COMPOSITE RATING", a.custom ? "UNRANKED" : m.compositeRating.toLocaleString())}
      {row(0.28, "ACCURACY", `${m.accuracyPct}%`)}
      {row(0.2, "REACTION (avg / best)", `${m.avgRT}ms  /  ${m.fastestRT}ms`)}
      {row(0.12, "LEFT vs RIGHT RT", `${m.leftRT}ms  vs  ${m.rightRT}ms`)}
      {row(0.04, "BOMB AVOIDANCE", `${m.bombAvoidPct}%  (${m.bombContacts} contacts)`,
        m.bombContacts === 0 ? ARES_COLORS.electricTeal : "#FF4D6D")}
      {row(-0.04, "NO-GO INHIBITION", `${m.nogoAvoidPct}%  (${m.nogoContacts} contacts)`)}
      {row(-0.12, "WRONG HAND", String(m.wrongHand), m.wrongHand === 0 ? ARES_COLORS.electricTeal : "#FF9F1C")}
      {row(-0.2, "PEAK TRACKING LOAD", `${m.trackingLoadCapacity} objects`)}
      {row(-0.28, "BONUS DEPTH", m.bonusStage > 0
        ? `stage ${m.bonusStage} · ${(m.bonusDurationMs / 1000).toFixed(0)}s · ${m.failCause ?? ""}`
        : "not reached")}
      {row(-0.36, "BREAKDOWN POINT", m.eliteBreakdownPoint ? `bonus stage ${m.eliteBreakdownPoint}` : "never broke")}

      {/* Derived indices — stated plainly, never as clinical claims. */}
      {idx(-0.78, -0.46, "DECISION", m.decisionEfficiency)}
      {idx(-0.44, -0.46, "BILATERAL", m.bilateralCoordination)}
      {idx(-0.1, -0.46, "INHIBITION", m.inhibitionControl)}
      {idx(0.24, -0.46, "RECOVERY", m.recoveryResilience)}
      {idx(0.58, -0.46, "PRESSURE", m.pressureStability)}
      {idx(0.88, -0.46, "ECONOMY", m.movementEconomy)}
      {idx(1.14, -0.46, "LOCALIZE", m.precision.localizationIndex)}

      <PanelText position={[-0.86, -0.6, 0]} text={m.advanceReason} size={0.024}
        color={m.advanceReady ? ARES_COLORS.electricTeal : "#FF9F1C"} maxWidth={1.85} />
      <PanelText position={[-0.86, -0.66, 0]}
        text="Performance descriptors from this session only. Not diagnostic."
        size={0.022} color={ARES_COLORS.softGray} />

      <PanelButton position={[-0.36, -0.76, 0]} label="ARENA" onClick={goHome} width={0.5} height={0.12} />
      <PanelButton position={[0.36, -0.76, 0]} label="RUN AGAIN" onClick={startAegis} width={0.5} height={0.12}
        color={ARES_COLORS.deepPurple} accent={ARES_COLORS.electricTeal} />
    </SpatialPanel>
  );
}
