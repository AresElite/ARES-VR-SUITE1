import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useXRInputSourceState } from "@react-three/xr";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { AegisEngine, type AegisSnapshot, type HandState, type HandId } from "@/aegis/ContinuousEngine";
import { CATEGORY_VISUAL, type AegisObject, type AegisSettings } from "@/aegis/types";
import { computeAegisMetrics, type AegisMetrics } from "@/aegis/metrics";
import { tuningFor } from "@/aegis/tiers";
import { SessionControlDock } from "@/vr/SessionControlDock";

/**
 * AEGIS RUNNER.
 *
 * Three rules from the brief are enforced here, at the render layer, and they
 * are the reason this could not simply reuse DrillRunner:
 *
 *   NO FIXATION POINT (§29). There is no crosshair, no centre dot, nothing to
 *   anchor the gaze. Peripheral demand has to EMERGE from where the objects are,
 *   not be manufactured by forcing the eyes to a mark. Visual search is the task.
 *
 *   NO AUDIO IDENTITY CUES (§28). Nothing about an object's category, hand, or
 *   action is ever carried by sound. If the athlete could hear a bomb coming,
 *   we would be measuring hearing. System audio (countdown, round end) only.
 *
 *   FEEDBACK MUST NEVER PRE-REVEAL (§26, §27). Both visual and haptic feedback
 *   fire strictly ON or AFTER contact — never on approach — and both attenuate
 *   as tier rises, so a GOAT athlete is not being coached by the game.
 */

const HIT_FLASH_MS = 260;

/** Geometry per category. Silhouette carries as much identity as colour (§7). */
function geometryFor(shape: string, scale: number): THREE.BufferGeometry {
  switch (shape) {
    case "box": return new THREE.BoxGeometry(scale * 1.7, scale * 1.7, scale * 1.7);
    case "diamond": return new THREE.OctahedronGeometry(scale * 1.15, 0);
    case "sphere": return new THREE.SphereGeometry(scale, 20, 16);
    case "cone": return new THREE.ConeGeometry(scale * 1.05, scale * 2.1, 5); // spiked = danger
    case "pyramid": return new THREE.TetrahedronGeometry(scale * 1.35, 0);
    case "ring": return new THREE.TorusGeometry(scale * 0.95, scale * 0.22, 10, 22);
    default: return new THREE.SphereGeometry(scale, 16, 12);
  }
}

/** the contrast stripes that mark a NO-GO sphere — apparent early, subtle later. */
function NoGoStripes({ scale, apparent }: { scale: number; apparent: number }) {
  const bands = [-0.5, 0, 0.5];
  return (
    <>
      {bands.map((f, i) => {
        const y = f * scale;
        const major = Math.sqrt(Math.max(0.0001, scale * scale - y * y)) * 1.0;
        const minor = scale * (0.10 + 0.14 * apparent);
        return (
          <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[major, minor, 8, 24]} />
            <meshStandardMaterial
              color="#0B0F2A"
              emissive="#0B0F2A"
              emissiveIntensity={0.05}
              metalness={0.2}
              roughness={0.6}
            />
          </mesh>
        );
      })}
    </>
  );
}

/** the visible rail — a faint tube along the marker's path, so the athlete can see the route
 *  the assigned hand must ride. Coloured by the rail's hand. */
function RailPath({ obj }: { obj: AegisObject }) {
  const geo = useMemo(() => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(obj.p0[0], obj.p0[1], obj.p0[2]),
      new THREE.Vector3(obj.ctrl[0], obj.ctrl[1], obj.ctrl[2]),
      new THREE.Vector3(obj.p1[0], obj.p1[1], obj.p1[2]),
    );
    return new THREE.TubeGeometry(curve, 26, Math.max(0.01, obj.scale * 0.3), 8, false);
  }, [obj.p0, obj.ctrl, obj.p1, obj.scale]);
  const color = obj.color ?? "#8B5CF6";
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} transparent opacity={0.32} />
    </mesh>
  );
}

function AegisObjectMesh({ obj, pos, feedback }: { obj: AegisObject; pos: [number, number, number]; feedback: number }) {
  const v = CATEGORY_VISUAL[obj.cat];
  const grp = useRef<THREE.Group>(null);
  const shape = v.shape;
  const geo = useMemo(() => geometryFor(shape, obj.scale), [shape, obj.scale]);
  const color = obj.color ?? v.color;   // no-go borrows a stimulus colour; together is dark blue

  useFrame((_, dt) => {
    const g = grp.current;
    if (!g) return;
    g.position.set(pos[0], pos[1], pos[2]);
    // A slow, constant tumble — deliberately IDENTICAL for every category, so rotation is
    // never a free identity cue. (A no-go's stripes are fixed to the sphere, so they tumble
    // with it, which is the point — you must read the stripes, not a static orientation.)
    g.rotation.x += dt * 0.8;
    g.rotation.y += dt * 1.1;
  });

  const isThreat = obj.cat === "bomb" || obj.cat === "nogo";
  return (
    <group ref={grp}>
      <mesh geometry={geo}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isThreat ? 0.35 : 0.55 + feedback * 0.25}
          metalness={0.35}
          roughness={obj.cat === "bomb" ? 0.85 : 0.28}
        />
      </mesh>
      {obj.cat === "nogo" && <NoGoStripes scale={obj.scale} apparent={obj.stripes ?? 1} />}
    </group>
  );
}

/** The release zone for delivery catches — shown only while something is held. */
function ReleaseZone({ at }: { at: [number, number, number] }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ring.current) {
      const p = 1 + Math.sin(clock.elapsedTime * 4) * 0.06;
      ring.current.scale.setScalar(p);
    }
  });
  return (
    <mesh ref={ring} position={at} rotation={[0, 0, 0]}>
      <torusGeometry args={[0.2, 0.018, 8, 32]} />
      <meshBasicMaterial color="#C9A6FF" toneMapped={false} transparent opacity={0.75} />
    </mesh>
  );
}

export function AegisRunner({
  settings, seed, onComplete, onExit,
}: {
  settings: AegisSettings;
  seed: number;
  onComplete: (m: AegisMetrics, engine: AegisEngine) => void;
  onExit: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const { camera } = useThree();
  const engine = useMemo(() => new AegisEngine(settings, seed), [settings, seed]);
  const tune = useMemo(() => tuningFor(settings.tier, settings.custom), [settings]);
  const [snap, setSnap] = useState<AegisSnapshot>(() => engine.snapshot());
  const done = useRef(false);

  const leftCtl = useXRInputSourceState("controller", "left");
  const rightCtl = useXRInputSourceState("controller", "right");
  const leftHandSrc = useXRInputSourceState("hand", "left");
  const rightHandSrc = useXRInputSourceState("hand", "right");

  const prev = useRef<Record<HandId, THREE.Vector3 | null>>({ left: null, right: null });
  const hands = useRef<Record<HandId, HandState>>({
    left: { pos: [-0.3, 1.3, -0.25], vel: [0, 0, 0], gripping: false },
    right: { pos: [0.3, 1.3, -0.25], vel: [0, 0, 0], gripping: false },
  });
  const flash = useRef<{ t: number; good: boolean; critical: boolean }>({ t: -9999, good: true, critical: false });
  const [hitTag, setHitTag] = useState<{ t: number; zone: string; at: [number, number, number] } | null>(null);
  const lastEventCount = useRef(0);

  useEffect(() => {
    engine.start(performance.now());
    return engine.subscribe(setSnap);
  }, [engine]);

  useFrame((_, dt) => {
    if (done.current) return;
    const now = performance.now();

    // ---- read controllers (grip preferred; tracked hands fall back to pinch)
    const srcs: Record<HandId, { obj?: THREE.Object3D; gripping: boolean; haptic?: (i: number, d: number) => void }> = {
      left: {
        obj: leftCtl?.object ?? leftHandSrc?.object,
        gripping:
          (leftCtl?.gamepad?.["xr-standard-squeeze"]?.state === "pressed") ||
          (leftCtl?.gamepad?.["xr-standard-trigger"]?.state === "pressed"),
        haptic: leftCtl?.inputSource?.gamepad?.hapticActuators?.[0]
          ? (i: number, d: number) => leftCtl.inputSource.gamepad!.hapticActuators![0].pulse(i, d)
          : undefined,
      },
      right: {
        obj: rightCtl?.object ?? rightHandSrc?.object,
        gripping:
          (rightCtl?.gamepad?.["xr-standard-squeeze"]?.state === "pressed") ||
          (rightCtl?.gamepad?.["xr-standard-trigger"]?.state === "pressed"),
        haptic: rightCtl?.inputSource?.gamepad?.hapticActuators?.[0]
          ? (i: number, d: number) => rightCtl.inputSource.gamepad!.hapticActuators![0].pulse(i, d)
          : undefined,
      },
    };

    const tmp = new THREE.Vector3();
    for (const h of ["left", "right"] as HandId[]) {
      const s = srcs[h];
      if (s.obj) {
        s.obj.getWorldPosition(tmp);
        const p = prev.current[h];
        if (p && dt > 0) {
          hands.current[h].vel = [(tmp.x - p.x) / dt, (tmp.y - p.y) / dt, (tmp.z - p.z) / dt];
        }
        hands.current[h].pos = [tmp.x, tmp.y, tmp.z];
        prev.current[h] = tmp.clone();
      }
      hands.current[h].gripping = s.gripping;
    }

    const head: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z];
    engine.tick(now, hands.current, head);

    // ---- TIERED FEEDBACK (§26, §27). Fires strictly on resolution, never on
    // approach, and attenuates as tier rises so elite athletes are not coached.
    const evs = engine.events;
    if (evs.length > lastEventCount.current) {
      const e = evs[evs.length - 1];
      lastEventCount.current = evs.length;
      flash.current = { t: now, good: e.correct, critical: e.critical };
      // Localization feedback, at the point of contact, immediately. This is the
      // only way an athlete can actually CORRECT a spatial bias — telling them at
      // the end of a five-minute round is a report, not coaching.
      if (e.correct && e.precisionZone && e.responseHand) {
        setHitTag({ t: now, zone: e.precisionZone, at: [...hands.current[e.responseHand].pos] });
      }
      const hh = e.responseHand ? srcs[e.responseHand].haptic : undefined;
      if (hh && tune.hapticIntensity > 0) {
        // critical errors always cut through, even at GOAT — that is a safety
        // signal, not a coaching one.
        if (e.critical) hh(Math.max(0.7, tune.hapticIntensity), 140);
        else if (e.correct) hh(tune.hapticIntensity * 0.7, 28);
      }
    }

    if (engine.isFinished() && !done.current) {
      done.current = true;
      onComplete(computeAegisMetrics(engine, settings), engine);
    }
  });

  const held = snap.objects.find((o) => o.heldBy);
  const flashAge = performance.now() - flash.current.t;
  const flashOn = flashAge < HIT_FLASH_MS * (flash.current.critical ? 2.2 : 1);
  const fb = tune.feedbackIntensity;

  /**
   * STREAK ENVIRONMENT ESCALATION (§31). The arena gets more alive as the streak
   * grows — but ONLY through light and depth, never through anything that touches
   * the objects themselves. Target contrast, size, and legibility are held exactly
   * constant, because the moment the environment starts obscuring the task, the
   * reaction times we are recording stop meaning anything.
   */
  const streakEnergy = Math.min(1, snap.streak / 40);

  return (
    <group>
      {/* ambient escalation — light only, never clutter */}
      <ambientLight intensity={0.35 + streakEnergy * 0.15} />
      <pointLight position={[0, 3.2, -2]} intensity={1.6 + streakEnergy * 1.4} color="#8B5CF6" distance={14} />
      <pointLight position={[-2.4, 1.6, -1]} intensity={0.5 + streakEnergy * 0.6} color="#2998AA" distance={9} />
      <pointLight position={[2.4, 1.6, -1]} intensity={0.5 + streakEnergy * 0.6} color="#8B5CF6" distance={9} />

      {snap.objects.map((o) => {
        const p = o.heldBy ? hands.current[o.heldBy].pos : (snap.positions[o.id] ?? o.p0);
        return (
          <group key={o.id}>
            {o.cat === "rail" && <RailPath obj={o} />}
            <AegisObjectMesh obj={o} pos={p} feedback={streakEnergy} />
          </group>
        );
      })}

      {held?.releaseZone && <ReleaseZone at={held.releaseZone} />}

      {/* HAND LOCALIZATION — PERFECT / GOOD / POOR, at the contact point. It is
          tiered like everything else: at GOAT it is a whisper, because an elite
          athlete should not be coached through every rep. */}
      {hitTag && performance.now() - hitTag.t < 620 && fb > 0.05 && (
        <Text
          position={[hitTag.at[0], hitTag.at[1] + 0.14, hitTag.at[2]]}
          fontSize={hitTag.zone === "perfect" ? 0.05 : 0.04}
          color={hitTag.zone === "perfect" ? "#2998AA" : hitTag.zone === "good" ? "#E8E9F0" : "#FF9F1C"}
          anchorX="center"
          fillOpacity={Math.max(0, 1 - (performance.now() - hitTag.t) / 620) * Math.min(1, fb * 1.6)}
          outlineWidth={0.004}
          outlineColor="#14161F"
        >
          {hitTag.zone.toUpperCase()}
        </Text>
      )}

      {/* CONTACT FEEDBACK — a brief, restrained wash. No explosions, ever. */}
      {flashOn && fb > 0.05 && (
        <mesh position={[0, 1.5, -1.4]} renderOrder={-1}>
          <planeGeometry args={[7, 4]} />
          <meshBasicMaterial
            color={flash.current.critical ? "#FF4D6D" : flash.current.good ? "#8B5CF6" : "#6A7086"}
            transparent
            opacity={(1 - flashAge / (HIT_FLASH_MS * 2)) * 0.16 * fb * (flash.current.critical ? 2.4 : 1)}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* RULE-SWITCH WARNING — every rule change is announced (§5). There are no
          unannounced switches in the launch build; a rule you were never told
          about measures surprise, not cognitive flexibility. */}
      {snap.ruleWarningMs > 0 && (
        <Text position={[0, 2.15, -1.5]} fontSize={0.13} color="#C9A6FF" anchorX="center" outlineWidth={0.006} outlineColor="#14161F">
          {`HANDS SWAP IN ${Math.ceil(snap.ruleWarningMs / 1000)}`}
        </Text>
      )}

      <AegisHUD snap={snap} tier={settings.tier} />

      <SessionControlDock
        label={`AEGIS · ${settings.tier.toUpperCase()}`}
        paused={paused}
        onPause={() => { engine.setPaused(true); setPaused(true); }}
        onResume={() => { engine.setPaused(false); setPaused(false); }}
        onExit={() => { engine.stop(); onExit(); }}
      />
    </group>
  );
}

/** Minimal HUD. No fixation point, nothing near the centre of the field. */
function AegisHUD({ snap, tier }: { snap: AegisSnapshot; tier: string }) {
  const mm = Math.floor(snap.mainRemainingMs / 60000);
  const ss = Math.floor((snap.mainRemainingMs % 60000) / 1000);
  const inBonus = snap.phase === "bonus";

  return (
    <group>
      {/* Upper periphery only — the centre of the visual field is left completely
          clear, because that is where the athlete has to be searching. */}
      {/* The HUD is pushed to the far SIDES and angled inward. Nothing sits in
          the central field, because the central field is the measurement. */}
      <group position={[-1.72, 1.62, -1.5]} rotation={[0, 0.5, 0]}>
        <Text position={[0, 0.12, 0]} fontSize={0.095} color="#E8E9F0" anchorX="center">
          {inBonus ? `STAGE ${snap.bonusStage}` : `${mm}:${String(ss).padStart(2, "0")}`}
        </Text>
        <Text position={[0, 0, 0]} fontSize={0.042} color="#6A7086" anchorX="center">
          {inBonus ? "BONUS" : tier.toUpperCase()}
        </Text>
      </group>

      <group position={[1.72, 1.62, -1.5]} rotation={[0, -0.5, 0]}>
        <Text position={[0, 0.12, 0]} fontSize={0.095} color="#E8E9F0" anchorX="center">
          {snap.score.toLocaleString()}
        </Text>
        <Text position={[0, 0, 0]} fontSize={0.042}
          color={snap.streak >= 10 ? "#C9A6FF" : "#6A7086"} anchorX="center">
          {snap.streak > 0 ? `STREAK ${snap.streak}` : "—"}
        </Text>
      </group>

      {/* The slowdown is FELT, not labelled. The only thing shown is that the
          athlete is in a recovery state and how to leave it — never a "rest" cue. */}
      {snap.pace !== "normal" && (
        <Text position={[0, 0.78, -1.6]} fontSize={0.07} color="#2998AA" anchorX="center">
          {snap.pace === "slowdown" ? "RESET" : `RECOVER  ${snap.recoveryStreak}/3`}
        </Text>
      )}

      {inBonus && snap.bonusMisses > 0 && (
        <Text position={[0, 0.78, -1.6]} fontSize={0.07} color="#FF4D6D" anchorX="center">
          {`${3 - snap.bonusMisses} MISSES LEFT`}
        </Text>
      )}
    </group>
  );
}
