import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { useAppStore } from "@/app/providers/appStore";
import { drillById } from "@/drills/registry";
import { SpatialPanel, PanelButton, PanelText } from "./SpatialPanel";

/**
 * Calibration, safety, and DRILL BRIEFING — shown before every drill.
 * The athlete gets clear, numbered directions for exactly how this drill
 * runs and how to strike, plus the play-space safety check. Athletes move
 * their arms in VR: clear space, no steps, world-locked targets, instant
 * trainer stop.
 */
export function SafetyBoundary() {
  const drillId = useAppStore((s) => s.drillId);
  const camera = useThree((s) => s.camera);
  const [eyeHeight, setEyeHeight] = useState<number | null>(null);
  useEffect(() => {
    // per-session calibration UX (prototype): capture standing eye height
    // from the headset pose; validated IPD/vergence baselines are Phase 2
    const t = setTimeout(() => setEyeHeight(Math.round(camera.position.y * 100) / 100), 600);
    return () => clearTimeout(t);
  }, [camera]);
  const seated = useAppStore((s) => s.seated);
  const level = useAppStore((s) => s.level);
  const { startDrill, selectPhase, setSeated } = useAppStore.getState();
  const def = drillId ? drillById(drillId) : undefined;
  if (!def) return null;

  return (
    <group>
      {/* Drill briefing — clear directions, one panel */}
      <SpatialPanel
        position={[-0.92, 1.62, -1.85]}
        rotation={[0, 0.26, 0]}
        width={1.56}
        height={1.66}
        title={`How to run: ${def.shortName}`}
        accent={ARES_ACCENTS.tealBright}
      >
        <PanelText
          position={[-0.7, 0.66, 0]}
          text={`${def.name} — Level ${level}`}
          size={0.046}
          color={ARES_COLORS.white}
          maxWidth={1.42}
        />
        {def.instructions.slice(0, 5).map((line, i) => (
          <PanelText
            key={i}
            position={[-0.7, 0.5 - i * 0.185, 0]}
            text={line}
            size={0.034}
            color={ARES_COLORS.softGray}
            maxWidth={1.42}
          />
        ))}
        <PanelText
          position={[-0.7, 0.5 - Math.min(def.instructions.length, 5) * 0.185 - 0.02, 0]}
          text={def.controlsHint}
          size={0.032}
          color={ARES_ACCENTS.tealBright}
          maxWidth={1.42}
          mono
        />
      </SpatialPanel>

      {/* Session calibration (prototype UX — the screens, not the validated routine) */}
      <SpatialPanel
        position={[0, 2.42, -2.0]}
        rotation={[-0.1, 0, 0]}
        width={1.5}
        height={0.34}
        title="Session calibration"
        accent={ARES_ACCENTS.purpleGlow}
      >
        <PanelText
          position={[-0.68, 0.045, 0]}
          text={`Eye height ${eyeHeight !== null ? `${eyeHeight}m captured` : "capturing..."}   •   IPD: headset-applied   •   1:1 world scale`}
          size={0.037}
          color={ARES_COLORS.white}
          maxWidth={1.4}
        />
        <PanelText
          position={[-0.68, -0.07, 0]}
          text="PROTOTYPE CALIBRATION UX — validated baselines ship in the native build"
          size={0.026}
          color="#6B749C"
          maxWidth={1.4}
          mono
        />
      </SpatialPanel>

      {/* Safety + start */}
      <SpatialPanel
        position={[0.92, 1.62, -1.85]}
        rotation={[0, -0.26, 0]}
        width={1.35}
        height={1.5}
        title="Calibration & Safety"
        accent={ARES_COLORS.warningGold}
      >
        <PanelText
          position={[-0.6, 0.5, 0]}
          text={"- Confirm clear space around the athlete: full arm swing in every direction, plus one step."}
          size={0.04}
          maxWidth={1.22}
        />
        <PanelText
          position={[-0.6, 0.32, 0]}
          text={"- Strike with your HANDS or CONTROLLERS. There are no pointers - reach out and make contact."}
          size={0.04}
          maxWidth={1.22}
        />
        <PanelText
          position={[-0.6, 0.13, 0]}
          text={"- All targets stay within arm's reach. Never step or lunge. The world never moves."}
          size={0.04}
          maxWidth={1.22}
        />
        <PanelText
          position={[-0.6, -0.05, 0]}
          text={"- If anything feels wrong, the athlete lowers the headset. The trainer can stop at any time."}
          size={0.04}
          maxWidth={1.22}
        />
        <PanelButton
          position={[-0.33, -0.28, 0]}
          width={0.58}
          height={0.11}
          label={seated ? "Mode: SEATED" : "Mode: STANDING"}
          onClick={() => setSeated(!seated)}
        />
        <PanelButton
          position={[0.33, -0.28, 0]}
          width={0.58}
          height={0.11}
          label="Back to setup"
          color={ARES_COLORS.graphite}
          onClick={() => selectPhase(def.phase)}
        />
        <PanelButton
          position={[0, -0.5, 0]}
          width={1.2}
          height={0.16}
          label="ATHLETE READY - START DRILL"
          color={ARES_ACCENTS.goSignal}
          textColor={ARES_COLORS.nearBlack}
          onClick={startDrill}
        />
      </SpatialPanel>
    </group>
  );
}
