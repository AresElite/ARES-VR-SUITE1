import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { PHASE_META, ARES_PHASES, type ARESPhase } from "@/ares/phases";
import { PERF_MODES } from "@/utils/performance";
import { useAppStore } from "@/app/providers/appStore";
import type { EnvironmentId } from "@/ares/drillTypes";

/**
 * The A.R.E.S. Neural Arena — 360° performance environment.
 * Deep-space graphite base, Ares-purple horizon ring, starfield, and a
 * floor-mapped Performance Loop ring that pulses with the phase currently
 * under load. Geometry is deliberately light for Quest 2.
 */

function Starfield() {
  const perf = PERF_MODES[useAppStore((s) => s.perfModeId)];
  const positions = useMemo(() => {
    const arr = new Float32Array(perf.starCount * 3);
    for (let i = 0; i < perf.starCount; i++) {
      const r = 18 + Math.random() * 22;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6 + 0.5;
      arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    return arr;
  }, [perf.starCount]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.05} color={ARES_COLORS.softGray} transparent opacity={0.55} sizeAttenuation />
    </points>
  );
}

/** Floor ring segmented into the four A.R.E.S. phases; active phase glows. */
function PerformanceLoopFloor({ activePhase }: { activePhase: ARESPhase | null }) {
  const refs = useRef<Record<string, THREE.MeshBasicMaterial | null>>({});
  const pulse = useRef(0);

  useFrame((_, dt) => {
    pulse.current += dt;
    for (const phase of ARES_PHASES) {
      const mat = refs.current[phase];
      if (!mat) continue;
      const isActive = phase === activePhase;
      const base = isActive ? 0.85 : 0.28;
      mat.opacity = isActive ? base + Math.sin(pulse.current * 3) * 0.15 : base;
    }
  });

  return (
    <group position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {ARES_PHASES.map((phase, i) => (
        <mesh key={phase} rotation={[0, 0, (i * Math.PI) / 2 + Math.PI / 4]}>
          <ringGeometry args={[3.1, 3.35, 24, 1, -Math.PI / 4 + 0.06, Math.PI / 2 - 0.12]} />
          <meshBasicMaterial
            ref={(m) => {
              refs.current[phase] = m;
            }}
            color={PHASE_META[phase].color}
            transparent
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function SportProps({ environment }: { environment: EnvironmentId }) {
  if (environment === "baseball") {
    return (
      <group>
        {/* home plate */}
        <mesh position={[0, 0.03, -0.6]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.22, 5]} />
          <meshBasicMaterial color={ARES_COLORS.white} />
        </mesh>
        {/* mound line */}
        <mesh position={[0, 0.02, -6]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.62, 20]} />
          <meshBasicMaterial color={ARES_COLORS.warningGold} transparent opacity={0.5} />
        </mesh>
        {/* strike zone frame */}
        <group position={[0, 1.35, -1.1]}>
          <mesh>
            <planeGeometry args={[0.55, 0.62]} />
            <meshBasicMaterial color={ARES_ACCENTS.tealBright} transparent opacity={0.07} />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[new THREE.PlaneGeometry(0.55, 0.62)]} />
            <lineBasicMaterial color={ARES_ACCENTS.tealBright} transparent opacity={0.6} />
          </lineSegments>
        </group>
      </group>
    );
  }
  if (environment === "racing") {
    return (
      <group position={[0, 0, -4]}>
        {/* light tree pole */}
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[0.06, 2.4, 0.06]} />
          <meshBasicMaterial color={ARES_COLORS.graphite} />
        </mesh>
        <mesh position={[0, 2.3, 0]}>
          <boxGeometry args={[0.5, 0.9, 0.08]} />
          <meshBasicMaterial color={ARES_COLORS.nearBlack} />
        </mesh>
      </group>
    );
  }
  if (environment === "tactical") {
    return (
      <group>
        {/* tunnel walls */}
        <mesh position={[-1.6, 1.4, -3]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[8, 2.8]} />
          <meshBasicMaterial color={ARES_COLORS.graphite} transparent opacity={0.7} />
        </mesh>
        <mesh position={[1.6, 1.4, -3]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[8, 2.8]} />
          <meshBasicMaterial color={ARES_COLORS.graphite} transparent opacity={0.7} />
        </mesh>
      </group>
    );
  }
  return null;
}

export function ArenaEnvironment({ environment = "arena" }: { environment?: EnvironmentId }) {
  const phase = useAppStore((s) => s.phase);

  return (
    <group>
      <color attach="background" args={[ARES_COLORS.nearBlack]} />
      <fog attach="fog" args={[ARES_COLORS.nearBlack, 12, 42]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[3, 6, 2]} intensity={0.6} />

      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[14, 40]} />
        <meshBasicMaterial color={environment === "baseball" ? "#0A1410" : ARES_COLORS.graphite} />
      </mesh>
      {/* concentric guide rings */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[1.15, 1.18, 40]} />
        <meshBasicMaterial color={ARES_COLORS.royalPurple} transparent opacity={0.8} />
      </mesh>
      <PerformanceLoopFloor activePhase={phase} />
      {/* horizon ring */}
      <mesh position={[0, 2.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[13, 0.05, 6, 48]} />
        <meshBasicMaterial color={ARES_COLORS.deepPurple} transparent opacity={0.75} />
      </mesh>
      <Starfield />
      <SportProps environment={environment} />
    </group>
  );
}
