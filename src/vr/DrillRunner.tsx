import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RoundedBox, Text } from "@react-three/drei";
import { useXR, useXRInputSourceEvent, useXRInputSourceState } from "@react-three/xr";
import * as THREE from "three";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { PHASE_META } from "@/ares/phases";
import { HUD_REFRESH_HZ } from "@/ares/constants";
import type { Hand, SliceDirection, TrialSpec } from "@/ares/drillTypes";
import { useAppStore } from "@/app/providers/appStore";
import { STRIKE_TOLERANCE_M } from "@/drills/shared/DrillEngine";
import { handFromPointerEvent, sliceDirectionFromDelta } from "@/drills/shared/InputMapper";
import type { PoolSlot } from "@/drills/shared/TargetSpawner";
import { PERF_MODES } from "@/utils/performance";
import { makeGratingTexture, makeLandoltTexture, makeMottleTexture, makePlateTexture, makeRDSTexture } from "@/utils/platePainter";
import { sfx } from "@/utils/audio";
import { rhythmMusic } from "@/perform/rhythmMusic";
import { headMotion } from "./headMotion";
import { STROBE_LEVELS } from "@/ares/constants";
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

/** clean flat DEM arrow: shaft + head, unit-sized, faces the athlete */
const ARROW_SHAPE = (() => {
  const sh = new THREE.Shape();
  sh.moveTo(-0.55, -0.16);
  sh.lineTo(0.05, -0.16);
  sh.lineTo(0.05, -0.38);
  sh.lineTo(0.62, 0);
  sh.lineTo(0.05, 0.38);
  sh.lineTo(0.05, 0.16);
  sh.lineTo(-0.55, 0.16);
  sh.closePath();
  return sh;
})();

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

const STRIKE_ORB_RADIUS = 0.037; // trimmed per athlete feedback
const HIT_PADDING = 0.042; // tightened: oversized hitboxes caused phantom errors
const DIRECTION_MIN_SPEED = 0.6; // m/s of hand motion needed to read a slice direction

/**
 * A wrong-hand error requires INTENT. These thresholds separate a strike from a
 * hand simply passing through the space on its way somewhere else.
 */
const WRONG_HAND_MIN_SPEED = 0.45; // m/s — below this it is travel, not a strike
const WRONG_HAND_MIN_DOT = 0.35;   // must be moving INTO the target, not across it

/** Squared distance from a point to the segment a->b (the swept hand path). */
function segPointDist2(a: THREE.Vector3, b: THREE.Vector3, p: readonly number[]): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p[0] - a.x, apy = p[1] - a.y, apz = p[2] - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  const t = len2 > 1e-9
    ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / len2))
    : 0;
  const cx = a.x + abx * t, cy = a.y + aby * t, cz = a.z + abz * t;
  return (p[0] - cx) ** 2 + (p[1] - cy) ** 2 + (p[2] - cz) ** 2;
}

interface HandTracker {
  hand: Hand;
  object: THREE.Object3D | null;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  /** where the hand was at the START of this frame — the swept segment's origin */
  prevSwept: THREE.Vector3;
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
  // hand identity ONLY where the drill uses hand rules; neutral elsewhere
  const handColored = Boolean(engine?.definition.handIdentity || engine?.definition.rhythm);
  const orbL = useRef<THREE.Mesh>(null);
  const orbR = useRef<THREE.Mesh>(null);

  const trackers = useMemo<HandTracker[]>(
    () => [
      { hand: "left", object: null, pos: new THREE.Vector3(), prev: new THREE.Vector3(), prevSwept: new THREE.Vector3(), vel: new THREE.Vector3(), hasPrev: false, pulse: null, touching: new Set() },
      { hand: "right", object: null, pos: new THREE.Vector3(), prev: new THREE.Vector3(), prevSwept: new THREE.Vector3(), vel: new THREE.Vector3(), hasPrev: false, pulse: null, touching: new Set() },
    ],
    [],
  );

  const candidates = useMemo<{ slot: PoolSlot; tracker: HandTracker; d2: number }[]>(() => [], []);

  useFrame((_, dt) => {
    if (!engine) return;
    candidates.length = 0;
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
      // the swept segment is LAST frame's position -> this frame's position, so it
      // must be captured before prev is advanced
      t.prevSwept.copy(t.prev);
      t.prev.copy(t.pos);
      t.hasPrev = true;

      // Contact test against live targets (edge-triggered: entry only)
      const stillTouching = new Set<string>();
      for (const slot of engine.pool.slots) {
        if (!slot.active || !slot.spec || slot.spec.decor || slot.spec.meta?.decor) continue;

        /**
         * SWEPT CONTACT — test the segment the hand travelled this frame, not the
         * point where it happened to land.
         *
         * At 72-90 fps a hand moving 3 m/s covers 3-4 cm between frames. Against a
         * 2.6 cm target that means the hand can pass clean THROUGH it and never be
         * inside it on any sampled frame. The athlete sees a dead-centre strike and
         * the engine sees nothing — which is exactly the Focus-Frenzy report: the
         * ball is hit, isn't counted, and rides its colour ramp to red.
         *
         * Testing prev->current as a segment makes a fast, accurate strike register
         * MORE reliably than a slow one, which is the correct incentive.
         */
        const reach = slot.spec.scale + STRIKE_ORB_RADIUS + HIT_PADDING + ((slot.spec.meta?.hitBoost as number) ?? 0);
        const d2 = t.hasPrev
          ? segPointDist2(t.prevSwept, t.pos, slot.pos)
          : (slot.pos[0] - t.pos.x) ** 2 + (slot.pos[1] - t.pos.y) ** 2 + (slot.pos[2] - t.pos.z) ** 2;
        if (d2 > reach * reach) continue;

        stillTouching.add(slot.spec.id);
        const age = engine.timing.now - slot.spawnClock;
        if (!t.touching.has(slot.spec.id) && age < 140) {
          // spawn grace: resting hands don't auto-strike a target that
          // appears around them — require a deliberate exit + re-entry
          continue;
        }
        if (t.touching.has(slot.spec.id)) continue;

        /**
         * DELIBERATE-STRIKE GATE FOR THE WRONG HAND.
         *
         * The correct hand may take a target with any touch — we never want to make
         * a legitimate strike harder to land. But the WRONG hand only commits an
         * error if it STRIKES: moving with intent, INTO the target.
         *
         * An accidental graze is not a decision. When the left hand sweeps past a
         * purple orb on its way to a teal one, that is travel, not a choice, and
         * scoring it as a wrong-hand error measures the target layout rather than
         * the athlete. This is the whole reason cross-hand false errors were
         * appearing: a hand in transit was being read as a hand committing.
         */
        const req = slot.spec.requiredHand;
        if (req && req !== "either" && req !== "both" && req !== t.hand) {
          const speed = t.vel.length();
          const tox = slot.pos[0] - t.pos.x, toy = slot.pos[1] - t.pos.y, toz = slot.pos[2] - t.pos.z;
          const m = Math.hypot(tox, toy, toz) || 1e-6;
          const into = speed > 1e-3
            ? (t.vel.x * tox + t.vel.y * toy + t.vel.z * toz) / (m * speed)
            : 0;
          if (speed < WRONG_HAND_MIN_SPEED || into < WRONG_HAND_MIN_DOT) continue;
        }

        candidates.push({ slot, tracker: t, d2 });
      }
      t.touching = stillTouching;
    }

    /**
     * CORRECT-HAND PREFERENCE.
     *
     * The tracker loop runs left-then-right, so when BOTH hands were inside a
     * purple (right-hand) target on the same frame, the LEFT hand registered a
     * wrong-hand error before the right hand was ever tested. The athlete struck
     * correctly and was marked wrong — purely because of array order.
     *
     * Contacts are now gathered first and resolved after: if the required hand is
     * among the hands touching a target, it wins. Ordering is not a rule.
     */
    candidates.sort((a, b) => {
      const ra = a.slot.spec!.requiredHand;
      const rb = b.slot.spec!.requiredHand;
      const aOk = !ra || ra === "either" || ra === "both" || ra === a.tracker.hand;
      const bOk = !rb || rb === "either" || rb === "both" || rb === b.tracker.hand;
      if (aOk !== bOk) return aOk ? -1 : 1;   // correct hand resolves first
      return a.d2 - b.d2;                      // then the closer contact
    });
    const taken = new Set<string>();
    for (const c of candidates) {
      const spec = c.slot.spec!;
      if (taken.has(spec.id)) continue;
      taken.add(spec.id);
      const t = c.tracker;
      let direction: SliceDirection | undefined;
      if (spec.requiredDirection) {
        const speed = Math.hypot(t.vel.x, t.vel.y);
        direction = speed >= DIRECTION_MIN_SPEED
          ? sliceDirectionFromDelta(t.vel.x, t.vel.y)
          : spec.requiredDirection;
      }
      engine.registerHit(spec.id, t.hand, direction, Math.sqrt(c.d2), spec.scale + STRIKE_TOLERANCE_M);
      t.pulse?.();
    }
  });

  return (
    <>
      <mesh ref={orbL} visible={false}>
        <sphereGeometry args={[STRIKE_ORB_RADIUS, 12, 12]} />
        <meshStandardMaterial
          color={handColored ? ARES_COLORS.electricTeal : "#C9D2EE"}
          emissive={handColored ? ARES_COLORS.electricTeal : "#8C96BE"}
          emissiveIntensity={0.9}
          transparent
          opacity={0.85}
        />
      </mesh>
      <mesh ref={orbR} visible={false}>
        <sphereGeometry args={[STRIKE_ORB_RADIUS, 12, 12]} />
        <meshStandardMaterial
          color={handColored ? ARES_ACCENTS.purpleGlow : "#C9D2EE"}
          emissive={handColored ? ARES_ACCENTS.purpleGlow : "#8C96BE"}
          emissiveIntensity={0.9}
          transparent
          opacity={0.85}
        />
      </mesh>
    </>
  );
}

const URGENCY_COLORS = ["#8B5CF6", "#7FD3DE", "#7FD3DE", "#007A8A", "#4C1D95"];

function onHitProxy(
  spec: TrialSpecLike,
  engine: ReturnType<typeof useAppStore.getState>["engine"],
  desktopClicks: boolean,
) {
  if (!desktopClicks) return undefined;
  return (e: { stopPropagation(): void }) => {
    e.stopPropagation();
    engine?.registerHit(spec.id, "unknown");
  };
}
type TrialSpecLike = { id: string };

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
  demCursor,
}: {
  slot: PoolSlot;
  segments: number;
  version: number;
  desktopClicks: boolean;
  demCursor?: { seq: number };
}) {
  const group = useRef<THREE.Group>(null);
  const labelRef = useRef<{ visible: boolean } | null>(null);
  const demRing = useRef<THREE.Mesh>(null);
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
    // DEM cursor highlight: the CURRENT arrow blazes gold, pulses, and is
    // ringed by a spinning halo — the rest of the board dims right down.
    if (demCursor && spec.groupMode === "ordered" && spec.meta?.dem && mat.current && group.current) {
      const expected = spec.groupId ? engine.expectedSeq(spec.groupId) : demCursor.seq;
      const isCurrent = (spec.seq ?? 0) === expected;
      if (isCurrent) {
        mat.current.emissive.set(ARES_COLORS.warningGold);
        mat.current.color.set(ARES_COLORS.warningGold);
        mat.current.emissiveIntensity = 1.6 + Math.sin(age * 0.012) * 0.5;
        group.current.scale.setScalar(1.55 + Math.sin(age * 0.012) * 0.1);
      } else {
        const done = (spec.seq ?? 0) < (spec.groupId ? engine.expectedSeq(spec.groupId) : demCursor.seq);
        mat.current.emissive.set(done ? "#1A6B78" : "#9FA8D6");
        mat.current.color.set(done ? "#1A6B78" : "#9FA8D6");
        mat.current.emissiveIntensity = done ? 0.55 : 0.4;
        group.current.scale.setScalar(1);
      }
      if (demRing.current) {
        demRing.current.visible = isCurrent;
        if (isCurrent) demRing.current.rotation.z = age * 0.003;
      }
    }
    // head-velocity gate (Gaze Stabilization): the optotype is a faint ghost
    // at rest and SHARPENS to full clarity only while the head rotates above
    // the level's speed threshold — that is the DVA/GST mechanic. It is always
    // at least dimly visible so the athlete can see where to look and knows to
    // move their head to read it.
    const hvMin = spec.meta?.hvMinDegS as number | undefined;
    if (hvMin !== undefined && mat.current) {
      const gated = headMotion.velDegS >= hvMin;
      mat.current.transparent = true;
      mat.current.opacity = gated ? 1 : 0.14;
      mat.current.emissiveIntensity = gated ? 0.9 : 0.15;
    }
    // delayed label reveal (Pursuit-Pulse: direction shows AT the pulse)
    const labelAfter = spec.meta?.labelAfterMs as number | undefined;
    if (labelAfter !== undefined && labelRef.current) {
      labelRef.current.visible = age >= labelAfter;
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

  // Ishihara-style plate: procedural pseudo-isochromatic dot disc
  if (spec.shape === "plate" && spec.plate) {
    return (
      <group ref={group} position={spec.position} key={version}>
        <mesh rotation={[0, 0, 0]}>
          <circleGeometry args={[spec.scale, 40]} />
          <meshBasicMaterial map={makePlateTexture(spec.plate.digit, spec.plate.axis, spec.plate.seed)} />
        </mesh>
        <mesh position={[0, 0, -0.005]}>
          <ringGeometry args={[spec.scale, spec.scale * 1.06, 40]} />
          <meshBasicMaterial color="#2D234F" />
        </mesh>
      </group>
    );
  }

  /**
   * LANDOLT C — the optotype, and NOTHING else.
   *
   * No backing panel. The surround is the VISIBILITY FIELD (below), a full luminance
   * dome the drill drives per trial, so the optotype is drawn at an absolute grey level
   * straight onto the world. Unlit, no emission, no tone mapping: what the athlete sees
   * is exactly the luminance we specified, against exactly the background we specified.
   *
   * The old version gave every target its own little mid-grey plate to sit on. It was
   * physically correct and it looked like a slide deck.
   */
  if (spec.shape === "landolt" && spec.landolt) {
    const lc = spec.landolt;
    const lum = spec.luminance?.target ?? 128;
    return (
      <group ref={group} position={spec.position} key={version}>
        <mesh onClick={onHitProxy(spec, engine, desktopClicks && !isDecor)}>
          <planeGeometry args={[spec.scale * 2.2, spec.scale * 2.2]} />
          <meshBasicMaterial
            map={makeLandoltTexture(lum, lc.gapDeg, lc.seed)}
            toneMapped={false}
            transparent
            depthWrite={false}
          />
        </mesh>
      </group>
    );
  }

  // Contrast grating disc (contrast sensitivity assessment)
  if (spec.shape === "grating" && spec.grating) {
    const gr = spec.grating;
    return (
      <group ref={group} position={spec.position} key={version}>
        <mesh onClick={onHitProxy(spec, engine, desktopClicks && !isDecor)}>
          <circleGeometry args={[spec.scale, 36]} />
          <meshBasicMaterial map={makeGratingTexture(gr.contrastPct, gr.cycles, gr.angleDeg, gr.seed)} />
        </mesh>
        <mesh position={[0, 0, -0.004]}>
          <ringGeometry args={[spec.scale, spec.scale * 1.05, 36]} />
          <meshBasicMaterial color="#2D234F" />
        </mesh>
      </group>
    );
  }

  // Dichoptic RDS disc. The disc itself stays PUT in both eyes; the disparity
  // is applied as a horizontal shift of the DOT FIELD via a texture UV offset.
  // Two reasons this beats moving the mesh:
  //   1. UV offsets are continuous, so sub-pixel disparity survives (with
  //      linear filtering the GPU interpolates) — moving a mesh by a fraction
  //      of a pixel against a hard-edged texture just aliases away, which hard-
  //      capped the old test at ~1 pixel (~144 arcsec on Quest 3).
  //   2. The disc outline is identical in both eyes, so there is no monocular
  //      edge cue — only the dot field carries the depth. This is the classic
  //      random-dot stereogram construction.
  if (spec.shape === "stereo") {
    const rds = makeRDSTexture((spec.meta?.rdsSeed as number) ?? 7);
    // disparity in UV units: metres of shift / disc width in metres
    const uv = (spec.stereoShiftM ?? 0) / (2 * spec.scale);
    return (
      <group ref={group} position={spec.position} key={version}>
        <mesh layers-mask={2}>
          <circleGeometry args={[spec.scale, 48]} />
          <StereoEyeMaterial tex={rds} offsetU={uv / 2} />
        </mesh>
        <mesh layers-mask={4}>
          <circleGeometry args={[spec.scale, 48]} />
          <StereoEyeMaterial tex={rds} offsetU={-uv / 2} />
        </mesh>
        {/* invisible strike/click proxy on the shared layer */}
        <mesh onClick={onHitProxy(spec, engine, desktopClicks)} visible={true}>
          <circleGeometry args={[spec.scale, 16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    );
  }

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
  // ARROW_SHAPE points +X (right) at rest; coneGeometry points +Y (up).
  // So the arrow needs NO offset, the cone needs -90deg. Getting this wrong
  // renders every arrow 90deg off from its requiredDirection.
  const rotZ = pointDir
    ? spec.shape === "arrow"
      ? DIR_ANGLE[pointDir]
      : DIR_ANGLE[pointDir] - Math.PI / 2
    : 0;

  if (spec.shape === "pad") {
    // Suite card language: pads are rounded (rounded-xl) tiles
    return (
      <group ref={group} position={spec.position} key={version}>
        <RoundedBox
          args={[spec.scale * 2.4, spec.scale * 1.6, spec.scale * 0.4]}
          radius={spec.scale * 0.35}
          smoothness={2}
          onClick={onHit}
        >
          <meshStandardMaterial
            ref={mat}
            color={spec.color}
            emissive={spec.emissive ?? spec.color}
            emissiveIntensity={spec.emissive ? 0.65 : 0.2}
            flatShading
          />
        </RoundedBox>
        {spec.label && (
          <Text
            position={[0, 0, spec.scale * 0.3 + 0.004]}
            fontSize={Math.min(0.05, spec.scale * 0.75)}
            color={ARES_COLORS.white}
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

  return (
    <group ref={group} position={spec.position} key={version}>
      <mesh onClick={onHit} rotation={[0, 0, rotZ]} scale={spec.shape === "arrow" ? spec.scale : 1}>
        {spec.shape === "arrow" && <shapeGeometry args={[ARROW_SHAPE]} />}
        {spec.shape === "sphere" && <sphereGeometry args={[spec.scale, segments, segments]} />}
        {spec.shape === "box" && <boxGeometry args={[spec.scale * 1.6, spec.scale * 1.6, spec.scale * 1.6]} />}
        {spec.shape === "diamond" && <octahedronGeometry args={[spec.scale, 0]} />}
        {spec.shape === "ring" && <torusGeometry args={[spec.scale, spec.scale * 0.32, 6, 20]} />}
        {spec.shape === "cone" && <coneGeometry args={[spec.scale * 0.8, spec.scale * 2.2, 8]} />}
        {spec.shape === "pyramid" && <coneGeometry args={[spec.scale * 1.15, spec.scale * 1.9, 4]} />}
        {spec.shape === "line" && <boxGeometry args={[0.012, spec.scale * 2, 0.012]} />}
        {spec.shape === "arc" && <torusGeometry args={[spec.scale, spec.scale * 0.28, 6, 24, Math.PI * 1.7]} />}
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
      {spec.meta?.dem !== undefined && (
        <mesh ref={demRing} visible={false} position={[0, 0, -0.006]}>
          <ringGeometry args={[spec.scale * 1.7, spec.scale * 2.05, 4]} />
          <meshBasicMaterial color={ARES_COLORS.warningGold} transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
      )}
      {spec.label && (
        <Text
          ref={labelRef as never}
          position={spec.meta?.labelInside ? [0, 0, 0.012] : [0, spec.scale + 0.075, 0]}
          fontSize={(spec.meta?.labelSize as number) ?? 0.036}
          color={(spec.meta?.labelColor as string) ?? ARES_COLORS.softGray}
          anchorX="center"
          anchorY="middle"
          font={FONT_MONO}
          visible={spec.meta?.labelAfterMs === undefined}
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

/**
 * JoystickListener — DEM (Arrows) response mode.
 * The dominant-hand thumbstick "flicks" up/down/left/right for each arrow
 * in sequence; a return to neutral is required between responses so held
 * sticks can never double-fire.
 */
function JoystickListener({ cursor }: { cursor: { seq: number } }) {
  const engine = useAppStore((s) => s.engine);
  const dominant = (engine?.parameters.dominantHand as string) === "left" ? "left" : "right";
  const ctl = useXRInputSourceState("controller", dominant as "left" | "right");
  const armed = useRef(true);

  useFrame(() => {
    if (!engine || !ctl) return;
    const gp = ctl.inputSource.gamepad;
    if (!gp || gp.axes.length < 4) return;
    // xr-standard mapping: thumbstick on axes[2], axes[3]
    const x = gp.axes[2] ?? 0;
    const y = gp.axes[3] ?? 0;
    const mag = Math.hypot(x, y);
    if (mag < 0.3) {
      armed.current = true;
      return;
    }
    if (mag < 0.7 || !armed.current) return;
    armed.current = false;

    /**
     * EIGHT-WAY FLICKS.
     *
     * The listener only ever read four directions — a flick was collapsed onto
     * whichever axis happened to be larger. That is fine for DEM arrows and DVA, where
     * the answer IS cardinal, but it makes a diagonal literally inexpressible. A drill
     * that wants to ask "how far can you see up-and-to-the-left" had no way for the
     * athlete to answer.
     *
     * Eight-way is opt-in per drill (`eightWay`), because turning it on globally would
     * be a regression: a sloppy cardinal flick that drifts 25 degrees off-axis would
     * suddenly read as a diagonal and be scored wrong on drills where diagonals are not
     * even a valid answer.
     */
    const eight = engine.definition.eightWay === true;
    const ang = Math.atan2(-y, x); // gamepad Y is inverted
    let dir: SliceDirection;
    if (eight) {
      const OCT: SliceDirection[] = ["right", "upRight", "up", "upLeft", "left", "downLeft", "down", "downRight"];
      const k = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
      dir = OCT[k];
    } else {
      dir = Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : y > 0 ? "down" : "up";
    }
    // DEM: resolve the CURRENT arrow in the ordered sequence.
    // Gaze Stabilization / DVA: no ordered group — fall back to the earliest
    // live go target so up/down/left/right flicks always register.
    let target: { id: string } | null = null;
    let hasOrdered = false;
    let earliest: { id: string; spawn: number } | null = null;
    for (const slot of engine.pool.slots) {
      if (!slot.active || !slot.spec) continue;
      if (slot.spec.groupMode === "ordered" && slot.spec.groupId) {
        hasOrdered = true;
        // authoritative: ask the engine which item it is waiting on
        if ((slot.spec.seq ?? -1) === engine.expectedSeq(slot.spec.groupId)) {
          target = { id: slot.spec.id };
          break;
        }
      } else if (slot.spec.kind === "go" && !slot.spec.decor && !slot.spec.meta?.decor) {
        if (!earliest || slot.spawnClock < earliest.spawn) {
          earliest = { id: slot.spec.id, spawn: slot.spawnClock };
        }
      }
    }
    if (!target && !hasOrdered && earliest) target = { id: earliest.id };
    if (target) engine.registerHit(target.id, dominant as Hand, dir);
  });
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
    <group position={[0, 1.45, -6]}>
      {/* housing — barrel pointing at the athlete */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.34, 0.25, 20]} />
        <meshStandardMaterial color="#111428" emissive="#2D234F" emissiveIntensity={0.4} flatShading />
      </mesh>
      {/* muzzle ring facing the athlete */}
      <mesh position={[0, 0, 0.14]}>
        <torusGeometry args={[0.17, 0.025, 8, 24]} />
        <meshStandardMaterial color="#2998AA" emissive="#2998AA" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, 0, 0.135]}>
        <circleGeometry args={[0.15, 20]} />
        <meshBasicMaterial color="#020308" />
      </mesh>
      <mesh ref={glow} position={[0, 0, 0.15]}>
        <ringGeometry args={[0.16, 0.24, 24]} />
        <meshBasicMaterial color="#7FD3DE" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Hexagon launcher wall — six holes for the gross-motor assessments. */
function HexLauncherWall() {
  return (
    <group position={[0, 1.45, -6]}>
      {Array.from({ length: 6 }, (_, k) => {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        return (
          <group key={k} position={[Math.cos(a) * 0.95, Math.sin(a) * 0.62, 0]}>
            {/* ring faces the athlete — a visible porthole, not an edge */}
            <mesh>
              <torusGeometry args={[0.15, 0.022, 8, 22]} />
              <meshStandardMaterial color="#2998AA" emissive="#2998AA" emissiveIntensity={0.8} />
            </mesh>
            <mesh position={[0, 0, 0.005]}>
              <circleGeometry args={[0.135, 18]} />
              <meshBasicMaterial color="#020308" />
            </mesh>
          </group>
        );
      })}
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

/**
 * THE VISIBILITY FIELD — the world becomes the background.
 *
 * Contrast is a RELATIONSHIP, not a property. You cannot state a target's contrast
 * without stating the field it sits in — which is why the old drill, floating a
 * "7% contrast" torus in a dark arena lit by moving purple spotlights, was measuring
 * nothing at all.
 *
 * So the drill drives the entire visual world. A luminance dome encloses the athlete
 * at the trial's background level; the optotype is drawn at an absolute luminance on
 * top of it; and the field itself is hostile in the ways sport is hostile:
 *
 *   GLARE   a bright source offset from the target. This is not decoration — a real
 *           glare source scatters light inside the eye and raises a VEILING LUMINANCE
 *           across the whole retina, which lifts the effective background and crushes
 *           the target's contrast without changing a single pixel of the target. That
 *           is exactly what a low sun or a stadium light does to an outfielder, and it
 *           is why an athlete can have a perfect chart score and still lose the ball.
 *
 *   MOTTLE  band-limited clutter around the field's mean. The mean (and therefore the
 *           stated contrast) is preserved; the field just becomes busy. A packed stand
 *           destroys detection far more than it lowers contrast.
 */
function VisibilityField() {
  const engine = useAppStore((s) => s.engine);
  const [lum, setLum] = useState<NonNullable<TrialSpec["luminance"]> | null>(null);
  const dome = useRef<THREE.Mesh>(null);
  const glare = useRef<THREE.Mesh>(null);
  const glareMat = useRef<THREE.MeshBasicMaterial>(null);
  const domeMat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    if (!engine) return;
    // the field is whatever the currently-live target asks for
    let next: NonNullable<TrialSpec["luminance"]> | null = null;
    for (const t of (engine as unknown as { active: Map<string, { spec: TrialSpec }> }).active.values()) {
      if (t.spec.luminance) { next = t.spec.luminance; break; }
    }
    if (next && next.condition !== lum?.condition) setLum(next);
    if (!lum) return;

    // ease the field rather than snapping it — a hard luminance jump between trials
    // would trigger a light/dark adaptation transient and we would be measuring that
    // instead of the athlete
    if (domeMat.current) {
      const want = new THREE.Color(lum.bg / 255, lum.bg / 255, lum.bg / 255);
      domeMat.current.color.lerp(want, 0.06);
    }
    if (glareMat.current) {
      glareMat.current.opacity += (lum.glare * 0.92 - glareMat.current.opacity) * 0.06;
    }
  });

  if (!lum) return null;
  const bg = lum.bg / 255;

  return (
    <group>
      {/* the dome IS the background. Everything else in the arena is behind it. */}
      <mesh ref={dome} renderOrder={-100}>
        <sphereGeometry args={[7, 24, 18]} />
        <meshBasicMaterial
          ref={domeMat}
          side={THREE.BackSide}
          color={new THREE.Color(bg, bg, bg)}
          toneMapped={false}
          map={lum.mottle > 0.02 ? makeMottleTexture(lum.bg, lum.mottle, 7) : null}
          depthWrite
        />
      </mesh>

      {/* GLARE — a bright source beside the target, plus the veiling wash it throws
          across the whole field. The wash is the part that actually hurts. */}
      {lum.glare > 0.02 && (
        <>
          <mesh position={[0.62, 1.92, -1.55]}>
            <circleGeometry args={[0.20, 28]} />
            <meshBasicMaterial color="#FFFFFF" toneMapped={false} transparent opacity={0.95} />
          </mesh>
          <mesh position={[0.62, 1.92, -1.56]}>
            <circleGeometry args={[0.46, 28]} />
            <meshBasicMaterial color="#FFFFFF" toneMapped={false} transparent opacity={0.35 * lum.glare} />
          </mesh>
          {/* the veiling luminance: intraocular scatter, which is what a glare source
              actually does to a human. It lifts the effective background everywhere. */}
          <mesh ref={glare} position={[0, 1.5, -1.35]} renderOrder={90}>
            <planeGeometry args={[6, 4]} />
            <meshBasicMaterial
              ref={glareMat}
              color="#FFFFFF"
              transparent
              opacity={0}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </>
      )}
    </group>
  );
}

/**
 * StroboscopicLayer — binocular occlusion. A full-field black quad locked to
 * the camera toggles opaque/clear on the drill's frame clock (so it pauses
 * with the drill). Level 1 = quick/sparse occlusion; Level 5 = long/frequent.
 */
function StroboscopicLayer() {
  const engine = useAppStore((s) => s.engine);
  const level = useAppStore((s) => s.strobeLevel);
  const camera = useThree((s) => s.camera);
  const mesh = useRef<THREE.Mesh>(null);
  const fwd = useMemo(() => new THREE.Vector3(), []);
  const cfg = STROBE_LEVELS[Math.max(0, Math.min(5, level))];
  useFrame(() => {
    const m = mesh.current;
    if (!m || !engine) return;
    // sit the panel just in front of the eyes, covering the whole field
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    m.position.copy(camera.position).add(fwd.multiplyScalar(0.28));
    m.quaternion.copy(camera.quaternion);
    const period = cfg.clearMs + cfg.occludeMs;
    if (period <= 0) { m.visible = false; return; }
    const now = engine.timing.now;
    const phase = ((now % period) + period) % period;
    m.visible = phase < cfg.occludeMs; // opaque during the occlusion window
  });
  return (
    <mesh ref={mesh} renderOrder={9999} frustumCulled={false} raycast={() => null}>
      <planeGeometry args={[3, 3]} />
      <meshBasicMaterial color="#000000" depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/**
 * MonocularOccluder — TRUE per-eye block. A full-field black quad is rendered
 * ONLY to the occluded eye's layer (layer 1 = left eye, layer 2 = right eye),
 * so the tested eye sees the field normally and the other sees black.
 * The active trial carries meta.blockEye.
 */
function MonocularOccluder() {
  const engine = useAppStore((s) => s.engine);
  const inSession = useXR((s) => s.session);
  const camera = useThree((s) => s.camera);
  const mesh = useRef<THREE.Mesh>(null);
  const fwd = useMemo(() => new THREE.Vector3(), []);
  const [blockEye, setBlockEye] = useState<"left" | "right" | null>(null);
  useFrame(() => {
    if (!engine) return;
    let be: "left" | "right" | null = null;
    for (const t of (engine as unknown as { active: Map<string, { spec: { meta?: { blockEye?: "left" | "right" } } }> }).active.values()) {
      const e = t.spec.meta?.blockEye;
      if (e) { be = e; break; }
    }
    if (be !== blockEye) setBlockEye(be);
    const m = mesh.current;
    if (!m) return;
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    m.position.copy(camera.position).add(fwd.multiplyScalar(0.24));
    m.quaternion.copy(camera.quaternion);
  });
  if (!inSession || !blockEye) return null;
  const mask = blockEye === "left" ? 2 : 4; // layer1 -> left eye, layer2 -> right eye
  return (
    <mesh ref={mesh} renderOrder={9998} frustumCulled={false} layers-mask={mask} raycast={() => null}>
      <planeGeometry args={[3, 3]} />
      <meshBasicMaterial color="#000000" depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/**
 * StereoEyeMaterial — one eye's view of the dot field, shifted by a sub-pixel
 * UV offset. The texture image is shared; only the offset differs per eye, so
 * the two retinal images are identical apart from the disparity.
 */
function StereoEyeMaterial({ tex, offsetU }: { tex: THREE.Texture; offsetU: number }) {
  const eyeTex = useMemo(() => {
    const t = tex.clone();
    t.needsUpdate = true;
    return t;
  }, [tex]);
  useEffect(() => {
    eyeTex.offset.set(offsetU, 0);
  }, [eyeTex, offsetU]);
  return <meshBasicMaterial map={eyeTex} toneMapped={false} />;
}

/** feeds head angular velocity from the XR camera every frame */
function HeadMotionTracker() {
  const camera = useThree((s) => s.camera);
  useFrame((_, dt) => headMotion.update(camera.quaternion, dt));
  return null;
}

/**
 * GazeAids — fixation dot + head-speed feedback ring for Gaze Stabilization.
 * The ring fills and turns teal the instant the athlete's head is rotating
 * fast enough (above the level gate) — turning an invisible mechanic into
 * "fill the ring, read the arrow."
 */
function GazeAids() {
  const engine = useAppStore((s) => s.engine);
  const gate = (engine?.parameters.hvMinDegS as number) ?? 60;
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const dotMat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const frac = Math.min(1.4, headMotion.velDegS / Math.max(1, gate));
    const ok = frac >= 1;
    if (ring.current) ring.current.scale.setScalar(0.7 + Math.min(1, frac) * 0.5 + (ok ? Math.sin(clock.elapsedTime * 6) * 0.04 : 0));
    if (ringMat.current) {
      ringMat.current.color.set(ok ? "#2998AA" : "#38406B");
      ringMat.current.opacity = ok ? 0.95 : 0.4;
    }
    if (dotMat.current) dotMat.current.color.set(ok ? "#7FD3DE" : "#9FA8D6");
  });
  return (
    <group position={[0, 1.45, -1.3]}>
      {/* fixation dot — lock your eyes here */}
      <mesh>
        <sphereGeometry args={[0.012, 12, 12]} />
        <meshBasicMaterial ref={dotMat} color="#9FA8D6" />
      </mesh>
      {/* head-speed ring */}
      <mesh ref={ring}>
        <torusGeometry args={[0.11, 0.01, 8, 40]} />
        <meshBasicMaterial ref={ringMat} color="#38406B" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

/**
 * DesktopTriggerKeys — desktop-only responder for trigger drills so yes/no and
 * left/right answers are testable outside the headset.
 *   Left  answer:  ArrowLeft  or  A
 *   Right answer:  ArrowRight or  D
 */
function DesktopTriggerKeys() {
  const engine = useAppStore((s) => s.engine);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") engine?.registerTriggerResponse("left");
      else if (k === "arrowright" || k === "d") engine?.registerTriggerResponse("right");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine]);
  return null;
}

export function DrillRunner() {
  const engine = useAppStore((s) => s.engine);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    // desktop fallback renders the left-eye copy of dichoptic stimuli
    camera.layers.enable(1);
  }, [camera]);
  const demCursor = useMemo(() => ({ seq: 0 }), [engine]);
  useEffect(() => () => rhythmMusic.stop(), [engine]);
  const perf = PERF_MODES[useAppStore((s) => s.perfModeId)];
  const inSession = useXR((s) => s.session);
  const strobeLevel = useAppStore((s) => s.strobeLevel);
  const [poolVersion, setPoolVersion] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const sparks = useMemo(() => new SparkPool(), []);
  const lastStreakMilestone = useRef(0);
  const musicOn = useRef(false);
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
        if (engine.definition.responseMode === "joystick") demCursor.seq += 1;
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
          if (ev.targetPosition) sparks.burst(ev.targetPosition.x, ev.targetPosition.y, ev.targetPosition.z, new THREE.Color("#4C1D95"), 8);
        }
      }
      if (e.type === "stateChange") {
        if (e.state === "running") {
          sfx.go();
          const r = engine.definition.rhythm;
          if (r && !musicOn.current) {
            rhythmMusic.start(r.bpm, r.style, r.lengthBeats, r.countInBeats);
            musicOn.current = true;
          } else if (r && musicOn.current) {
            rhythmMusic.resume();
          }
        }
        if (e.state === "paused" && engine.definition.rhythm) rhythmMusic.pause();
        if (e.state === "complete") sfx.complete();
        if (e.state === "complete" || e.state === "aborted") {
          if (engine.definition.rhythm) {
            rhythmMusic.stop();
            musicOn.current = false;
          }
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

  /**
   * The generic Acquire fixation marker is a rotating diamond that anchors the
   * gaze for peripheral-search drills — useful there, actively harmful here.
   *
   * Gaze-stabilization drills already render their OWN fixation dot (GazeAids),
   * purpose-built and paired with the head-speed ring. Drawing the generic marker
   * as well put a SECOND fixation cue 10 cm in front of the real one — and,
   * worse, a MOVING one: a spinning diamond sitting right beside the point where
   * the athlete is required to hold their eyes perfectly still.
   *
   * A rotating stimulus captures gaze. That is not a cosmetic annoyance in a VOR
   * drill; it is the drill measuring its own distractor. Retinal slip against a
   * fixation target the athlete keeps being pulled off is not gaze stability.
   */
  const isAcquireStyle = useMemo(
    () =>
      engine !== null &&
      !engine.definition.gazeStability &&
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
      {inSession && engine.definition.responseMode === "strike" && <StrikeColliders />}
      {inSession && engine.definition.responseMode === "trigger" && <TriggerListener />}
      {!inSession && engine.definition.responseMode === "trigger" && <DesktopTriggerKeys />}
      {engine.definition.gazeStability && <GazeAids />}
      {engine.definition.environment === "visibility" && <VisibilityField />}
      {engine.definition.monocular && <MonocularOccluder />}
      {strobeLevel > 0 && engine.definition.supportsStrobe && <StroboscopicLayer />}
      <HeadMotionTracker />
      {engine.definition.responseMode === "joystick" && <JoystickListener cursor={demCursor} />}
      {engine.definition.launcher && <LauncherProp />}
      {engine.definition.hexWall && <HexLauncherWall />}

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
          desktopClicks={engine.definition.responseMode === "pointer" || (!inSession && engine.definition.responseMode !== "trigger")}
          demCursor={engine.definition.responseMode === "joystick" ? demCursor : undefined}
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
