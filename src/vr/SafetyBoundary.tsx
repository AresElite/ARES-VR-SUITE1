import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { useAppStore } from "@/app/providers/appStore";
import { drillById } from "@/drills/registry";
import { SpatialPanel, PanelButton, PanelText } from "./SpatialPanel";

/**
 * Safety & calibration flow — shown before every drill.
 * Athletes move in VR: clear play space, arm's-reach interactions only,
 * no artificial locomotion, world-locked targets, instant trainer stop.
 */
export function SafetyBoundary() {
  const drillId = useAppStore((s) => s.drillId);
  const seated = useAppStore((s) => s.seated);
  const level = useAppStore((s) => s.level);
  const { startDrill, selectPhase, setSeated } = useAppStore.getState();
  const def = drillId ? drillById(drillId) : undefined;
  if (!def) return null;

  return (
    <group>
      <SpatialPanel
        position={[0, 1.6, -1.9]}
        width={1.6}
        height={1.3}
        title="Calibration & Safety"
        accent={ARES_COLORS.warningGold}
      >
        <PanelText
          position={[-0.72, 0.45, 0]}
          text={`${def.name} — Level ${level}`}
          size={0.052}
          color={ARES_COLORS.white}
          maxWidth={1.45}
        />
        <PanelText
          position={[-0.72, 0.26, 0]}
          text={"• Confirm a clear play space around the athlete (arm's reach + one step).\n• All targets stay within arm's reach or controlled torso rotation — no large steps.\n• The world never moves. If anything feels wrong, the athlete lowers the headset."}
          size={0.04}
          maxWidth={1.45}
        />
        <PanelText
          position={[-0.72, -0.05, 0]}
          text={def.description}
          size={0.038}
          color={ARES_ACCENTS.tealBright}
          maxWidth={1.45}
        />
        <PanelButton
          position={[-0.4, -0.32, 0]}
          width={0.66}
          height={0.11}
          label={seated ? "Mode: SEATED" : "Mode: STANDING"}
          onClick={() => setSeated(!seated)}
        />
        <PanelButton
          position={[0.4, -0.32, 0]}
          width={0.66}
          height={0.11}
          label="← Back to setup"
          color={ARES_COLORS.graphite}
          onClick={() => selectPhase(def.phase)}
        />
        <PanelButton
          position={[0, -0.5, 0]}
          width={1.4}
          height={0.15}
          label="ATHLETE READY — START DRILL"
          color={ARES_ACCENTS.goSignal}
          textColor={ARES_COLORS.nearBlack}
          onClick={startDrill}
        />
      </SpatialPanel>
    </group>
  );
}
