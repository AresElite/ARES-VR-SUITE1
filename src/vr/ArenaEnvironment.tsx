import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** Procedural gradient textures — zero asset downloads, generated once. */
function makeGradientTexture(stops: [number, string][], vertical = true): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = vertical ? 4 : 256;
  cv.height = vertical ? 256 : 4;
  const g = cv.getContext("2d")!;
  const grad = vertical ? g.createLinearGradient(0, 256, 0, 0) : g.createLinearGradient(0, 0, 256, 0);
  for (const [at, c] of stops) grad.addColorStop(at, c);
  g.fillStyle = grad;
  g.fillRect(0, 0, cv.width, cv.height);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRadialTexture(stops: [number, string][]): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 256;
  const g = cv.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
  for (const [at, c] of stops) grad.addColorStop(at, c);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Deep-space dome with an Ares-purple horizon band and teal zenith hint. */
function SkyDome() {
  const tex = useMemo(
    () =>
      makeGradientTexture([
        [0.0, "#05071c"],
        [0.32, "#0B0F2A"],
        [0.46, "#1c1545"],
        [0.52, "#2D234F"],
        [0.58, "#151b3d"],
        [0.8, "#0B0F2A"],
        [1.0, "#070b22"],
      ]),
    [],
  );
  return (
    <mesh>
      <sphereGeometry args={[46, 24, 18]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false} />
    </mesh>
  );
}

/** Slow-breathing energy floor: radial glow + expanding pulse ring. */
function EnergyFloor({ tint }: { tint: string }) {
  const tex = useMemo(
    () =>
      makeRadialTexture([
        [0.0, "rgba(41,152,170,0.32)"],
        [0.22, "rgba(45,35,79,0.5)"],
        [0.55, "rgba(17,20,40,0.9)"],
        [1.0, "rgba(7,10,28,1)"],
      ]),
    [],
  );
  const pulse = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (pulse.current) {
      const t = (clock.elapsedTime % 6) / 6;
      pulse.current.scale.setScalar(0.4 + t * 3.4);
      (pulse.current.material as THREE.MeshBasicMaterial).opacity = 0.28 * (1 - t);
    }
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <circleGeometry args={[16, 48]} />
        <meshBasicMaterial map={tex} color={tint} />
      </mesh>
      <mesh ref={pulse} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[3.4, 3.5, 48]} />
        <meshBasicMaterial color="#2998AA" transparent opacity={0.2} depthWrite={false} />
      </mesh>
    </group>
  );
}
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
      <fog attach="fog" args={[ARES_COLORS.nearBlack, 14, 44]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 6, 2]} intensity={0.55} />

      <SkyDome />
      <EnergyFloor tint={environment === "baseball" ? "#1a2e22" : "#EAF0FF"} />
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
