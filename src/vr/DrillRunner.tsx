import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { useXR, useXRInputSourceEvent, useXRInputSourceState } from "@react-three/xr";
import * as THREE from "three";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { PHASE_META } from "@/ares/phases";
import { HUD_REFRESH_HZ } from "@/ares/constants";
import type { Hand, SliceDirection } from "@/ares/drillTypes";
import { useAppStore } from "@/app/providers/appStore";
import { handFromPointerEvent, sliceDirectionFromDelta } from "@/drills/shared/InputMapper";
import type { PoolSlot } from "@/drills/shared/TargetSpawner";
import { PERF_MODES } from "@/utils/performance";
import { sfx } from "@/utils/audio";
import { FONT_MONO } from "@/utils/fonts";

/**
 * DrillRunner — the live drill runtime.
 *
 * INTERACTION MODEL (eye-hand coordination first):
 * In VR the athlete physically REACHES OUT AND STRIKES targets with their
 * hands or controllers — no laser pointers. Each hand carries a glowing
 * strike orb; contact between the orb and a target registers the hit, the
 * striking hand, and the strike direction (from hand velocity). Controllers
 * fire a haptic pulse on contact. The desktop fallback uses mouse clicks.
 *
 * Performance contract:
 *  - Engine advances on the XR frame clock (useFrame), never React state.
 *  - Target meshes are pooled; spawn/despawn only re-renders visibility.
 *  - Collision checks are plain distance math on pooled slots — no physics.
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

const STRIKE_ORB_RADIUS = 0.045;
const HIT_PADDING = 0.075; // generous contact window around the target surface
const DIRECTION_MIN_SPEED = 0.6; // m/s of hand motion needed to read a slice direction

interface HandTracker {
  hand: Hand;
  object: THREE.Object3D | null;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  hasPrev: boolean;
  pulse: (() => void) | null;
  /** target ids currently in contact — hits register on entry only */
  touching: Set<string>;
}

/**
 * StrikeColliders — tracks both hands (controller or tracked hand), renders
 * their strike orbs, and performs per-frame contact tests against live
 * targets. This is the whole "no laser pointers" system.
 */
function StrikeColliders() {
  const engine = useAppStore((s) => s.engine);
  const leftCtl = useXRInputSourceState("controller", "left");
  const rightCtl = useXRInputSourceState("controller", "right");
  const leftHand = useXRInputSourceState("hand", "left");
  const rightHand = useXRInputSourceState("hand", "right");
  const orbL = useRef<THREE.Mesh>(null);
  const orbR = useRef<THREE.Mesh>(null);

  const trackers = useMemo<HandTracker[]>(
    () => [
      { hand: "left", object: null, pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), hasPrev: false, pulse: null, touching: new Set() },
      { hand: "right", object: null, pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), hasPrev: false, pulse: null, touching: new Set() },
    ],
    [],
  );

  useFrame((_, dt) => {
    if (!engine) return;
    // Resolve current input objects (controller grip preferred, else hand)
    trackers[0].object = leftCtl?.object ?? leftHand?.object ?? null;
    trackers[1].object = rightCtl?.object ?? rightHand?.object ?? null;
    trackers[0].pulse = leftCtl
      ? () => leftCtl.inputSource.gamepad?.hapticActuators?.[0]?.pulse?.(0.7, 40)
      : null;
    trackers[1].pulse = rightCtl
      ? () => rightCtl.inputSource.gamepad?.hapticActuators?.[0]?.pulse?.(0.7, 40)
      : null;

    for (let i = 0; i < 2; i++) {
      const t = trackers[i];
      const orb = i === 0 ? orbL.current : orbR.current;
      if (!t.object) {
        if (orb) orb.visible = false;
        t.hasPrev = false;
        continue;
      }
      t.object.getWorldPosition(t.pos);
      if (orb) {
        orb.visible = true;
        orb.position.copy(t.pos);
      }
      if (t.hasPrev && dt > 0) {
        t.vel.copy(t.pos).sub(t.prev).divideScalar(dt);
      }
      t.prev.copy(t.pos);
      t.hasPrev = true;

      // Contact test against live targets (edge-triggered: entry only)
      const stillTouching = new Set<string>();
      for (const slot of engine.pool.slots) {
        if (!slot.active || !slot.spec || slot.spec.decor || slot.spec.meta?.decor) continue;
        const dx = slot.pos[0] - t.pos.x;
        const dy = slot.pos[1] - t.pos.y;
        const dz = slot.pos[2] - t.pos.z;
        const reach = slot.spec.scale + STRIKE_ORB_RADIUS + HIT_PADDING;
        if (dx * dx + dy * dy + dz * dz <= reach * reach) {
          stillTouching.add(slot.spec.id);
          const age = engine.timing.now - slot.spawnClock;
          if (!t.touching.has(slot.spec.id) && age < 140) {
            // spawn grace: resting hands don't auto-strike a target that
            // appears around them — require a deliberate exit + re-entry
            continue;
          }
          if (!t.touching.has(slot.spec.id)) {
            let direction: SliceDirection | undefined;
            if (slot.spec.requiredDirection) {
              const speed = Math.hypot(t.vel.x, t.vel.y);
              direction =
                speed >= DIRECTION_MIN_SPEED
                  ? sliceDirectionFromDelta(t.vel.x, t.vel.y)
                  : slot.spec.requiredDirection;
            }
            engine.registerHit(slot.spec.id, t.hand, direction);
            t.pulse?.();
          }
        }
      }
      t.touching = stillTouching;
    }
  });

  return (
    <>
      <mesh ref={orbL} visible={false}>
        <sphereGeometry args={[STRIKE_ORB_RADIUS, 12, 12]} />
        <meshStandardMaterial
          color={ARES_ACCENTS.purpleGlow}
          emissive={ARES_ACCENTS.purpleGlow}
          emissiveIntensity={0.9}
          transparent
          opacity={0.85}
        />
      </mesh>
      <mesh ref={orbR} visible={false}>
        <sphereGeometry args={[STRIKE_ORB_RADIUS, 12, 12]} />
        <meshStandardMaterial
          color={ARES_COLORS.warningGold}
          emissive={ARES_COLORS.warningGold}
          emissiveIntensity={0.9}
          transparent
          opacity={0.85}
        />
      </mesh>
    </>
  );
}

const URGENCY_COLORS = ["#8B5CF6", "#7FD3DE", "#3B82F6", "#F97316", "#EF5A6F"];

/** Pooled hit-spark particles — one draw call, zero allocation per hit. */
const SPARK_COUNT = 220;
class SparkPool {
  positions = new Float32Array(SPARK_COUNT * 3);
  colors = new Float32Array(SPARK_COUNT * 3);
  vel = new Float32Array(SPARK_COUNT * 3);
  life = new Float32Array(SPARK_COUNT);
  cursor = 0;
  constructor() {
    this.positions.fill(9999);
  }
  burst(x: number, y: number, z: number, color: THREE.Color, n = 14) {
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % SPARK_COUNT;
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.3) * Math.PI;
      const sp = 0.7 + Math.random() * 1.3;
      this.vel[i * 3] = Math.cos(a) * Math.cos(b) * sp;
      this.vel[i * 3 + 1] = Math.sin(b) * sp;
      this.vel[i * 3 + 2] = Math.sin(a) * Math.cos(b) * sp * 0.4;
      this.colors[i * 3] = color.r;
      this.colors[i * 3 + 1] = color.g;
      this.colors[i * 3 + 2] = color.b;
      this.life[i] = 0.5 + Math.random() * 0.25;
    }
  }
  step(dt: number) {
    for (let i = 0; i < SPARK_COUNT; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.positions[i * 3] = 9999;
        continue;
      }
      this.positions[i * 3] += this.vel[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt - 1.4 * dt * dt;
      this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= 2.6 * dt;
    }
  }
}

function HitSparks({ pool }: { pool: SparkPool }) {
  const geo = useRef<THREE.BufferGeometry>(null);
  useFrame((_, dt) => {
    pool.step(dt);
    if (geo.current) {
      geo.current.attributes.position.needsUpdate = true;
      geo.current.attributes.color.needsUpdate = true;
    }
  });
  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geo}>
        <bufferAttribute attach="attributes-position" args={[pool.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[pool.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.02} vertexColors transparent opacity={0.95} sizeAttenuation depthWrite={false} />
    </points>
  );
}

function TargetMesh({
  slot,
  segments,
  version,
  desktopClicks,
}: {
  slot: PoolSlot;
  segments: number;
  version: number;
  desktopClicks: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const engine = useAppStore((s) => s.engine);
  const spec = slot.spec;

  useFrame(() => {
    if (!group.current || !slot.active) return;
    group.current.position.set(slot.pos[0], slot.pos[1], slot.pos[2]);
    if (!spec || !engine) return;
    const age = engine.timing.now - slot.spawnClock;
    // Focus-Frenzy urgency ramp: purple -> teal -> blue -> orange -> red
    if (spec.meta?.urgency && mat.current) {
      const frac = Math.min(0.999, age / spec.duration);
      const c = URGENCY_COLORS[Math.floor(frac * URGENCY_COLORS.length)];
      mat.current.color.set(c);
      mat.current.emissive.set(c);
    }
    // generic timed color phases (MOT highlight -> track -> answer, etc.)
    const phases = spec.meta?.paintPhases as { t: number; c: string }[] | undefined;
    if (phases && mat.current) {
      let c = spec.color;
      for (const ph of phases) if (age >= ph.t) c = ph.c;
      mat.current.color.set(c);
      mat.current.emissive.set(c);
    }
    // full-cycle blackout (Neural Phase Lock internal-clock phases)
    if (spec.meta?.blackout && mat.current) {
      mat.current.transparent = true;
      mat.current.opacity = 0.03;
    }
    // repaint after an engine kind-switch (Stop-Signal ring, colliders)
    if (!phases && spec.switchColor && spec.switchKindAt !== undefined && mat.current) {
      mat.current.color.set(spec.color);
      mat.current.emissive.set(spec.emissive ?? spec.color);
    }
    // Occlusion: target vanishes mid-flight but keeps moving
    const hideAfter = spec.meta?.hideAfterMs as number | undefined;
    if (hideAfter !== undefined && mat.current) {
      mat.current.opacity = age >= hideAfter ? 0.0 : 1.0;
      mat.current.transparent = true;
    }
    // Neural Phase Lock: expanding/contracting pulse
    const pulseMs = spec.meta?.pulsePeriodMs as number | undefined;
    if (pulseMs && group.current) {
      const ph = (age % pulseMs) / pulseMs;
      const sc = 0.4 + 1.2 * (ph < 0.5 ? ph * 2 : (1 - ph) * 2);
      group.current.scale.setScalar(sc);
    }
  });

  if (!slot.active || !spec) return null;
  const isDecor = Boolean(spec.decor || spec.meta?.decor);

  const onHit = desktopClicks && !isDecor
    ? (e: { stopPropagation(): void; nativeEvent?: unknown }) => {
        e.stopPropagation();
        const hand = handFromPointerEvent(e);
        let direction: SliceDirection | undefined;
        if (spec.requiredDirection) {
          const ne = e.nativeEvent as { movementX?: number; movementY?: number } | undefined;
          const mx = ne?.movementX ?? 0;
          const my = ne?.movementY ?? 0;
          direction =
            Math.abs(mx) + Math.abs(my) > 4 ? sliceDirectionFromDelta(mx, -my) : spec.requiredDirection;
        }
        engine?.registerHit(spec.id, hand, direction);
      }
    : undefined;

  const pointDir = (spec.meta?.pointDir as SliceDirection | undefined) ?? spec.requiredDirection;
  const rotZ = pointDir ? DIR_ANGLE[pointDir] - Math.PI / 2 : 0;

  return (
    <group ref={group} position={spec.position} key={version}>
      <mesh onClick={onHit} rotation={[0, 0, rotZ]}>
        {spec.shape === "sphere" && <sphereGeometry args={[spec.scale, segments, segments]} />}
        {spec.shape === "box" && <boxGeometry args={[spec.scale * 1.6, spec.scale * 1.6, spec.scale * 1.6]} />}
        {spec.shape === "diamond" && <octahedronGeometry args={[spec.scale, 0]} />}
        {spec.shape === "ring" && <torusGeometry args={[spec.scale, spec.scale * 0.32, 6, 20]} />}
        {spec.shape === "cone" && <coneGeometry args={[spec.scale * 0.8, spec.scale * 2.2, 8]} />}
        {spec.shape === "arc" && <torusGeometry args={[spec.scale, spec.scale * 0.28, 6, 24, Math.PI * 1.7]} />}
        {spec.shape === "pad" && <boxGeometry args={[spec.scale * 2.4, spec.scale * 1.6, spec.scale * 0.4]} />}
        <meshStandardMaterial
          ref={mat}
          color={spec.color}
          emissive={spec.emissive ?? spec.color}
          emissiveIntensity={spec.emissive ? 0.65 : 0.2}
          flatShading
          transparent={isDecor}
          opacity={isDecor ? 0.8 : 1}
        />
      </mesh>
      {spec.label && (
        <Text
          position={spec.shape === "pad" ? [0, 0, spec.scale * 0.3 + 0.004] : [0, spec.scale + 0.075, 0]}
          fontSize={spec.shape === "pad" ? Math.min(0.05, spec.scale * 0.75) : 0.036}
          color={spec.shape === "pad" ? ARES_COLORS.white : ARES_COLORS.softGray}
          anchorX="center"
          anchorY="middle"
          font={FONT_MONO}
        >
          {spec.label.toUpperCase()}
        </Text>
      )}
    </group>
  );
}

/**
 * TriggerListener — index-trigger response mode (Raw-Reaction, Choice-RT).
 * The athlete clicks the top trigger the instant the ball launches; the
 * engine routes the press to the live stimulus and applies hand rules
 * (purple = RIGHT trigger, teal = LEFT trigger).
 */
function TriggerListener() {
  const engine = useAppStore((s) => s.engine);
  useXRInputSourceEvent(
    "all",
    "selectstart",
    (e) => {
      const h = e.inputSource.handedness;
      engine?.registerTriggerResponse(h === "left" || h === "right" ? h : "unknown");
    },
    [engine],
  );
  return null;
}

/** Central ball launcher — the "hole" stimuli are shot out of. */
function LauncherProp() {
  const glow = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (glow.current) {
      (glow.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(clock.elapsedTime * 2.2) * 0.12;
    }
  });
  return (
    <group position={[0, 1.45, -6]} rotation={[Math.PI / 2, 0, 0]}>
      {/* housing */}
      <mesh>
        <cylinderGeometry args={[0.3, 0.34, 0.25, 20]} />
        <meshStandardMaterial color="#111428" emissive="#2D234F" emissiveIntensity={0.4} flatShading />
      </mesh>
      {/* muzzle ring */}
      <mesh position={[0, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.17, 0.025, 8, 24]} />
        <meshStandardMaterial color="#2998AA" emissive="#2998AA" emissiveIntensity={0.8} />
      </mesh>
      {/* dark hole */}
      <mesh position={[0, 0, 0.13]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.15, 20]} />
        <meshBasicMaterial color="#020308" />
      </mesh>
      <mesh ref={glow} position={[0, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.16, 0.24, 24]} />
        <meshBasicMaterial color="#7FD3DE" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Central fixation marker for Acquire-phase drills (visual anchor). */
function FixationMarker() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.z = clock.elapsedTime * 0.8;
  });
  return (
    <mesh ref={ref} position={[0, 1.5, -1.2]}>
      <ringGeometry args={[0.024, 0.036, 4]} />
      <meshBasicMaterial color={ARES_COLORS.white} />
    </mesh>
  );
}

export function DrillRunner() {
  const engine = useAppStore((s) => s.engine);
  const perf = PERF_MODES[useAppStore((s) => s.perfModeId)];
  const inSession = useXR((s) => s.session);
  const [poolVersion, setPoolVersion] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const sparks = useMemo(() => new SparkPool(), []);
  const lastStreakMilestone = useRef(0);
  const hudAccum = useRef(0);
  const phaseColor = engine ? PHASE_META[engine.definition.phase].color : ARES_COLORS.electricTeal;
  const pulseRef = useRef<THREE.MeshBasicMaterial>(null);
  const pulseIntensity = useRef(0);

  useEffect(() => {
    if (!engine) return;
    const unsub = engine.subscribe((e) => {
      if (e.type === "spawn" || e.type === "despawn" || e.type === "switched") setPoolVersion((v) => v + 1);
      if (e.type === "spawn") pulseIntensity.current = 1;
      if (e.type === "resolved") {
        const ev = e.event;
        const pan = ev.targetPosition ? Math.max(-0.8, Math.min(0.8, ev.targetPosition.x * 1.4)) : 0;
        if (ev.errorType === "correctRejection") {
          sfx.noGoHold();
        } else if (ev.correct) {
          const snap = engine.getSnapshot();
          sfx.hit(snap.streak, pan);
          if (snap.streak > 0 && snap.streak % 5 === 0 && snap.streak !== lastStreakMilestone.current) {
            lastStreakMilestone.current = snap.streak;
            sfx.streakMilestone();
          }
          if (ev.targetPosition) sparks.burst(ev.targetPosition.x, ev.targetPosition.y, ev.targetPosition.z, new THREE.Color("#7FD3DE"));
        } else {
          sfx.error(pan);
          if (ev.targetPosition) sparks.burst(ev.targetPosition.x, ev.targetPosition.y, ev.targetPosition.z, new THREE.Color("#EF5A6F"), 8);
        }
      }
      if (e.type === "stateChange") {
        if (e.state === "running") sfx.go();
        if (e.state === "complete") sfx.complete();
        if (e.state === "complete" || e.state === "aborted") {
          setTimeout(() => useAppStore.getState().finishDrill(), 350);
        }
      }
    });
    return unsub;
  }, [engine]);

  useFrame((_, delta) => {
    if (!engine) return;
    engine.update(delta * 1000);

    const st = engine.getState();
    if (st === "countdown") {
      const c = Math.ceil(engine.countdownRemaining / 1000);
      setCountdown((prev) => {
        if (prev !== c) sfx.countdown();
        return prev === c ? prev : c;
      });
    } else if (countdown !== null) {
      setCountdown(null);
    }

    pulseIntensity.current = Math.max(0, pulseIntensity.current - delta * 2.2);
    if (pulseRef.current) pulseRef.current.opacity = 0.15 + pulseIntensity.current * 0.4;

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
      {/* Neural Arena — phase stress ring behind the strike field */}
      <mesh position={[0, 1.5, -4.5]}>
        <ringGeometry args={[2.4, 2.55, 40]} />
        <meshBasicMaterial ref={pulseRef} color={phaseColor} transparent opacity={0.2} />
      </mesh>

      {isAcquireStyle && <FixationMarker />}

      <HitSparks pool={sparks} />

      {/* strike interaction (VR): hands/controllers hit targets directly */}
      {inSession && engine.definition.responseMode !== "trigger" && <StrikeColliders />}
      {inSession && engine.definition.responseMode === "trigger" && <TriggerListener />}
      {engine.definition.launcher && <LauncherProp />}

      {/* desktop-only catcher: false starts, or trigger response in trigger mode */}
      {!inSession && (
        <mesh
          onPointerDown={(e) => {
            if (engine.definition.responseMode === "trigger") {
              engine.registerTriggerResponse(handFromPointerEvent(e));
            } else {
              engine.registerBackgroundPress(handFromPointerEvent(e));
            }
          }}
        >
          <sphereGeometry args={[9, 12, 12]} />
          <meshBasicMaterial side={THREE.BackSide} transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {/* pooled targets — clickable only in desktop fallback */}
      {engine.pool.slots.map((slot) => (
        <TargetMesh
          key={slot.slotIndex}
          slot={slot}
          segments={perf.sphereSegments}
          version={poolVersion}
          desktopClicks={!inSession}
        />
      ))}

      {/* countdown + control reminder */}
      {countdown !== null && countdown > 0 && (
        <group>
          <Text position={[0, 1.72, -2.4]} fontSize={0.5} color={phaseColor} anchorX="center" anchorY="middle">
            {String(countdown)}
          </Text>
          <Text
            position={[0, 1.28, -2.4]}
            fontSize={0.065}
            color={ARES_COLORS.white}
            anchorX="center"
            anchorY="middle"
            maxWidth={2.4}
            textAlign="center"
          >
            {engine.definition.controlsHint}
          </Text>
        </group>
      )}
    </group>
  );
}
