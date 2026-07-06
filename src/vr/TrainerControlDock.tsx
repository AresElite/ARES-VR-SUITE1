import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { PHASE_META } from "@/ares/phases";
import { useAppStore } from "@/app/providers/appStore";
import { drillsForPhase, drillById } from "@/drills/registry";
import { MOCK_ATHLETES } from "@/data/mockAthletes";
import { PERF_MODES, type PerfModeId } from "@/utils/performance";
import { SpatialPanel, PanelButton, PanelText } from "./SpatialPanel";

/**
 * Trainer Control Dock — one panel, zero menu-diving.
 * Phase → drill → level → calibration, plus athlete / mode / posture
 * controls, all reachable while the athlete stands ready.
 */
export function TrainerControlDock() {
  const phase = useAppStore((s) => s.phase);
  const drillId = useAppStore((s) => s.drillId);
  const level = useAppStore((s) => s.level);
  const athlete = useAppStore((s) => s.athlete);
  const seated = useAppStore((s) => s.seated);
  const perfModeId = useAppStore((s) => s.perfModeId);
  const { selectDrill, setLevel, setAthlete, setSeated, setPerfMode, goHome, proceedToCalibration } =
    useAppStore.getState();

  if (!phase) return null;
  const meta = PHASE_META[phase];
  const drills = drillsForPhase(phase);
  const def = drillId ? drillById(drillId) : undefined;

  const cycleAthlete = () => {
    const idx = MOCK_ATHLETES.findIndex((a) => a.id === athlete.id);
    setAthlete(MOCK_ATHLETES[(idx + 1) % MOCK_ATHLETES.length]);
  };
  const cyclePerf = () => {
    const ids = Object.keys(PERF_MODES) as PerfModeId[];
    setPerfMode(ids[(ids.indexOf(perfModeId) + 1) % ids.length]);
  };

  return (
    <group>
      {/* Drill selection panel */}
      <SpatialPanel
        position={[-0.85, 1.6, -1.9]}
        rotation={[0, 0.28, 0]}
        width={1.3}
        height={1.35}
        title={`${phase} — Drills`}
        accent={meta.color}
      >
        <PanelText
          position={[-0.58, 0.48, 0]}
          text={meta.description}
          size={0.036}
          maxWidth={1.16}
        />
        {drills.map((d, i) => (
          <PanelButton
            key={d.id}
            position={[0, 0.24 - i * 0.145, 0]}
            width={1.14}
            height={0.12}
            label={`${d.shortName}${d.mvp ? "" : "  (proto)"}`}
            color={d.id === drillId ? meta.color : ARES_COLORS.deepPurple}
            textColor={d.id === drillId ? ARES_COLORS.nearBlack : ARES_COLORS.white}
            onClick={() => selectDrill(d.id)}
          />
        ))}
      </SpatialPanel>

      {/* Session config panel */}
      <SpatialPanel
        position={[0.85, 1.6, -1.9]}
        rotation={[0, -0.28, 0]}
        width={1.3}
        height={1.35}
        title="Session Setup"
        accent={ARES_ACCENTS.tealBright}
      >
        <PanelText
          position={[-0.58, 0.5, 0]}
          text={def ? def.name : "Select a drill"}
          size={0.05}
          color={ARES_COLORS.white}
          maxWidth={1.16}
        />
        <PanelText
          position={[-0.58, 0.36, 0]}
          text={def ? def.purpose : ""}
          size={0.036}
          maxWidth={1.16}
        />

        {/* Level selector */}
        <PanelText position={[-0.58, 0.2, 0]} text="Progression level" size={0.038} />
        {def &&
          def.levels.map((l, i) => (
            <PanelButton
              key={l.level}
              position={[-0.44 + i * 0.23, 0.08, 0]}
              width={0.2}
              height={0.1}
              label={`${l.level}`}
              color={l.level === level ? ARES_ACCENTS.tealBright : ARES_COLORS.deepPurple}
              textColor={l.level === level ? ARES_COLORS.nearBlack : ARES_COLORS.white}
              onClick={() => setLevel(l.level)}
            />
          ))}
        {def && (
          <PanelText
            position={[-0.58, -0.05, 0]}
            text={def.levels.find((l) => l.level === level)?.label ?? ""}
            size={0.036}
            color={ARES_COLORS.warningGold}
            maxWidth={1.16}
          />
        )}

        <PanelButton
          position={[-0.31, -0.2, 0]}
          width={0.56}
          height={0.1}
          label={`Athlete: ${athlete.name}`}
          onClick={cycleAthlete}
        />
        <PanelButton
          position={[0.31, -0.2, 0]}
          width={0.56}
          height={0.1}
          label={seated ? "Seated" : "Standing"}
          onClick={() => setSeated(!seated)}
        />
        <PanelButton
          position={[-0.31, -0.33, 0]}
          width={0.56}
          height={0.1}
          label={PERF_MODES[perfModeId].label.replace(" Mode", "")}
          onClick={cyclePerf}
        />
        <PanelButton
          position={[0.31, -0.33, 0]}
          width={0.56}
          height={0.1}
          label="Back to Arena"
          color={ARES_COLORS.graphite}
          onClick={goHome}
        />

        <PanelButton
          position={[0, -0.52, 0]}
          width={1.14}
          height={0.14}
          label="RUN CALIBRATION & SAFETY"
          color={def ? ARES_ACCENTS.tealBright : ARES_COLORS.graphite}
          textColor={ARES_COLORS.nearBlack}
          disabled={!def}
          onClick={proceedToCalibration}
        />
      </SpatialPanel>
    </group>
  );
}
