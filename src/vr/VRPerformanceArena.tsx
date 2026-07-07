import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { ARES_COLORS } from "@/ares/colors";
import { ARES_PHASES, PHASE_META, type ARESPhase } from "@/ares/phases";
import { APP_NAME } from "@/ares/constants";
import { useAppStore } from "@/app/providers/appStore";
import { SpatialPanel, PanelText } from "./SpatialPanel";
import { sfx } from "@/utils/audio";

/**
 * VR Performance Arena — the immersive Ares command environment.
 * A central floating A.R.E.S. Performance Loop and four training portals
 * (Acquire / Route / Execute / Synchronize) arranged around the athlete.
 */

function ArenaLogo() {
  const tex = useTexture("/brand/aesv-logo.png");
  return (
    <mesh position={[0, 3.6, -5.2]}>
      <planeGeometry args={[1.15, 1.15]} />
      <meshBasicMaterial map={tex} transparent opacity={0.95} />
    </mesh>
  );
}

function FloatingPerformanceLoop() {
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.25;
  });
  return (
    <group position={[0, 2.75, -3.4]} scale={0.5}>
      <group ref={group}>
        {ARES_PHASES.map((phase, i) => (
          <group key={phase} rotation={[0, (i * Math.PI) / 2, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.9, 0.035, 6, 24, Math.PI / 2 - 0.18]} />
              <meshBasicMaterial color={PHASE_META[phase].color} />
            </mesh>
            <Text
              position={[Math.sin(Math.PI / 4) * 1.25, 0.02, -Math.cos(Math.PI / 4) * 1.25]}
              rotation={[0, Math.PI / 4 + Math.PI, 0]}
              fontSize={0.16}
              color={PHASE_META[phase].color}
              anchorX="center"
              anchorY="middle"
              letterSpacing={0.12}
            >
              {phase.toUpperCase()}
            </Text>
          </group>
        ))}
        {/* core */}
        <mesh>
          <icosahedronGeometry args={[0.22, 1]} />
          <meshStandardMaterial
            color={ARES_COLORS.deepPurple}
            emissive={ARES_COLORS.electricTeal}
            emissiveIntensity={0.7}
            flatShading
          />
        </mesh>
      </group>
    </group>
  );
}

function PhasePortal({ phase }: { phase: ARESPhase }) {
  const meta = PHASE_META[phase];
  const selectPhase = useAppStore((s) => s.selectPhase);
  const [hover, setHover] = useState(false);
  const ring = useRef<THREE.Mesh>(null);
  const outer = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ring.current) {
      const s = hover ? 1.06 + Math.sin(clock.elapsedTime * 4) * 0.02 : 1;
      ring.current.scale.setScalar(s);
    }
    if (outer.current) outer.current.rotation.z = -clock.elapsedTime * 0.5;
    if (beam.current) {
      (beam.current.material as THREE.MeshBasicMaterial).opacity =
        (hover ? 0.16 : 0.07) + Math.sin(clock.elapsedTime * 1.5) * 0.02;
    }
  });

  const dist = 3.4;
  const x = Math.sin(meta.portalAngle) * dist;
  const z = -Math.cos(meta.portalAngle) * dist;

  return (
    <group position={[x, 1.55, z]} rotation={[0, -meta.portalAngle + Math.PI, 0]}>
      {/* portal ring */}
      <mesh
        ref={ring}
        onClick={(e) => {
          e.stopPropagation();
          sfx.portal();
          selectPhase(phase);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
        rotation={[0, Math.PI, 0]}
      >
        <torusGeometry args={[0.62, 0.045, 8, 36]} />
        <meshStandardMaterial
          color={meta.color}
          emissive={meta.color}
          emissiveIntensity={hover ? 1.1 : 0.5}
        />
      </mesh>
      {/* portal fill */}
      <mesh position={[0, 0, -0.01]} rotation={[0, Math.PI, 0]}>
        <circleGeometry args={[0.6, 28]} />
        <meshBasicMaterial color={ARES_COLORS.deepPurple} transparent opacity={hover ? 0.55 : 0.3} />
      </mesh>
      <Text
        position={[0, 0.92, 0]}
        rotation={[0, Math.PI, 0]}
        fontSize={0.14}
        color={meta.color}
        anchorX="center"
        letterSpacing={0.14}
      >
        {phase.toUpperCase()}
      </Text>
      <Text
        position={[0, -0.86, 0]}
        rotation={[0, Math.PI, 0]}
        fontSize={0.048}
        color={ARES_COLORS.softGray}
        anchorX="center"
        maxWidth={1.0}
        textAlign="center"
      >
        {meta.tagline}
      </Text>
      {/* counter-rotating orbit ring */}
      <group ref={outer} rotation={[0, Math.PI, 0]}>
        {Array.from({ length: 8 }, (_, k) => (
          <mesh key={k} position={[Math.cos((k / 8) * Math.PI * 2) * 0.76, Math.sin((k / 8) * Math.PI * 2) * 0.76, 0]}>
            <boxGeometry args={[0.035, 0.012, 0.012]} />
            <meshBasicMaterial color={meta.color} transparent opacity={0.85} />
          </mesh>
        ))}
      </group>
      {/* rising light beam behind the portal */}
      <mesh ref={beam} position={[0, 0.4, 0.35]}>
        <cylinderGeometry args={[0.5, 0.65, 4.2, 12, 1, true]} />
        <meshBasicMaterial color={meta.color} transparent opacity={0.07} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* pedestal */}
      <group position={[0, -1.55, 0]}>
        <mesh>
          <cylinderGeometry args={[0.5, 0.62, 0.1, 20]} />
          <meshStandardMaterial color={ARES_COLORS.graphite} emissive={meta.color} emissiveIntensity={0.12} flatShading />
        </mesh>
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.42, 0.48, 24]} />
          <meshBasicMaterial color={meta.color} transparent opacity={hover ? 0.9 : 0.45} />
        </mesh>
      </group>
    </group>
  );
}

export function VRPerformanceArena() {
  const athlete = useAppStore((s) => s.athlete);
  const sessions = useAppStore((s) => s.sessions);

  return (
    <group>
      <ArenaLogo />
      <FloatingPerformanceLoop />
      {ARES_PHASES.map((p) => (
        <PhasePortal key={p} phase={p} />
      ))}

      {/* welcome / status panel below the loop */}
      <SpatialPanel
        position={[0, 0.95, -2.0]}
        width={1.35}
        height={0.5}
        title={APP_NAME}
        accent={ARES_COLORS.electricTeal}
      >
        <PanelText
          position={[-0.6, 0.05, 0]}
          text={`Athlete: ${athlete.name}   •   ${sessions.length} session(s) on record`}
          size={0.048}
          color={ARES_COLORS.white}
          maxWidth={1.25}
        />
        <PanelText
          position={[-0.6, -0.09, 0]}
          text="Select a phase portal to begin. Acquire. Route. Execute. Synchronize."
          size={0.042}
          maxWidth={1.25}
        />
      </SpatialPanel>
    </group>
  );
}
