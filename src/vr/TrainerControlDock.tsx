import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useXRInputSourceState } from "@react-three/xr";
import { sfx } from "@/utils/audio";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { PHASE_META } from "@/ares/phases";
import { useAppStore } from "@/app/providers/appStore";
import { drillsForPhase, drillById } from "@/drills/registry";
import { SPORT_PROFILES, sportById } from "@/sport/sportProfiles";
import { MOCK_ATHLETES } from "@/data/mockAthletes";
import { PERF_MODES, type PerfModeId } from "@/utils/performance";
import { SpatialPanel, PanelButton, PanelText } from "./SpatialPanel";

const PAGE_SIZE = 7;

/**
 * Thumbstick list scrolling — push either stick UP/DOWN to scroll the drill
 * list one row at a time (auto-repeats while held, ticks as it moves).
 * The PREV/NEXT buttons remain as a page-jump fallback.
 */
function StickScroll({ onStep }: { onStep: (d: number) => void }) {
  const left = useXRInputSourceState("controller", "left");
  const right = useXRInputSourceState("controller", "right");
  const nextAt = useRef(0);
  const held = useRef(false);
  useFrame(({ clock }) => {
    const ly = left?.inputSource?.gamepad?.axes?.[3] ?? 0;
    const ry = right?.inputSource?.gamepad?.axes?.[3] ?? 0;
    const y = Math.abs(ly) > Math.abs(ry) ? ly : ry;
    const t = clock.elapsedTime;
    if (Math.abs(y) > 0.6) {
      if (t >= nextAt.current) {
        onStep(y > 0 ? 1 : -1); // stick down (+y) scrolls down the list
        sfx.uiClick();
        nextAt.current = t + (held.current ? 0.22 : 0.4);
        held.current = true;
      }
    } else if (Math.abs(y) < 0.3) {
      held.current = false;
      nextAt.current = 0;
    }
  });
  return null;
}

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
  const sport = useAppStore((s) => s.sport);
  const { selectSport } = useAppStore.getState();
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [phase, sport]);

  if (!phase) return null;
  const meta = PHASE_META[phase];
  const profile = phase === "Sport" ? sportById(sport) : undefined;
  const sportLevelBias = (id: string) => profile?.drills.find((d) => d.drillId === id)?.levelBias ?? 1;
  const drills =
    phase === "Sport"
      ? (profile
          ? (profile.drills.map((d) => drillById(d.drillId)).filter(Boolean) as NonNullable<ReturnType<typeof drillById>>[])
          : [])
      : drillsForPhase(phase);
  const maxOffset = Math.max(0, drills.length - PAGE_SIZE);
  const scroll = (d: number) => setOffset((o) => Math.max(0, Math.min(maxOffset, o + d)));
  const pageDrills = drills.slice(offset, offset + PAGE_SIZE);
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

  // Sport portal, no sport chosen yet: show the sport picker.
  if (phase === "Sport" && !profile) {
    return (
      <group>
        <SpatialPanel
          position={[-0.88, 1.6, -1.9]}
          rotation={[0, 0.28, 0]}
          width={1.3}
          height={1.5}
          title="Sport — Choose a suite"
          accent={meta.color}
        >
          {SPORT_PROFILES.map((sp, i) => (
            <group key={sp.id}>
              <PanelButton
                position={[0, 0.5 - i * 0.28, 0]}
                width={1.14}
                height={0.13}
                label={sp.name}
                color={sp.color}
                textColor={ARES_COLORS.nearBlack}
                onClick={() => selectSport(sp.id)}
              />
              <PanelText
                position={[-0.55, 0.5 - i * 0.28 - 0.095, 0]}
                text={sp.blurb}
                size={0.026}
                color={ARES_COLORS.softGray}
                maxWidth={1.12}
              />
            </group>
          ))}
        </SpatialPanel>
      </group>
    );
  }

  return (
    <group>
      {/* Drill selection panel (paged) */}
      <SpatialPanel
        position={[-0.88, 1.6, -1.9]}
        rotation={[0, 0.28, 0]}
        width={1.3}
        height={1.5}
        title={
          profile
            ? `${profile.name} — Top 7`
            : `${phase} — Drills ${drills.length > PAGE_SIZE ? `(${offset + 1}-${Math.min(offset + PAGE_SIZE, drills.length)} of ${drills.length})` : ""}`
        }
        accent={profile ? profile.color : meta.color}
      >
        {profile && (
          <PanelButton
            position={[0.42, 0.68, 0]}
            width={0.4}
            height={0.085}
            fontSize={0.03}
            label="< SPORTS"
            color={ARES_COLORS.graphite}
            onClick={() => selectSport(null)}
          />
        )}
        {drills.length > PAGE_SIZE && <StickScroll onStep={scroll} />}
        {pageDrills.map((d, i) => (
          <group key={d.id}>
            <PanelButton
              position={[0, 0.54 - i * (profile ? 0.145 : 0.135), 0]}
              width={1.14}
              height={profile ? 0.1 : 0.115}
              fontSize={profile ? 0.032 : undefined}
              label={d.name}
              color={d.id === drillId ? (profile ? profile.color : meta.color) : ARES_COLORS.deepPurple}
              textColor={d.id === drillId ? ARES_COLORS.nearBlack : ARES_COLORS.white}
              onClick={() => {
                selectDrill(d.id);
                if (profile) setLevel(sportLevelBias(d.id));
              }}
            />
            {profile && (
              <PanelText
                position={[-0.55, 0.54 - i * 0.145 - 0.062, 0]}
                text={profile.drills.find((x) => x.drillId === d.id)?.why ?? ""}
                size={0.022}
                color={ARES_COLORS.softGray}
                maxWidth={1.1}
              />
            )}
          </group>
        ))}
        {drills.length > PAGE_SIZE && (
          <>
            <PanelButton
              position={[-0.3, -0.6, 0]}
              width={0.5}
              height={0.1}
              label="^ UP"
              color={ARES_COLORS.graphite}
              onClick={() => scroll(-PAGE_SIZE)}
            />
            <PanelButton
              position={[0.3, -0.6, 0]}
              width={0.5}
              height={0.1}
              label="v DOWN"
              color={ARES_COLORS.graphite}
              onClick={() => scroll(PAGE_SIZE)}
            />
            <PanelText
              position={[0, -0.685, 0]}
              text="TIP: FLICK EITHER THUMBSTICK UP / DOWN TO SCROLL"
              size={0.026}
              color={ARES_COLORS.softGray}
              maxWidth={1.2}
              mono
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
