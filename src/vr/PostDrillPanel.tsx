import { useState } from "react";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { PHASE_META } from "@/ares/phases";
import { aqBand } from "@/ares/aq";
import { useAppStore } from "@/app/providers/appStore";
import { SpatialPanel, PanelButton, PanelText } from "./SpatialPanel";

/**
 * Post-drill breakdown space — AQ score, metric grid, and the adaptive
 * progression recommendation, floating where the drill just happened.
 */
export function PostDrillPanel() {
  const lastFinished = useAppStore((s) => s.lastFinished);
  const { saveLastSession, runAgain, goHome } = useAppStore.getState();
  const [saved, setSaved] = useState(false);
  if (!lastFinished) return null;

  const { result, recommendation } = lastFinished;
  const meta = PHASE_META[result.phase];
  const m = result.metrics;
  const aq = result.aq.overall;

  const rows: string[] = [
    `Trials ${m.trials}    Correct ${m.correct}    Accuracy ${m.accuracyPct}%`,
    m.avgReactionMs !== undefined
      ? `Reaction avg ${m.avgReactionMs}ms   median ${m.medianReactionMs}ms   best ${m.fastestReactionMs}ms`
      : "Reaction —",
    `False starts ${m.falseStarts ?? 0}    No-go failures ${m.noGoFailures ?? 0}    Wrong hand ${m.wrongHandErrors ?? 0}`,
    `Peripheral misses ${m.peripheralMisses ?? 0}    L/R asym ${m.leftRightAsymmetryPct ?? 0}%    Drift ${m.fatigueDriftPct ?? 0}%`,
    `Consistency ±${m.timingConsistencyMs ?? 0}ms    Speed-accuracy ${m.speedAccuracyIndex ?? "—"}`,
  ];

  const zoneColor =
    recommendation.goldilocks === "inZone"
      ? ARES_ACCENTS.goSignal
      : recommendation.goldilocks === "underloaded"
        ? ARES_ACCENTS.tealBright
        : ARES_COLORS.errorRed;

  return (
    <group>
      <SpatialPanel
        position={[0, 1.62, -2.0]}
        width={1.9}
        height={1.45}
        title={`${result.drillName} — Results`}
        accent={meta.color}
      >
        {/* AQ block */}
        <PanelText
          position={[-0.86, 0.5, 0]}
          text={`AQ ${meta.phase}`}
          size={0.045}
          color={meta.color}
        />
        <PanelText
          position={[-0.86, 0.33, 0]}
          text={`${aq ?? "—"}`}
          size={0.16}
          color={ARES_COLORS.white}
        />
        <PanelText
          position={[-0.86, 0.17, 0]}
          text={aqBand(aq)}
          size={0.045}
          color={ARES_COLORS.warningGold}
        />

        {/* metric rows */}
        {rows.map((r, i) => (
          <PanelText
            key={i}
            position={[-0.35, 0.5 - i * 0.11, 0]}
            text={r}
            size={0.038}
            maxWidth={1.25}
          />
        ))}

        {/* AQ notes */}
        {(result.aq.notes ?? []).slice(0, 3).map((n, i) => (
          <PanelText
            key={`n-${i}`}
            position={[-0.86, -0.02 - i * 0.075, 0]}
            text={`• ${n}`}
            size={0.034}
            color={ARES_COLORS.softGray}
            maxWidth={1.7}
          />
        ))}

        {/* recommendation */}
        <PanelText
          position={[-0.86, -0.28, 0]}
          text={`${recommendation.headline.toUpperCase()}  (${recommendation.goldilocks === "inZone" ? "Goldilocks Zone" : recommendation.goldilocks})`}
          size={0.048}
          color={zoneColor}
          maxWidth={1.7}
        />
        <PanelText
          position={[-0.86, -0.42, 0]}
          text={recommendation.detail}
          size={0.034}
          maxWidth={1.7}
        />

        <PanelButton
          position={[-0.62, -0.6, 0]}
          width={0.52}
          height={0.12}
          label={saved ? "SAVED ✓" : "SAVE SESSION"}
          color={saved ? ARES_COLORS.graphite : ARES_ACCENTS.tealBright}
          textColor={saved ? ARES_COLORS.softGray : ARES_COLORS.nearBlack}
          onClick={() => {
            void saveLastSession();
            setSaved(true);
          }}
        />
        <PanelButton
          position={[0, -0.6, 0]}
          width={0.52}
          height={0.12}
          label={`RUN AGAIN — L${recommendation.suggestedLevel}`}
          color={ARES_COLORS.deepPurple}
          onClick={() => runAgain()}
        />
        <PanelButton
          position={[0.62, -0.6, 0]}
          width={0.52}
          height={0.12}
          label="ARENA HOME"
          color={ARES_COLORS.graphite}
          onClick={goHome}
        />
      </SpatialPanel>
    </group>
  );
}
