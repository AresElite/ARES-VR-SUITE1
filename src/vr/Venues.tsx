import { useMemo } from "react";
import * as THREE from "three";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import {
  CORE_R,
  Bowl,
  CrowdBand,
  FloodMast,
  TrussRoof,
  VenueGround,
  GroundLines,
  GroundArc,
  clampLuma,
} from "./VenueKit";

/**
 * THE FIVE VENUES. Every one of these is surround-only: geometry starts at
 * CORE_R and the BackdropScrim stands between it and the athlete. See
 * docs/ENVIRONMENTS_SCOPE.md for why that constraint is non-negotiable.
 *
 * Style: low-poly silhouette architecture, dark-first, structural edges in
 * Electric Teal, ambient volumetrics in Vivid Purple. Arena at night, house
 * lights down, field lit — which is also the lighting condition that keeps the
 * backdrop dark and stable.
 */

/** Parallel mow/turf stripes as a repeating ground texture. */
function useStripeTexture(a: string, b: string, repeat = 26): THREE.CanvasTexture {
  return useMemo(() => {
    const cv = document.createElement("canvas");
    cv.width = 8;
    cv.height = 8;
    const g = cv.getContext("2d")!;
    g.fillStyle = clampLuma(a);
    g.fillRect(0, 0, 8, 4);
    g.fillStyle = clampLuma(b);
    g.fillRect(0, 4, 8, 4);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, repeat);
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [a, b, repeat]);
}

function StripedGround({ a, b, repeat }: { a: string; b: string; repeat?: number }) {
  const tex = useStripeTexture(a, b, repeat);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
      <ringGeometry args={[CORE_R, 55, 64]} />
      <meshBasicMaterial map={tex} fog={false} />
    </mesh>
  );
}

/** Four corner masts at a given radius. */
function CornerMasts({ r, height }: { r: number; height: number }) {
  return (
    <group>
      {[45, 135, 225, 315].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return (
          <FloodMast
            key={deg}
            position={[r * Math.cos(a), 0, r * Math.sin(a)]}
            height={height}
          />
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ SOCCER */

export function SoccerStadium() {
  return (
    <group>
      <StripedGround a="#1B4D2E" b="#173F26" repeat={22} />
      {/* centre circle + penalty box behind the athlete */}
      <GroundArc r={9.15} thickness={0.2} color="#C8D4E8" />
      <GroundLines
        color="#C8D4E8"
        lines={[
          { x: 0, z: 22, len: 40, axis: "x" },
          { x: -20, z: 13, len: 18, axis: "z" },
          { x: 20, z: 13, len: 18, axis: "z" },
          { x: 0, z: -34, len: 40, axis: "x" },
        ]}
      />
      {/* goal frame, far downfield and well outside the action volume */}
      <group position={[0, 0, -34]}>
        <mesh position={[-3.66, 1.22, 0]}>
          <boxGeometry args={[0.14, 2.44, 0.14]} />
          <meshBasicMaterial color={clampLuma("#E8EEF8", 0.4)} fog={false} />
        </mesh>
        <mesh position={[3.66, 1.22, 0]}>
          <boxGeometry args={[0.14, 2.44, 0.14]} />
          <meshBasicMaterial color={clampLuma("#E8EEF8", 0.4)} fog={false} />
        </mesh>
        <mesh position={[0, 2.44, 0]}>
          <boxGeometry args={[7.46, 0.14, 0.14]} />
          <meshBasicMaterial color={clampLuma("#E8EEF8", 0.4)} fog={false} />
        </mesh>
        <mesh position={[0, 1.22, -0.9]}>
          <planeGeometry args={[7.32, 2.44]} />
          <meshBasicMaterial
            color={clampLuma("#7F8DB0", 0.2)}
            transparent
            opacity={0.28}
            wireframe
            fog={false}
          />
        </mesh>
      </group>
      {/* continuous single-tier bowl */}
      <Bowl innerR={40} rise={18} depth={22} color="#141830" />
      <CrowdBand r={41} y={1.5} height={16} count={1400} />
      <CornerMasts r={54} height={26} />
      {/* teal structural edge along the bowl lip */}
      <mesh position={[0, 18.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[62, 0.16, 5, 56]} />
        <meshBasicMaterial color={clampLuma(ARES_COLORS.electricTeal, 0.3)} fog={false} />
      </mesh>
    </group>
  );
}

/* ---------------------------------------------------------------- FOOTBALL */

export function FootballField() {
  return (
    <group>
      <StripedGround a="#1D4A2C" b="#183E24" repeat={30} />
      {/* yard lines every 5 yards, athlete near midfield */}
      <GroundLines
        color="#D2DCEE"
        width={0.16}
        lines={Array.from({ length: 14 }, (_, i) => {
          const z = (i - 6.5) * 4.57 * 1.6;
          return { x: 0, z, len: 48.8, axis: "x" as const };
        }).filter((l) => Math.abs(l.z) > CORE_R)}
      />
      {/* hash marks */}
      <GroundLines
        color="#8FA0C4"
        width={0.12}
        lines={Array.from({ length: 10 }, (_, i) => ({
          x: i % 2 === 0 ? -6.1 : 6.1,
          z: (i - 4.5) * 5.6,
          len: 1.2,
          axis: "x" as const,
        })).filter((l) => Math.abs(l.z) > CORE_R)}
      />
      {/* goalposts, far downfield */}
      {[-1, 1].map((s) => (
        <group key={s} position={[0, 0, s * 46]}>
          <mesh position={[0, 1.5, 0]}>
            <boxGeometry args={[0.18, 3, 0.18]} />
            <meshBasicMaterial color={clampLuma("#C8B45A", 0.34)} fog={false} />
          </mesh>
          <mesh position={[0, 3.05, 0]}>
            <boxGeometry args={[5.64, 0.16, 0.16]} />
            <meshBasicMaterial color={clampLuma("#C8B45A", 0.34)} fog={false} />
          </mesh>
          {[-2.82, 2.82].map((x) => (
            <mesh key={x} position={[x, 6.2, 0]}>
              <boxGeometry args={[0.14, 6.3, 0.14]} />
              <meshBasicMaterial color={clampLuma("#C8B45A", 0.34)} fog={false} />
            </mesh>
          ))}
        </group>
      ))}
      {/* deep double-tier bowl */}
      <Bowl innerR={34} rise={14} depth={16} color="#141830" />
      <CrowdBand r={35} y={1.2} height={13} count={1200} />
      <Bowl innerR={54} rise={16} depth={14} y={17} color="#10142A" />
      <CrowdBand r={55} y={18} height={14} count={900} />
      {/* press box on one side */}
      <mesh position={[0, 24, 62]}>
        <boxGeometry args={[46, 7, 5]} />
        <meshBasicMaterial color={clampLuma("#161B36")} fog={false} />
      </mesh>
      <CornerMasts r={70} height={34} />
    </group>
  );
}

/* ------------------------------------------------------------------ HOCKEY */

export function HockeyRink() {
  return (
    <group>
      <VenueGround color="#8FA8C8" outerR={30} />
      {/* blue lines, red centre line, faceoff circles */}
      <GroundLines
        color="#3E6BD8"
        width={0.45}
        lines={[
          { x: 0, z: -12, len: 26, axis: "x" },
          { x: 0, z: 12, len: 26, axis: "x" },
        ]}
      />
      <GroundArc r={CORE_R + 0.4} thickness={0.5} color="#C0364A" arc={0.9} start={-0.45} />
      {[-1, 1].map((s) =>
        [-1, 1].map((t) => (
          <GroundArc
            key={`${s}${t}`}
            r={4.5}
            thickness={0.28}
            color="#C0364A"
            center={[s * 6.8, t * 18]}
          />
        )),
      )}
      {/* goal crease behind the athlete */}
      <GroundArc r={1.8} thickness={0.24} color="#3E6BD8" center={[0, 26]} arc={Math.PI} start={Math.PI} />

      {/* dasher boards with a teal kickplate, and glass above */}
      <group>
        <mesh position={[0, 0.535, 0]}>
          <cylinderGeometry args={[30, 30, 1.07, 48, 1, true]} />
          <meshBasicMaterial color={clampLuma("#E4EAF6", 0.3)} side={THREE.BackSide} fog={false} />
        </mesh>
        <mesh position={[0, 0.14, 0]}>
          <cylinderGeometry args={[29.96, 29.96, 0.28, 48, 1, true]} />
          <meshBasicMaterial
            color={clampLuma(ARES_COLORS.electricTeal, 0.28)}
            side={THREE.BackSide}
            fog={false}
          />
        </mesh>
        {/* transparent glass — depth without background luminance */}
        <mesh position={[0, 2.15, 0]}>
          <cylinderGeometry args={[30, 30, 2.1, 48, 1, true]} />
          <meshBasicMaterial
            color={clampLuma("#9FC4D8", 0.24)}
            side={THREE.BackSide}
            transparent
            opacity={0.14}
            depthWrite={false}
            fog={false}
          />
        </mesh>
      </group>

      <Bowl innerR={31} rise={13} depth={15} color="#141830" />
      <CrowdBand r={32} y={2.6} height={12} count={1100} />
      <TrussRoof r={48} y={26} />
      {/* scoreboard cube overhead, unlit face toward the athlete */}
      <group position={[0, 18, 0]}>
        <mesh>
          <boxGeometry args={[6, 4, 6]} />
          <meshBasicMaterial color={clampLuma("#0E1226")} fog={false} />
        </mesh>
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(6, 4, 6)]} />
          <lineBasicMaterial color={clampLuma(ARES_ACCENTS.purpleGlow, 0.3)} />
        </lineSegments>
      </group>
    </group>
  );
}

/* ---------------------------------------------------------------- BASEBALL */

export function BaseballDiamond() {
  return (
    <group>
      {/* infield dirt arc, then grass beyond */}
      <VenueGround color="#5C4230" innerR={CORE_R} outerR={20} />
      <VenueGround color="#1D4A2C" innerR={20} outerR={62} y={-0.004} />
      {/* basepath chalk running out from the athlete's stance at the plate */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          rotation={[-Math.PI / 2, 0, -s * Math.PI / 4]}
          position={[s * 14, 0.005, -14]}
        >
          <planeGeometry args={[0.16, 32]} />
          <meshBasicMaterial color={clampLuma("#DCE4F2", 0.42)} fog={false} />
        </mesh>
      ))}
      {/* outfield wall with warning track */}
      <VenueGround color="#3A2A1E" innerR={58} outerR={62} y={0.002} />
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[62, 62, 3.2, 56, 1, true, Math.PI * 0.75, Math.PI * 1.5]} />
        <meshBasicMaterial color={clampLuma("#14301F")} side={THREE.BackSide} fog={false} />
      </mesh>
      {/* foul poles */}
      {[Math.PI * 0.78, Math.PI * 2.22].map((a, i) => (
        <mesh key={i} position={[62 * Math.cos(a), 9, 62 * Math.sin(a)]}>
          <boxGeometry args={[0.4, 18, 0.4]} />
          <meshBasicMaterial color={clampLuma("#C8B45A", 0.34)} fog={false} />
        </mesh>
      ))}
      {/* open-corner grandstand — baseball bowls are not continuous */}
      <Bowl innerR={40} rise={15} depth={18} color="#141830" openCorners />
      <CrowdBand r={41} y={1.4} height={14} count={1000} />
      {/* backstop netting behind the athlete */}
      <mesh position={[0, 5, 16]}>
        <cylinderGeometry args={[16, 16, 10, 24, 1, true, Math.PI * 1.72, Math.PI * 0.56]} />
        <meshBasicMaterial
          color={clampLuma("#6E7A9E", 0.2)}
          side={THREE.DoubleSide}
          transparent
          opacity={0.16}
          wireframe
          fog={false}
        />
      </mesh>
      <CornerMasts r={72} height={30} />
    </group>
  );
}

/* ---------------------------------------------------------------- SPEEDWAY */

/**
 * A generic superspeedway with a brick start/finish stripe. Deliberately NOT a
 * reproduction of any identifiable venue: real speedway architecture, wordmarks
 * and pagoda silhouettes are protected trade dress. This captures the feel of
 * standing on the bricks without an identifiable-venue claim.
 */
function BrickStripe() {
  const tex = useMemo(() => {
    const cv = document.createElement("canvas");
    cv.width = 64;
    cv.height = 32;
    const g = cv.getContext("2d")!;
    g.fillStyle = clampLuma("#3A2018");
    g.fillRect(0, 0, 64, 32);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 8; col++) {
        const off = row % 2 === 0 ? 0 : 4;
        const v = 0.82 + Math.random() * 0.36;
        const c = new THREE.Color(clampLuma("#7A3E2A")).multiplyScalar(v);
        g.fillStyle = `#${c.getHexString()}`;
        g.fillRect(col * 8 + off, row * 8, 7, 7);
      }
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(24, 1);
    t.magFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);

  return (
    <group>
      {/*
       * The bricks run across the athlete's stance — the signature moment. They
       * sit at z = +1.4, just behind the heels, so they are underfoot and in
       * peripheral view but never behind a target: the forward task cone
       * (z < 0, |x| < CORE_R) stays clear of venue geometry.
       */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 1.4]}>
        <planeGeometry args={[70, 2.4]} />
        <meshBasicMaterial map={tex} fog={false} />
      </mesh>
      <GroundLines
        color="#E4EAF6"
        width={0.3}
        lines={[{ x: 0, z: 2.9, len: 70, axis: "x" }]}
        y={0.008}
      />
    </group>
  );
}

export function Speedway() {
  return (
    <group>
      <VenueGround color="#232838" innerR={CORE_R} outerR={26} />
      <BrickStripe />
      {/* pit wall on one side */}
      <mesh position={[0, 0.55, 20]}>
        <boxGeometry args={[80, 1.1, 0.5]} />
        <meshBasicMaterial color={clampLuma("#C9D2E4", 0.3)} fog={false} />
      </mesh>
      {/* catch fence — fine diagonal mesh on the outside */}
      <mesh position={[0, 4, -22]}>
        <planeGeometry args={[100, 8, 40, 4]} />
        <meshBasicMaterial
          color={clampLuma("#7D89AD", 0.2)}
          transparent
          opacity={0.2}
          wireframe
          side={THREE.DoubleSide}
          fog={false}
        />
      </mesh>
      {/* start/finish gantry overhead */}
      <group position={[0, 0, 0]}>
        {[-16, 16].map((x) => (
          <mesh key={x} position={[x, 5, 0]}>
            <boxGeometry args={[0.7, 10, 0.7]} />
            <meshBasicMaterial color={clampLuma("#161B36")} fog={false} />
          </mesh>
        ))}
        <mesh position={[0, 10.3, 0]}>
          <boxGeometry args={[33, 1.6, 1.2]} />
          <meshBasicMaterial color={clampLuma("#101528")} fog={false} />
        </mesh>
        <lineSegments position={[0, 10.3, 0]}>
          <edgesGeometry args={[new THREE.BoxGeometry(33, 1.6, 1.2)]} />
          <lineBasicMaterial color={clampLuma(ARES_COLORS.electricTeal, 0.3)} />
        </lineSegments>
      </group>
      {/* track banking curving away, and the enormous outside grandstand */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.4, 0]}>
        <ringGeometry args={[26, 34, 64]} />
        <meshBasicMaterial color={clampLuma("#1B2032")} side={THREE.DoubleSide} fog={false} />
      </mesh>
      <Bowl innerR={36} rise={22} depth={26} color="#141830" />
      <CrowdBand r={37} y={1.2} height={20} count={1800} />
      <FloodMast position={[0, 0, 34]} height={20} />
    </group>
  );
}
