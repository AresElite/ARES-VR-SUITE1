import { useState } from "react";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { PHASE_META } from "@/ares/phases";
import { useAppStore } from "@/app/providers/appStore";
import { drillsForPhase, drillById } from "@/drills/registry";
import { MOCK_ATHLETES } from "@/data/mockAthletes";
import { PERF_MODES, type PerfModeId } from "@/utils/performance";
import { SpatialPanel, PanelButton, PanelText } from "./SpatialPanel";

const PAGE_SIZE = 6;

/**
 * Trainer Control Dock — one panel, zero menu-diving.
 * Handles the full ported drill library: paged drill list per phase and a
 * level stepper that scales to 100-level progressions.
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
  const [page, setPage] = useState(0);

  if (!phase) return null;
  const meta = PHASE_META[phase];
  const drills = drillsForPhase(phase);
  const pages = Math.max(1, Math.ceil(drills.length / PAGE_SIZE));
  const pageDrills = drills.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const def = drillId ? drillById(drillId) : undefined;
  const maxLevel = def ? def.levels.length : 1;
  const levelLabel = def?.levels.find((l) => l.level === level)?.label ?? "";

  const cycleAthlete = () => {
    const idx = MOCK_ATHLETES.findIndex((a) => a.id === athlete.id);
    setAthlete(MOCK_ATHLETES[(idx + 1) % MOCK_ATHLETES.length]);
  };
  const cyclePerf = () => {
    const ids = Object.keys(PERF_MODES) as PerfModeId[];
    setPerfMode(ids[(ids.indexOf(perfModeId) + 1) % ids.length]);
  };
  const step = (d: number) => setLevel(Math.min(maxLevel, Math.max(1, level + d)));

  return (
    <group>
      {/* Drill selection panel (paged) */}
      <SpatialPanel
        position={[-0.85, 1.6, -1.9]}
        rotation={[0, 0.28, 0]}
        width={1.3}
        height={1.45}
        title={`${phase} — Drills ${pages > 1 ? `(${page + 1}/${pages})` : ""}`}
        accent={meta.color}
      >
        {pageDrills.map((d, i) => (
          <PanelButton
            key={d.id}
            position={[0, 0.5 - i * 0.15, 0]}
            width={1.14}
            height={0.125}
            label={d.name}
            color={d.id === drillId ? meta.color : ARES_COLORS.deepPurple}
            textColor={d.id === drillId ? ARES_COLORS.nearBlack : ARES_COLORS.white}
            onClick={() => selectDrill(d.id)}
          />
        ))}
        {pages > 1 && (
          <>
            <PanelButton
              position={[-0.3, -0.55, 0]}
              width={0.5}
              height={0.1}
              label="< PREV"
              color={ARES_COLORS.graphite}
              onClick={() => setPage((page + pages - 1) % pages)}
            />
            <PanelButton
              position={[0.3, -0.55, 0]}
              width={0.5}
              height={0.1}
              label="NEXT >"
              color={ARES_COLORS.graphite}
              onClick={() => setPage((page + 1) % pages)}
            />
          </>
        )}
      </SpatialPanel>

      {/* Session config panel */}
      <SpatialPanel
        position={[0.85, 1.6, -1.9]}
        rotation={[0, -0.28, 0]}
        width={1.3}
        height={1.45}
        title="Session Setup"
        accent={ARES_ACCENTS.tealBright}
      >
        <PanelText
          position={[-0.58, 0.55, 0]}
          text={def ? def.name : "Select a drill"}
          size={0.05}
          color={ARES_COLORS.white}
          maxWidth={1.16}
        />
        <PanelText
          position={[-0.58, 0.42, 0]}
          text={def ? def.purpose : ""}
          size={0.034}
          maxWidth={1.16}
        />

        {/* Level stepper — supports 100-level progressions */}
        <PanelText position={[-0.58, 0.27, 0]} text="Progression level" size={0.036} />
        <PanelButton
          position={[-0.42, 0.14, 0]}
          width={0.22}
          height={0.11}
          label="−"
          fontSize={0.06}
          disabled={!def || level <= 1}
          onClick={() => step(-1)}
        />
        <PanelText
          position={[0, 0.14, 0]}
          text={def ? `LEVEL ${level} / ${maxLevel}` : "—"}
          size={0.05}
          color={ARES_ACCENTS.tealBright}
          anchorX="center"
          align="center"
          mono
        />
        <PanelButton
          position={[0.42, 0.14, 0]}
          width={0.22}
          height={0.11}
          label="+"
          fontSize={0.06}
          disabled={!def || level >= maxLevel}
          onClick={() => step(1)}
        />
        <PanelButton
          position={[-0.42, 0.02, 0]}
          width={0.22}
          height={0.08}
          label="−10"
          fontSize={0.032}
          disabled={!def || level <= 1}
          onClick={() => step(-10)}
        />
        <PanelButton
          position={[0.42, 0.02, 0]}
          width={0.22}
          height={0.08}
          label="+10"
          fontSize={0.032}
          disabled={!def || level >= maxLevel}
          onClick={() => step(10)}
        />
        <PanelText
          position={[-0.58, -0.1, 0]}
          text={levelLabel}
          size={0.034}
          color={ARES_COLORS.warningGold}
          maxWidth={1.16}
        />

        <PanelButton
          position={[-0.31, -0.24, 0]}
          width={0.56}
          height={0.1}
          label={`Athlete: ${athlete.name}`}
          onClick={cycleAthlete}
        />
        <PanelButton
          position={[0.31, -0.24, 0]}
          width={0.56}
          height={0.1}
          label={seated ? "Seated" : "Standing"}
          onClick={() => setSeated(!seated)}
        />
        <PanelButton
          position={[-0.31, -0.37, 0]}
          width={0.56}
          height={0.1}
          label={PERF_MODES[perfModeId].label.replace(" Mode", "")}
          onClick={cyclePerf}
        />
        <PanelButton
          position={[0.31, -0.37, 0]}
          width={0.56}
          height={0.1}
          label="Back to Arena"
          color={ARES_COLORS.graphite}
          onClick={goHome}
        />

        <PanelButton
          position={[0, -0.56, 0]}
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
