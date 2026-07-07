import { useState } from "react";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { PHASE_META } from "@/ares/phases";
import { useAppStore } from "@/app/providers/appStore";
import { drillsForPhase, drillById } from "@/drills/registry";
import { MOCK_ATHLETES } from "@/data/mockAthletes";
import { PERF_MODES, type PerfModeId } from "@/utils/performance";
import { SpatialPanel, PanelButton, PanelText } from "./SpatialPanel";

const PAGE_SIZE = 7;

/**
 * Trainer Control Dock.
 * Paged drill list, 25-level stepper, and per-drill option dropdowns
 * (color/hand modes, central-peripheral distribution, stimulus size, zones).
 * Layout uses fixed row slots so no text can overlap at any content length.
 */
export function TrainerControlDock() {
  const phase = useAppStore((s) => s.phase);
  const drillId = useAppStore((s) => s.drillId);
  const level = useAppStore((s) => s.level);
  const athlete = useAppStore((s) => s.athlete);
  const seated = useAppStore((s) => s.seated);
  const perfModeId = useAppStore((s) => s.perfModeId);
  const drillOptions = useAppStore((s) => s.drillOptions);
  const { selectDrill, setLevel, setDrillOption, setAthlete, setSeated, setPerfMode, goHome, proceedToCalibration } =
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
  const opts = def?.options ?? [];

  const cycleAthlete = () => {
    const idx = MOCK_ATHLETES.findIndex((a) => a.id === athlete.id);
    setAthlete(MOCK_ATHLETES[(idx + 1) % MOCK_ATHLETES.length]);
  };
  const cyclePerf = () => {
    const ids = Object.keys(PERF_MODES) as PerfModeId[];
    setPerfMode(ids[(ids.indexOf(perfModeId) + 1) % ids.length]);
  };
  const step = (d: number) => setLevel(Math.min(maxLevel, Math.max(1, level + d)));
  const cycleOption = (optId: string) => {
    const o = opts.find((x) => x.id === optId);
    if (!o) return;
    const cur = drillOptions[optId] ?? o.defaultValue;
    const idx = o.values.findIndex((v) => v.id === cur);
    setDrillOption(optId, o.values[(idx + 1) % o.values.length].id);
  };
  const optLabel = (optId: string) => {
    const o = opts.find((x) => x.id === optId);
    if (!o) return "";
    const cur = drillOptions[optId] ?? o.defaultValue;
    return o.values.find((v) => v.id === cur)?.label ?? "";
  };

  return (
    <group>
      {/* Drill selection panel (paged) */}
      <SpatialPanel
        position={[-0.88, 1.6, -1.9]}
        rotation={[0, 0.28, 0]}
        width={1.3}
        height={1.5}
        title={`${phase} — Drills ${pages > 1 ? `(${page + 1}/${pages})` : ""}`}
        accent={meta.color}
      >
        {pageDrills.map((d, i) => (
          <PanelButton
            key={d.id}
            position={[0, 0.54 - i * 0.135, 0]}
            width={1.14}
            height={0.115}
            label={d.name}
            color={d.id === drillId ? meta.color : ARES_COLORS.deepPurple}
            textColor={d.id === drillId ? ARES_COLORS.nearBlack : ARES_COLORS.white}
            onClick={() => selectDrill(d.id)}
          />
        ))}
        {pages > 1 && (
          <>
            <PanelButton
              position={[-0.3, -0.6, 0]}
              width={0.5}
              height={0.1}
              label="< PREV"
              color={ARES_COLORS.graphite}
              onClick={() => setPage((page + pages - 1) % pages)}
            />
            <PanelButton
              position={[0.3, -0.6, 0]}
              width={0.5}
              height={0.1}
              label="NEXT >"
              color={ARES_COLORS.graphite}
              onClick={() => setPage((page + 1) % pages)}
            />
          </>
        )}
      </SpatialPanel>

      {/* Session config panel — fixed row slots, no overlap possible */}
      <SpatialPanel
        position={[0.88, 1.55, -1.9]}
        rotation={[0, -0.28, 0]}
        width={1.34}
        height={1.72}
        title="Session Setup"
        accent={ARES_ACCENTS.tealBright}
      >
        <PanelText
          position={[-0.6, 0.68, 0]}
          text={def ? def.name : "Select a drill"}
          size={0.048}
          color={ARES_COLORS.white}
          maxWidth={1.2}
        />

        {/* Level stepper */}
        <PanelButton position={[-0.45, 0.53, 0]} width={0.2} height={0.1} label="−" fontSize={0.055}
          disabled={!def || level <= 1} onClick={() => step(-1)} />
        <PanelButton position={[-0.22, 0.53, 0]} width={0.2} height={0.08} label="−10" fontSize={0.03}
          disabled={!def || level <= 1} onClick={() => step(-10)} />
        <PanelText position={[0.08, 0.53, 0]} text={def ? `LV ${level}/${maxLevel}` : "—"} size={0.045}
          color={ARES_ACCENTS.tealBright} anchorX="center" align="center" mono />
        <PanelButton position={[0.38, 0.53, 0]} width={0.2} height={0.08} label="+10" fontSize={0.03}
          disabled={!def || level >= maxLevel} onClick={() => step(10)} />
        <PanelButton position={[0.58, 0.53, 0]} width={0.16} height={0.1} label="+" fontSize={0.055}
          disabled={!def || level >= maxLevel} onClick={() => step(1)} />
        <PanelText position={[-0.6, 0.41, 0]} text={levelLabel} size={0.03}
          color={ARES_COLORS.warningGold} maxWidth={1.2} />

        {/* Drill option dropdowns (cycle on strike) */}
        {opts.slice(0, 3).map((o, i) => (
          <group key={o.id}>
            <PanelText position={[-0.6, 0.3 - i * 0.13, 0]} text={o.label.toUpperCase()} size={0.026}
              color={ARES_ACCENTS.dim} mono />
            <PanelButton
              position={[0.13, 0.3 - i * 0.13, 0]}
              width={0.86}
              height={0.105}
              fontSize={0.032}
              label={optLabel(o.id)}
              color={ARES_COLORS.deepPurple}
              onClick={() => cycleOption(o.id)}
            />
          </group>
        ))}
        {opts.length === 0 && def && (
          <PanelText position={[-0.6, 0.3, 0]} text="No drill options — standard format." size={0.028}
            color={ARES_ACCENTS.dim} maxWidth={1.2} />
        )}

        {/* Session controls */}
        <PanelButton position={[-0.32, -0.16, 0]} width={0.58} height={0.1}
          label={`Athlete: ${athlete.name}`} fontSize={0.032} onClick={cycleAthlete} />
        <PanelButton position={[0.32, -0.16, 0]} width={0.58} height={0.1}
          label={seated ? "Seated" : "Standing"} fontSize={0.032} onClick={() => setSeated(!seated)} />
        <PanelButton position={[-0.32, -0.29, 0]} width={0.58} height={0.1}
          label={PERF_MODES[perfModeId].label.replace(" Mode", "")} fontSize={0.032} onClick={cyclePerf} />
        <PanelButton position={[0.32, -0.29, 0]} width={0.58} height={0.1}
          label="Back to Arena" fontSize={0.032} color={ARES_COLORS.graphite} onClick={goHome} />

        <PanelButton
          position={[0, -0.52, 0]}
          width={1.18}
          height={0.15}
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
