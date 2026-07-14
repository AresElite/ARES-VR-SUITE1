import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { PanelButton } from "@/vr/SpatialPanel";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";

/**
 * THE IN-SESSION CONTROL DOCK.
 *
 * Every drill needs a way out. AEGIS and Sequence Command shipped without one —
 * once the athlete was in, the only exit was removing the headset, which is not
 * an acceptable state for a five-minute standardized round, let alone a bonus
 * round that runs until failure.
 *
 * But a persistent PAUSE/EXIT panel floating in the play space is worse than no
 * panel: it sits in the visual field the drill is trying to measure, and it is
 * exactly the kind of clutter that corrupts a peripheral-awareness score.
 *
 * So the dock lives in the BOTTOM QUARTER of the field, tilted up toward the
 * athlete, well below every target and every cue. It is:
 *
 *   DORMANT   a single dim strip. Present, ignorable, out of the task field.
 *   ARMED     look down at it (or reach for it) and it lifts and brightens.
 *
 * Nothing about it ever overlaps the strike plane, the cue ring, or the decision
 * core. You cannot fumble into it mid-swing, and you can always find it.
 */
export function SessionControlDock({
  paused,
  onPause,
  onResume,
  onExit,
  label,
}: {
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onExit: () => void;
  label: string;
}) {
  const g = useRef<THREE.Group>(null);
  const [armed, setArmed] = useState(false);

  useFrame(({ camera }) => {
    if (!g.current) return;
    /**
     * ARMING IS GAZE-DRIVEN. The dock wakes when the athlete looks DOWN toward
     * it — which is a deliberate act, and one they will never perform by
     * accident while tracking a target, because every target in both drills sits
     * at or above chest height. Pitch is the only signal used: no ray, no
     * cursor, nothing that could be triggered by a hand passing through.
     */
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1));
    const lookingDown = pitch < -0.34;               // ~20deg below horizon
    const want = lookingDown || paused;              // a paused session always shows it
    if (want !== armed) setArmed(want);

    const targetY = want ? 0.62 : 0.44;
    const targetO = want ? 1 : 0.24;
    g.current.position.y += (targetY - g.current.position.y) * 0.16;
    g.current.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && "opacity" in m) {
        m.transparent = true;
        (m as THREE.Material & { opacity: number }).opacity +=
          (targetO - (m as THREE.Material & { opacity: number }).opacity) * 0.16;
      }
    });
  });

  return (
    <group ref={g} position={[0, 0.44, -1.15]} rotation={[-0.62, 0, 0]}>
      {/* the dormant strip — a thin bar, nothing more */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[armed ? 1.05 : 0.62, armed ? 0.24 : 0.035]} />
        <meshBasicMaterial color={ARES_COLORS.nearBlack} transparent opacity={0.24} depthWrite={false} />
      </mesh>
      <mesh position={[0, armed ? 0.12 : 0.019, 0]}>
        <planeGeometry args={[armed ? 1.05 : 0.62, 0.005]} />
        <meshBasicMaterial
          color={paused ? ARES_ACCENTS.goSignal : ARES_COLORS.deepPurple}
          transparent opacity={0.9} toneMapped={false} depthWrite={false} />
      </mesh>

      {armed ? (
        <>
          <Text position={[0, 0.075, 0.001]} fontSize={0.032} color={ARES_COLORS.softGray} anchorX="center">
            {paused ? `${label}  —  PAUSED` : label}
          </Text>
          <PanelButton
            position={[-0.26, -0.03, 0.002]}
            width={0.44} height={0.1} fontSize={0.036}
            label={paused ? "RESUME" : "PAUSE"}
            color={paused ? ARES_ACCENTS.goSignal : ARES_COLORS.deepPurple}
            textColor={paused ? ARES_COLORS.nearBlack : ARES_COLORS.white}
            onClick={paused ? onResume : onPause}
          />
          <PanelButton
            position={[0.26, -0.03, 0.002]}
            width={0.44} height={0.1} fontSize={0.036}
            label="STOP & EXIT"
            color={ARES_COLORS.errorRed}
            onClick={onExit}
          />
        </>
      ) : (
        <Text position={[0, -0.03, 0.001]} fontSize={0.022} color={ARES_COLORS.softGray} anchorX="center">
          LOOK DOWN FOR CONTROLS
        </Text>
      )}
    </group>
  );
}
