import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { PHASE_META } from "@/ares/phases";
import { useAppStore } from "@/app/providers/appStore";
import { SpatialPanel, PanelButton, PanelText } from "./SpatialPanel";

/**
 * Athlete HUD — live performance strip during a drill.
 * Low, unobtrusive, world-locked below the target field.
 * The PAUSE and TRAINER STOP controls sit in their own row DIRECTLY BELOW
 * the scoring dashboard — never overlapping the metrics, for every drill.
 */
export function AthleteHUD() {
  const snapshot = useAppStore((s) => s.snapshot);
  const engine = useAppStore((s) => s.engine);
  const { pauseDrill, resumeDrill, stopDrill } = useAppStore.getState();

  if (!engine || !snapshot) return null;
  const meta = PHASE_META[engine.definition.phase];
  const secondsLeft = Math.max(0, Math.ceil(snapshot.remainingMs / 1000));
  const stopwatch = engine.definition.stopwatch
    ? `${(Math.max(0, snapshot.elapsedMs - 600) / 1000).toFixed(1)}s`
    : null;
  const paused = snapshot.state === "paused";

  return (
    // one tilted group so the dashboard and its control row stay aligned
    <group position={[0, 0.78, -1.75]} rotation={[-0.32, 0, 0]}>
      {/* scoring dashboard — full width, nothing overlaps the numbers */}
      <SpatialPanel position={[0, 0, 0]} width={1.5} height={0.3} accent={meta.color}>
        <PanelText
          position={[-0.68, 0.06, 0]}
          text={`${engine.definition.shortName}  |  ${meta.phase.toUpperCase()}`}
          size={0.04}
          mono
          color={meta.color}
          maxWidth={1.4}
        />
        <PanelText
          position={[-0.68, -0.06, 0]}
          text={`${stopwatch ?? `${secondsLeft}s`} | HIT ${snapshot.hits} | ERR ${snapshot.errors} | ${snapshot.accuracyPct}% | STK ${snapshot.streak}${
            snapshot.lastReactionMs ? ` | ${Math.round(snapshot.lastReactionMs)}ms` : ""
          }`}
          size={0.048}
          color={snapshot.streak >= 10 ? ARES_COLORS.warningGold : snapshot.streak >= 5 ? ARES_ACCENTS.tealBright : ARES_COLORS.white}
          maxWidth={1.4}
          mono
        />
      </SpatialPanel>

      {/* control row — directly underneath the dashboard, clear of the view */}
      <PanelButton
        position={[-0.3, -0.245, 0]}
        width={0.5}
        height={0.1}
        fontSize={0.036}
        label={paused ? "RESUME" : "PAUSE"}
        color={paused ? ARES_ACCENTS.goSignal : ARES_COLORS.deepPurple}
        textColor={paused ? ARES_COLORS.nearBlack : ARES_COLORS.white}
        onClick={paused ? resumeDrill : pauseDrill}
      />
      <PanelButton
        position={[0.3, -0.245, 0]}
        width={0.5}
        height={0.1}
        fontSize={0.036}
        label="TRAINER STOP"
        color={ARES_COLORS.errorRed}
        onClick={stopDrill}
      />
    </group>
  );
}
