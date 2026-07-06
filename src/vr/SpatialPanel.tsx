import { useState, type ReactNode } from "react";
import { Text } from "@react-three/drei";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";

/**
 * SpatialPanel — the core Ares spatial UI surface.
 * Large, readable, world-locked panels 1.5–2.5m from the athlete.
 * Deliberately flat-shaded and cheap: two planes and troika text.
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
  return (
    <group position={position} rotation={rotation}>
      {/* backdrop */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={ARES_COLORS.graphite} transparent opacity={0.92} />
      </mesh>
      {/* accent frame line */}
      <mesh position={[0, height / 2 - 0.012, 0]}>
        <planeGeometry args={[width, 0.012]} />
        <meshBasicMaterial color={accent} />
      </mesh>
      {title && (
        <Text
          position={[-width / 2 + 0.06, height / 2 - 0.075, 0.002]}
          fontSize={0.062}
          color={ARES_COLORS.white}
          anchorX="left"
          anchorY="middle"
          letterSpacing={0.08}
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
}: {
  position: [number, number, number];
  text: string;
  size?: number;
  color?: string;
  maxWidth?: number;
  align?: "left" | "center" | "right";
  anchorX?: "left" | "center" | "right";
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
  accent = ARES_ACCENTS.tealBright,
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
  return (
    <group position={position}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (!disabled) setHover(true);
        }}
        onPointerOut={() => setHover(false)}
        scale={hover ? 1.04 : 1}
      >
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          color={disabled ? ARES_COLORS.graphite : hover ? accent : color}
          transparent
          opacity={disabled ? 0.4 : 0.95}
        />
      </mesh>
      <Text
        position={[0, 0, 0.004]}
        fontSize={fontSize}
        color={disabled ? ARES_COLORS.softGray : hover ? ARES_COLORS.nearBlack : textColor}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.04}
        maxWidth={width * 0.95}
        textAlign="center"
      >
        {label}
      </Text>
    </group>
  );
}
