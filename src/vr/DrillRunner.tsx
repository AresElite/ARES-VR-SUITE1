import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { ARES_COLORS } from "@/ares/colors";
import { PHASE_META } from "@/ares/phases";
import { HUD_REFRESH_HZ } from "@/ares/constants";
import type { SliceDirection } from "@/ares/drillTypes";
import { useAppStore } from "@/app/providers/appStore";
import { handFromPointerEvent, sliceDirectionFromDelta } from "@/drills/shared/InputMapper";
import type { PoolSlot } from "@/drills/shared/TargetSpawner";
import { PERF_MODES } from "@/utils/performance";

/**
 * DrillRunner — the live drill runtime.
 *
 * Performance contract:
 *  - The engine advances on the XR frame clock (useFrame), not React state.
 *  - Target meshes are pooled; spawn/despawn only re-renders slot visibility.
 *  - Positions are written directly to mesh transforms every frame.
 *  - The HUD snapshot is throttled to HUD_REFRESH_HZ.
 */

const DIR_ANGLE: Record<SliceDirection, number> = {
  right: 0,
  upRight: Math.PI / 4,
  up: Math.PI / 2,
  upLeft: (3 * Math.PI) / 4,
  left: Math.PI,
  downLeft: (5 * Math.PI) / 4,
  down: (3 * Math.PI) / 2,
  downRight: (7 * Math.PI) / 4,
};

function TargetMesh({
  slot,
  segments,
  version,
}: {
  slot: PoolSlot;
  segments: number;
  version: number;
}) {
  const group = useRef<THREE.Group>(null);
  const engine = useAppStore((s) => s.engine);
  const spec = slot.spec;

  useFrame(() => {
    if (group.current && slot.active) {
      group.current.position.set(slot.pos[0], slot.pos[1], slot.pos[2]);
    }
  });

  if (!slot.active || !spec) return null;

  const onHit = (e: { stopPropagation(): void; nativeEvent?: unknown }) => {
    e.stopPropagation();
    const hand = handFromPointerEvent(e);
    let direction: SliceDirection | undefined;
    if (spec.requiredDirection) {
      const ne = e.nativeEvent as { movementX?: number; movementY?: number } | undefined;
      const mx = ne?.movementX ?? 0;
      const my = ne?.movementY ?? 0;
      // Derive slice direction from pointer motion when measurable;
      // a still-pointer trigger counts as the ruled direction (MVP).
      direction =
        Math.abs(mx) + Math.abs(my) > 4
          ? sliceDirectionFromDelta(mx, -my)
          : spec.requiredDirection;
    }
    engine?.registerHit(spec.id, hand, direction);
  };

  const rotZ = spec.requiredDirection ? DIR_ANGLE[spec.requiredDirection] - Math.PI / 2 : 0;

  return (
    <group ref={group} position={spec.position} key={version}>
      <mesh onClick={onHit} rotation={[0, 0, rotZ]}>
        {spec.shape === "sphere" && <sphereGeometry args={[spec.scale, segments, segments]} />}
        {spec.shape === "box" && <boxGeometry args={[spec.scale * 1.6, spec.scale * 1.6, spec.scale * 1.6]} />}
        {spec.shape === "diamond" && <octahedronGeometry args={[spec.scale, 0]} />}
        {spec.shape === "ring" && <torusGeometry args={[spec.scale, spec.scale * 0.32, 6, 20]} />}
        {spec.shape === "cone" && <coneGeometry args={[spec.scale * 0.8, spec.scale * 2.2, 8]} />}
        <meshStandardMaterial
          color={spec.color}
          emissive={spec.emissive ?? spec.color}
          emissiveIntensity={spec.emissive ? 0.65 : 0.2}
          flatShading
        />
      </mesh>
      {spec.label && (
        <Text
          position={[0, spec.scale + 0.09, 0]}
          fontSize={0.05}
          color={ARES_COLORS.softGray}
          anchorX="center"
        >
          {spec.label}
        </Text>
      )}
    </group>
  );
}

/** Central fixation marker for Acquire-phase drills. */
function FixationMarker() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.z = clock.elapsedTime * 0.8;
  });
  return (
    <mesh ref={ref} position={[0, 1.5, -2.2]}>
      <ringGeometry args={[0.028, 0.042, 4]} />
      <meshBasicMaterial color={ARES_COLORS.white} />
    </mesh>
  );
}

export function DrillRunner() {
  const engine = useAppStore((s) => s.engine);
  const perf = PERF_MODES[useAppStore((s) => s.perfModeId)];
  const [poolVersion, setPoolVersion] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const hudAccum = useRef(0);
  const phaseColor = engine ? PHASE_META[engine.definition.phase].color : ARES_COLORS.electricTeal;
  const pulseRef = useRef<THREE.MeshBasicMaterial>(null);
  const pulseIntensity = useRef(0);

  // Re-render pooled slots on spawn/despawn; finish on completion.
  useEffect(() => {
    if (!engine) return;
    const unsub = engine.subscribe((e) => {
      if (e.type === "spawn" || e.type === "despawn") setPoolVersion((v) => v + 1);
      if (e.type === "spawn") pulseIntensity.current = 1;
      if (e.type === "stateChange" && (e.state === "complete" || e.state === "aborted")) {
        // defer: let the frame finish before React tears the scene down
        setTimeout(() => useAppStore.getState().finishDrill(), 350);
      }
    });
    return unsub;
  }, [engine]);

  useFrame((_, delta) => {
    if (!engine) return;
    engine.update(delta * 1000);

    // countdown display
    const st = engine.getState();
    if (st === "countdown") {
      const c = Math.ceil(engine.countdownRemaining / 1000);
      setCountdown((prev) => (prev === c ? prev : c));
    } else if (countdown !== null) {
      setCountdown(null);
    }

    // Neural Arena phase pulse decay
    pulseIntensity.current = Math.max(0, pulseIntensity.current - delta * 2.2);
    if (pulseRef.current) pulseRef.current.opacity = 0.15 + pulseIntensity.current * 0.4;

    // throttled HUD snapshot
    hudAccum.current += delta;
    if (hudAccum.current >= 1 / HUD_REFRESH_HZ) {
      hudAccum.current = 0;
      useAppStore.getState().updateSnapshot(engine.getSnapshot());
    }
  });

  const isAcquireStyle = useMemo(
    () =>
      engine !== null &&
      (engine.definition.phase === "Acquire" ||
        (engine.parameters.fixationLoad as boolean | undefined) === true),
    [engine],
  );

  if (!engine) return null;

  return (
    <group>
      {/* Neural Arena — phase stress ring behind the target field */}
      <mesh position={[0, 1.5, -4.5]}>
        <ringGeometry args={[2.4, 2.55, 40]} />
        <meshBasicMaterial ref={pulseRef} color={phaseColor} transparent opacity={0.2} />
      </mesh>

      {isAcquireStyle && <FixationMarker />}

      {/* background press catcher — false starts (inward-facing shell) */}
      <mesh
        onPointerDown={(e) => {
          engine.registerBackgroundPress(handFromPointerEvent(e));
        }}
      >
        <sphereGeometry args={[9, 12, 12]} />
        <meshBasicMaterial side={THREE.BackSide} transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* pooled targets */}
      {engine.pool.slots.map((slot) => (
        <TargetMesh
          key={slot.slotIndex}
          slot={slot}
          segments={perf.sphereSegments}
          version={poolVersion}
        />
      ))}

      {/* countdown */}
      {countdown !== null && countdown > 0 && (
        <Text
          position={[0, 1.7, -2.4]}
          fontSize={0.5}
          color={phaseColor}
          anchorX="center"
          anchorY="middle"
        >
          {String(countdown)}
        </Text>
      )}
    </group>
  );
}
