import { useMemo } from "react";
import * as THREE from "three";
import { ARES_COLORS } from "@/ares/colors";

/**
 * VENUE KIT — shared procedural primitives for the five A.R.E.S. environments.
 *
 * MEASUREMENT RULE (see docs/ENVIRONMENTS_SCOPE.md):
 * The suite is a measurement instrument. Background luminance and clutter shift
 * reaction and search times, so every venue is SURROUND-ONLY: nothing a venue
 * renders may sit inside the athlete's action volume. The controlled core is a
 * sphere of radius CORE_R around the origin; venue geometry starts outside it,
 * and a luminance-clamped scrim stands between the two.
 */

/** Radius of the controlled core. No venue geometry inside this. */
export const CORE_R = 9;
/** Everything a venue draws is clamped below this relative luminance (0..1). */
export const MAX_VENUE_LUMA = 0.34;

/**
 * Scale a colour's luminance down until it sits under `max`. Hue and saturation
 * survive; only brightness is capped. This is what makes "a stadium at night"
 * a construction guarantee rather than an art direction note.
 */
export function clampLuma(hex: string, max = MAX_VENUE_LUMA): string {
  const c = new THREE.Color(hex);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (l <= max || l <= 1e-6) return `#${c.getHexString()}`;
  c.multiplyScalar(max / l);
  return `#${c.getHexString()}`;
}

/**
 * The controlled backdrop. A cylinder segment at CORE_R spanning the frontal
 * cone, dark and near-opaque, so venue depth reads as a suggestion instead of
 * as a variable. Radially open behind the athlete — that half never carries
 * task stimuli, so it can stay fully immersive.
 */
export function BackdropScrim({ opacity = 0.88 }: { opacity?: number }) {
  return (
    <mesh position={[0, 4.0, 0]} rotation={[0, Math.PI - Math.PI / 3, 0]}>
      <cylinderGeometry
        args={[CORE_R, CORE_R, 15, 40, 1, true, 0, (2 * Math.PI) / 3 + 0.6]}
      />
      <meshBasicMaterial
        color={ARES_COLORS.nearBlack}
        side={THREE.BackSide}
        transparent
        opacity={opacity}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}

/** Playing surface: a ring starting outside the controlled core. */
export function VenueGround({
  color,
  innerR = CORE_R,
  outerR = 55,
  y = -0.002,
}: {
  color: string;
  innerR?: number;
  outerR?: number;
  y?: number;
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <ringGeometry args={[innerR, outerR, 64]} />
      <meshBasicMaterial color={clampLuma(color)} fog={false} />
    </mesh>
  );
}

/**
 * Grandstand bowl — a raked frustum ring. `openCorners` leaves four gaps, which
 * is what makes a baseball park read as a baseball park.
 */
export function Bowl({
  innerR,
  rise = 14,
  depth = 20,
  y = 0,
  color = ARES_COLORS.graphite,
  openCorners = false,
  arc = Math.PI * 2,
}: {
  innerR: number;
  rise?: number;
  depth?: number;
  y?: number;
  color?: string;
  openCorners?: boolean;
  arc?: number;
}) {
  const segs = openCorners ? 4 : 1;
  const span = openCorners ? (arc / 4) * 0.82 : arc;
  return (
    <group position={[0, y, 0]}>
      {Array.from({ length: segs }, (_, i) => (
        <mesh key={i} rotation={[0, (i * arc) / segs, 0]}>
          <cylinderGeometry
            args={[innerR + depth, innerR, rise, 40, 1, true, 0, span]}
          />
          <meshBasicMaterial
            color={clampLuma(color)}
            side={THREE.DoubleSide}
            fog={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Crowd — dark stipple with sparse dim points. Mass and depth, never legible
 * faces, never bright. Static by design: animated peripheral motion would
 * contaminate the Acquire-phase peripheral-detection drills.
 */
export function CrowdBand({
  r,
  y,
  height,
  count = 900,
  arc = Math.PI * 2,
  tint = "#3A4270",
}: {
  r: number;
  y: number;
  height: number;
  count?: number;
  arc?: number;
  tint?: string;
}) {
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const a = Math.random() * arc;
      const rr = r + t * height * 1.4;
      arr[i * 3] = rr * Math.cos(a);
      arr[i * 3 + 1] = y + t * height;
      arr[i * 3 + 2] = rr * Math.sin(a);
    }
    return arr;
  }, [count, r, y, height, arc]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.34}
        color={clampLuma(tint, 0.22)}
        transparent
        opacity={0.5}
        sizeAttenuation
        fog={false}
      />
    </points>
  );
}

/** Floodlight mast — pole plus an unlit head and a soft clamped halo. */
export function FloodMast({
  position,
  height = 26,
}: {
  position: [number, number, number];
  height?: number;
}) {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[0.5, height, 0.5]} />
        <meshBasicMaterial color={clampLuma(ARES_COLORS.graphite)} fog={false} />
      </mesh>
      <mesh position={[0, height + 1.4, 0]}>
        <boxGeometry args={[5.2, 2.6, 0.4]} />
        <meshBasicMaterial color={clampLuma("#1A1E3D")} fog={false} />
      </mesh>
      <mesh position={[0, height + 1.4, 0.4]}>
        <planeGeometry args={[5.0, 2.2]} />
        <meshBasicMaterial
          color={clampLuma("#8FA6C8", 0.3)}
          transparent
          opacity={0.5}
          fog={false}
        />
      </mesh>
    </group>
  );
}

/** Enclosed-arena roof: a flat dark disc plus a sparse truss lattice. */
export function TrussRoof({ r, y }: { r: number; y: number }) {
  const bars = 14;
  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r, 40]} />
        <meshBasicMaterial color={clampLuma("#080B1C")} side={THREE.DoubleSide} fog={false} />
      </mesh>
      {Array.from({ length: bars }, (_, i) => (
        <mesh key={i} position={[0, -0.35, 0]} rotation={[0, (i * Math.PI) / bars, 0]}>
          <boxGeometry args={[r * 2, 0.18, 0.18]} />
          <meshBasicMaterial color={clampLuma(ARES_COLORS.deepPurple)} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Painted surface lines. Each entry is a rectangle in the ground plane; the
 * caller keeps them outside CORE_R so nothing paints into the action volume.
 */
export function GroundLines({
  lines,
  color = "#8FA0C4",
  width = 0.18,
  y = 0.004,
}: {
  lines: { x: number; z: number; len: number; axis: "x" | "z" }[];
  color?: string;
  width?: number;
  y?: number;
}) {
  const c = clampLuma(color, 0.42);
  return (
    <group>
      {lines.map((l, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[l.x, y, l.z]}
        >
          <planeGeometry
            args={l.axis === "x" ? [l.len, width] : [width, l.len]}
          />
          <meshBasicMaterial color={c} transparent opacity={0.75} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

/** A ring painted on the ground (centre circles, infield arcs, faceoff dots). */
export function GroundArc({
  r,
  thickness = 0.16,
  color = "#8FA0C4",
  center = [0, 0] as [number, number],
  y = 0.004,
  arc = Math.PI * 2,
  start = 0,
}: {
  r: number;
  thickness?: number;
  color?: string;
  center?: [number, number];
  y?: number;
  arc?: number;
  start?: number;
}) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[center[0], y, center[1]]}
    >
      <ringGeometry args={[r, r + thickness, 56, 1, start, arc]} />
      <meshBasicMaterial
        color={clampLuma(color, 0.42)}
        transparent
        opacity={0.75}
        side={THREE.DoubleSide}
        fog={false}
      />
    </mesh>
  );
}
