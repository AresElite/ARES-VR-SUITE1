import { useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Text } from "@react-three/drei";

/**
 * Rounded-rectangle geometry — the A.R.E.S. Performance Suite card language
 * (rounded-xl cards, rounded-full pill buttons) carried into 3D.
 */
function roundedRectShape(w: number, h: number, r: number): THREE.ShapeGeometry {
  const radius = Math.min(r, w / 2, h / 2);
  const x = -w / 2;
  const y = -h / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + w - radius, y);
  shape.absarc(x + w - radius, y + radius, radius, -Math.PI / 2, 0, false);
  shape.lineTo(x + w, y + h - radius);
  shape.absarc(x + w - radius, y + h - radius, radius, 0, Math.PI / 2, false);
  shape.lineTo(x + radius, y + h);
  shape.absarc(x + radius, y + h - radius, radius, Math.PI / 2, Math.PI, false);
  shape.lineTo(x, y + radius);
  shape.absarc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5, false);
  return new THREE.ShapeGeometry(shape, 6);
}

export function useRoundedRect(w: number, h: number, r: number): THREE.ShapeGeometry {
  return useMemo(() => roundedRectShape(w, h, r), [w, h, r]);
}
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { FONT_MONO, FONT_POPPINS_SEMIBOLD } from "@/utils/fonts";
import { sfx } from "@/utils/audio";

/**
 * SpatialPanel — the core Ares spatial UI surface.
 * Brand rules applied: Panel (#1A1E3D) surfaces on Deep Navy, Poppins for
 * words, JetBrains Mono for labels/tags, Electric Teal as the only action
 * color. Two planes + troika text — cheap on Quest 2.
 */

export function SpatialPanel({
  position,
  rotation = [0, 0, 0],
  width = 1.2,
  height = 0.8,
  title,
  accent = ARES_COLORS.electricTeal,
  children,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  width?: number;
  height?: number;
  title?: string;
  accent?: string;
  children?: ReactNode;
}) {
  const g = useRef<THREE.Group>(null);
  const phase = position[0] * 3.7 + position[2];
  useFrame(({ clock }) => {
    if (g.current) g.current.position.y = position[1] + Math.sin(clock.elapsedTime * 0.7 + phase) * 0.008;
  });
  const bracket = 0.09;
  return (
    <group ref={g} position={position} rotation={rotation}>
      {/* corner brackets — precision-instrument framing */}
      {(
        [
          [-1, 1], [1, 1], [-1, -1], [1, -1],
        ] as const
      ).map(([sx, sy], k) => (
        <group key={k} position={[(sx * (width - 0.05)) / 2, (sy * (height - 0.05)) / 2, 0.002]}>
          <mesh position={[(-sx * bracket) / 2, 0, 0]}>
            <planeGeometry args={[bracket, 0.008]} />
            <meshBasicMaterial color={accent} transparent opacity={0.8} />
          </mesh>
          <mesh position={[0, (-sy * bracket) / 2, 0]}>
            <planeGeometry args={[0.008, bracket]} />
            <meshBasicMaterial color={accent} transparent opacity={0.8} />
          </mesh>
        </group>
      ))}
      {/* backdrop — rounded card (suite: rounded-xl/2xl) */}
      <mesh position={[0, 0, -0.01]} geometry={useRoundedRect(width, height, 0.075)}>
        <meshBasicMaterial color={ARES_COLORS.panel} transparent opacity={0.94} />
      </mesh>
      {/* accent frame line */}
      <mesh position={[0, height / 2 - 0.016, 0]}>
        <planeGeometry args={[width - 0.16, 0.012]} />
        <meshBasicMaterial color={accent} />
      </mesh>
      {title && (
        <Text
          position={[-width / 2 + 0.06, height / 2 - 0.075, 0.002]}
          fontSize={0.05}
          color={ARES_ACCENTS.purpleLight}
          anchorX="left"
          anchorY="middle"
          letterSpacing={0.14}
          font={FONT_MONO}
        >
          {title.toUpperCase()}
        </Text>
      )}
      {children}
    </group>
  );
}

export function PanelText({
  position,
  text,
  size = 0.045,
  color = ARES_COLORS.softGray,
  maxWidth = 1.05,
  align = "left",
  anchorX = "left",
  mono = false,
}: {
  position: [number, number, number];
  text: string;
  size?: number;
  color?: string;
  maxWidth?: number;
  align?: "left" | "center" | "right";
  anchorX?: "left" | "center" | "right";
  mono?: boolean;
}) {
  return (
    <Text
      position={position}
      fontSize={size}
      color={color}
      anchorX={anchorX}
      anchorY="middle"
      maxWidth={maxWidth}
      textAlign={align}
      lineHeight={1.35}
      font={mono ? FONT_MONO : undefined}
    >
      {text}
    </Text>
  );
}

export function PanelButton({
  position,
  label,
  onClick,
  width = 0.52,
  height = 0.11,
  color = ARES_COLORS.deepPurple,
  textColor = ARES_COLORS.white,
  accent = ARES_COLORS.electricTeal,
  disabled = false,
  fontSize = 0.042,
}: {
  position: [number, number, number];
  label: string;
  onClick: () => void;
  width?: number;
  height?: number;
  color?: string;
  textColor?: string;
  accent?: string;
  disabled?: boolean;
  fontSize?: number;
}) {
  const [hover, setHover] = useState(false);
  const pill = useRoundedRect(width, height, height / 2);
  return (
    <group position={position}>
      <mesh
        geometry={pill}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) {
            sfx.uiClick();
            onClick();
          }
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (!disabled) setHover(true);
        }}
        onPointerOut={() => setHover(false)}
        scale={hover ? 1.04 : 1}
      >
        <meshBasicMaterial
          color={disabled ? ARES_COLORS.graphite : hover ? accent : color}
          transparent
          opacity={disabled ? 0.4 : 0.96}
        />
      </mesh>
      <Text
        position={[0, 0, 0.004]}
        fontSize={fontSize}
        color={disabled ? ARES_ACCENTS.dim : hover ? ARES_COLORS.nearBlack : textColor}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.04}
        maxWidth={width * 0.95}
        textAlign="center"
        font={FONT_POPPINS_SEMIBOLD}
      >
        {label}
      </Text>
    </group>
  );
}
