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
  summary,
  detail,
  accent,
}: {
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onExit: () => void;
  label: string;
  /** the one line worth seeing WITHOUT looking down — time, accuracy, streak */
  summary?: string;
  /** the full metric readout, revealed only when the dock is armed */
  detail?: string;
  accent?: string;
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
    /**
     * ~49 degrees below the horizon. The threshold is set by the LOWEST TARGET in the
     * suite, not by taste: strike drills legitimately place targets down to ~42 deg
     * below horizon, and an athlete striking one is LOOKING at it. If the dock armed
     * any shallower it would spring open in the middle of a rep and bury the very
     * target the athlete was reaching for.
     */
    const lookingDown = pitch < -0.85;
    const want = lookingDown || paused;              // a paused session always shows it
    if (want !== armed) setArmed(want);

    const targetY = want ? 0.38 : 0.24;
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
    /**
     * The dock sits ~57 degrees BELOW the line of sight, tilted up to face the
     * athlete. That angle is not arbitrary: it is far enough down that it clears the
     * lowest target in the suite (UFOV's bottom ring, at ~35 degrees below horizon)
     * with room to spare, and close enough in that looking at it is a deliberate
     * glance rather than a neck-craning excursion.
     *
     * Occlusion in VR is ANGULAR, not Cartesian. A panel does not need to be near a
     * target to hide it — it only needs to be on the same ray from the eye.
     */
    <group ref={g} position={[0, 0.24, -0.78]} rotation={[-0.95, 0, 0]}>
      {/* the dormant strip — a thin bar, nothing more */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[armed ? 1.12 : 0.72, armed ? 0.30 : 0.06]} />
        <meshBasicMaterial color={ARES_COLORS.nearBlack} transparent opacity={0.24} depthWrite={false} />
      </mesh>
      <mesh position={[0, armed ? 0.155 : 0.032, 0]}>
        <planeGeometry args={[armed ? 1.12 : 0.72, 0.005]} />
        <meshBasicMaterial
          color={paused ? ARES_ACCENTS.goSignal : ARES_COLORS.deepPurple}
          transparent opacity={0.9} toneMapped={false} depthWrite={false} />
      </mesh>

      {armed ? (
        <>
          <Text position={[0, 0.115, 0.001]} fontSize={0.03} color={accent ?? ARES_COLORS.softGray} anchorX="center">
            {paused ? `${label}  —  PAUSED` : label}
          </Text>
          {detail && (
            <Text position={[0, 0.068, 0.001]} fontSize={0.036} color={ARES_COLORS.white}
              anchorX="center" maxWidth={1.0}>
              {detail}
            </Text>
          )}
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
        /**
         * DORMANT. One line, dim, at the very bottom of the field: the only numbers
         * worth glancing at mid-rep. Everything else — the full metric panel, pause,
         * and stop — waits until the athlete actually looks down for it.
         *
         * The old HUD was a full scoreboard PANEL parked in the middle of the play
         * space on every drill. On Schulte it was worse than clutter: the grid
         * rendered in FRONT of it, so the athlete was reading cells through a
         * scoreboard.
         */
        <>
          {summary && (
            <Text position={[0, 0.002, 0.001]} fontSize={0.028} color={ARES_COLORS.softGray} anchorX="center">
              {summary}
            </Text>
          )}
          <Text position={[0, -0.03, 0.001]} fontSize={0.019} color="#4A4F63" anchorX="center">
            LOOK DOWN FOR CONTROLS
          </Text>
        </>
      )}
    </group>
  );
}
