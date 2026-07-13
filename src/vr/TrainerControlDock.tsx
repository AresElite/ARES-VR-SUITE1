import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useXRInputSourceState } from "@react-three/xr";
import { sfx } from "@/utils/audio";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { PHASE_META } from "@/ares/phases";
import { useAppStore } from "@/app/providers/appStore";
import { drillsForPhase, drillById } from "@/drills/registry";
import { SPORT_PROFILES, sportById } from "@/sport/sportProfiles";
import { TRAINING_PHASES, PHASE_META as PM } from "@/ares/phases";
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
  const strobeLevel = useAppStore((s) => s.strobeLevel);
  const setStrobeLevel = useAppStore((s) => s.setStrobeLevel);
  const perfModeId = useAppStore((s) => s.perfModeId);
  const drillOptions = useAppStore((s) => s.drillOptions);
  const { selectDrill, setLevel, setDrillOption, setAthlete, setSeated, setPerfMode, goHome, proceedToCalibration } =
    useAppStore.getState();
  const sport = useAppStore((s) => s.sport);
  const group = useAppStore((s) => s.group);
  const { selectSport, selectGroup, selectPhase } = useAppStore.getState();
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [phase, sport]);

  // A.R.E.S. Training sub-menu — the four Loop phases plus Sport
  if (group === "training" && !phase) {
    const TRAIN = [
      // AEGIS leads the menu. It is the flagship eye-hand drill and the only one
      // that runs the full A.R.E.S. Loop end-to-end inside a single session.
      { id: "AEGIS", label: "AEGIS", color: "#8B5CF6", tag: "Eye-hand · 5:00 + bonus until failure",
        onClick: () => useAppStore.setState({ arenaMode: "aegisSetup" }) },
      ...TRAINING_PHASES.map((tp) => ({ id: tp, label: tp, color: PM[tp].color, tag: PM[tp].tagline, onClick: () => selectPhase(tp) })),
      { id: "Sport", label: "Sport", color: "#2998AA", tag: "Sport-specific suites", onClick: () => selectPhase("Sport" as never) },
    ];
    return (
      <group>
        <SpatialPanel
          position={[-0.88, 1.6, -1.9]}
          rotation={[0, 0.28, 0]}
          width={1.3}
          height={1.62}
          title="A.R.E.S. Training"
          accent="#8B5CF6"
        >
          {TRAIN.map((tp, i) => (
            <group key={tp.id}>
              <PanelButton
                position={[0, 0.58 - i * 0.21, 0]}
                width={1.14}
                height={0.11}
                label={tp.label}
                color={tp.color}
                textColor={ARES_COLORS.nearBlack}
                onClick={tp.onClick}
              />
              <PanelText
                position={[-0.55, 0.58 - i * 0.21 - 0.078, 0]}
                text={tp.tag}
                size={0.023}
                color={ARES_COLORS.softGray}
                maxWidth={1.12}
              />
            </group>
          ))}
          {/* back to the main arena portals */}
          <PanelButton
            position={[0, -0.64, 0]}
            width={1.14}
            height={0.11}
            fontSize={0.034}
            label="< EXIT TO ARENA"
            color={ARES_COLORS.graphite}
            onClick={goHome}
          />
        </SpatialPanel>
      </group>
    );
  }

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
  // PERFORM tiers are EARNED — the ladder only extends as far as the athlete
  // has held 85%. Every other phase keeps its full level range.
  const unlockedTier = useAppStore((s) => s.unlockedTier);
  const isPerform = def?.phase === "Perform";
  const ceiling = def ? def.levels.length : 1;
  const maxLevel = def && isPerform ? Math.min(ceiling, unlockedTier(def.id)) : ceiling;
  const levelLabel = def?.levels.find((l) => l.level === level)?.label ?? "";
  const gated = isPerform && maxLevel < ceiling;
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

  // ---- Session Setup: FIXED slots (never collapse, never overlap) ----
  const shownOpts = opts.slice(0, 3);
  const SETUP_H = 1.98;
  const optY = (i: number) => 0.38 - i * 0.13; // slots 0.38 / 0.25 / 0.12
  const STROBE_Y = -0.02;
  const CTRL1_Y = -0.17;
  const CTRL2_Y = -0.30;
  const START_Y = -0.54;

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
                position={[0, 0.54 - i * 0.26, 0]}
                width={1.14}
                height={0.12}
                label={sp.name}
                color={sp.color}
                textColor={ARES_COLORS.nearBlack}
                onClick={() => selectSport(sp.id)}
              />
              <PanelText
                position={[-0.55, 0.54 - i * 0.26 - 0.088, 0]}
                text={sp.blurb}
                size={0.025}
                color={ARES_COLORS.softGray}
                maxWidth={1.12}
              />
            </group>
          ))}
          {/* bottom navigation row — back to Training, exit to Arena */}
          <PanelButton
            position={[-0.3, -0.62, 0]}
            width={0.52}
            height={0.11}
            fontSize={0.034}
            label="< TRAINING"
            color={ARES_COLORS.deepPurple}
            onClick={() => selectGroup("training")}
          />
          <PanelButton
            position={[0.3, -0.62, 0]}
            width={0.52}
            height={0.11}
            fontSize={0.034}
            label="EXIT TO ARENA"
            color={ARES_COLORS.graphite}
            onClick={goHome}
          />
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
        {profile ? (
          <PanelButton
            position={[0.42, 0.68, 0]}
            width={0.4}
            height={0.085}
            fontSize={0.03}
            label="< SPORTS"
            color={ARES_COLORS.graphite}
            onClick={() => selectSport(null)}
          />
        ) : group === "training" ? (
          <PanelButton
            position={[0.4, 0.68, 0]}
            width={0.44}
            height={0.085}
            fontSize={0.028}
            label="< TRAINING"
            color={ARES_COLORS.graphite}
            onClick={() => selectGroup("training")}
          />
        ) : null}
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

      {/* Session config panel — cursor layout, grows to fit, no overlap */}
      <SpatialPanel
        position={[0.9, 1.55, -1.95]}
        rotation={[0, -0.28, 0]}
        width={1.34}
        height={SETUP_H}
        title="Session Setup"
        accent={ARES_ACCENTS.tealBright}
      >
        <PanelText
          position={[-0.6, 0.78, 0]}
          text={def ? def.name : "Select a drill"}
          size={0.046}
          color={ARES_COLORS.white}
          maxWidth={1.2}
        />

        {/* Level stepper */}
        <PanelButton position={[-0.45, 0.62, 0]} width={0.2} height={0.1} label="−" fontSize={0.055}
          disabled={!def || level <= 1} onClick={() => step(-1)} />
        <PanelButton position={[-0.22, 0.62, 0]} width={0.2} height={0.08} label="−10" fontSize={0.03}
          disabled={!def || level <= 1} onClick={() => step(-10)} />
        <PanelText position={[0.08, 0.62, 0]} text={def ? (isPerform ? `TIER ${level}/${ceiling}${gated ? ` · ${maxLevel} UNLOCKED` : ""}` : `LV ${level}/${maxLevel}`) : "—"} size={0.045}
          color={ARES_ACCENTS.tealBright} anchorX="center" align="center" mono />
        <PanelButton position={[0.38, 0.62, 0]} width={0.2} height={0.08} label="+10" fontSize={0.03}
          disabled={!def || level >= maxLevel} onClick={() => step(10)} />
        <PanelButton position={[0.58, 0.62, 0]} width={0.16} height={0.1} label="+" fontSize={0.055}
          disabled={!def || level >= maxLevel} onClick={() => step(1)} />
        <PanelText position={[-0.6, 0.51, 0]} text={levelLabel} size={0.026}
          color={ARES_COLORS.warningGold} maxWidth={1.2} />

        {/* Drill option dropdowns (cycle on click) — fixed slots */}
        {shownOpts.map((o, i) => (
          <group key={o.id}>
            <PanelText position={[-0.6, optY(i) + 0.05, 0]} text={o.label.toUpperCase()} size={0.022}
              color={ARES_ACCENTS.dim} mono />
            <PanelButton
              position={[0.13, optY(i), 0]}
              width={0.86}
              height={0.1}
              fontSize={0.03}
              label={optLabel(o.id)}
              color={ARES_COLORS.deepPurple}
              onClick={() => cycleOption(o.id)}
            />
          </group>
        ))}
        {shownOpts.length === 0 && def && (
          <PanelText position={[-0.6, 0.38, 0]} text="No drill options — standard format." size={0.026}
            color={ARES_ACCENTS.dim} maxWidth={1.2} />
        )}

        {/* Stroboscopic occlusion — fixed slot below the options */}
        {def?.supportsStrobe && (
          <group>
            <PanelText position={[-0.6, STROBE_Y + 0.05, 0]} text="STROBE (BINOCULAR)" size={0.022}
              color={ARES_ACCENTS.dim} mono />
            <PanelButton
              position={[0.13, STROBE_Y, 0]}
              width={0.86}
              height={0.1}
              fontSize={0.03}
              label={strobeLevel === 0 ? "Off" : `Level ${strobeLevel} of 5`}
              color={strobeLevel > 0 ? ARES_ACCENTS.purpleGlow : ARES_COLORS.deepPurple}
              textColor={strobeLevel > 0 ? ARES_COLORS.nearBlack : ARES_COLORS.white}
              onClick={() => setStrobeLevel((strobeLevel + 1) % 6)}
            />
          </group>
        )}

        {/* Session controls — fixed slots */}
        <PanelButton position={[-0.32, CTRL1_Y, 0]} width={0.58} height={0.1}
          label={`Athlete: ${athlete.name}`} fontSize={0.03} onClick={cycleAthlete} />
        <PanelButton position={[0.32, CTRL1_Y, 0]} width={0.58} height={0.1}
          label={seated ? "Seated" : "Standing"} fontSize={0.03} onClick={() => setSeated(!seated)} />
        <PanelButton position={[-0.32, CTRL2_Y, 0]} width={0.58} height={0.1}
          label={PERF_MODES[perfModeId].label.replace(" Mode", "")} fontSize={0.03} onClick={cyclePerf} />
        <PanelButton position={[0.32, CTRL2_Y, 0]} width={0.58} height={0.1}
          label="< Back to Arena" fontSize={0.03} color={ARES_COLORS.graphite} onClick={goHome} />

        <PanelButton
          position={[0, START_Y, 0]}
          width={1.18}
          height={0.14}
          label="START DRILL"
          color={def ? ARES_ACCENTS.tealBright : ARES_COLORS.graphite}
          textColor={ARES_COLORS.nearBlack}
          disabled={!def}
          onClick={proceedToCalibration}
        />
      </SpatialPanel>
    </group>
  );
}
