import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useXRInputSourceState } from "@react-three/xr";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { KeystoneEngine, type KeySnapshot, type Body, type Tracked } from "@/keystone/KeystoneEngine";
import { computeKeyMetrics, type KeyMetrics } from "@/keystone/metrics";
import { STIMULUS_VISUAL, type KeySettings, type MovementPhase, type Segment } from "@/keystone/types";
import { tuningFor } from "@/keystone/tiers";
import { NEUTRAL } from "@/keystone/patterns";
import { SessionControlDock } from "@/vr/SessionControlDock";

/**
 * THE KEYSTONE CHAMBER.
 *
 * Architectural, not arcade. Folding origami geometry that unfolds as the streak
 * builds. The athlete stands inside a structure that visibly holds itself
 * together — which is the metaphor, and also the task.
 *
 * Three rules enforced here at the render layer:
 *
 *   NO AUDIO CUES (§42). The rhythm is VISUAL, entirely. An audible beat would
 *   let the athlete synchronize by ear, and we would stop measuring visual-motor
 *   coupling and start measuring hearing.
 *
 *   FEEDBACK NEVER PRE-REVEALS (§40, §41). Both visual and haptic feedback fire
 *   on resolution only, and both attenuate as tier rises. A GOAT athlete is not
 *   being coached through their reps.
 *
 *   ESCALATION NEVER OBSCURES (§39). The chamber gets more alive with the streak
 *   — but endpoint zones, stimulus contrast, and legibility are held EXACTLY
 *   constant. The instant the environment starts hiding the task, every number
 *   this drill produces becomes worthless.
 */

const PURPLE = "#8B5CF6";
const TEAL = "#2998AA";
const WHITE = "#E8E9F0";
const GRAY = "#6A7086";
const RED = "#FF4D6D";
const LILAC = "#C9A6FF";

/** An endpoint zone the athlete must put a hand into. */
function EndpointOrb({
  at, tol, hand, active, arrived, holding, drift, stabTol,
}: {
  at: [number, number, number]; tol: number; hand: "left" | "right";
  active: boolean; arrived: boolean; holding: number; drift: number; stabTol: number;
}) {
  const g = useRef<THREE.Group>(null);
  const color = hand === "right" ? PURPLE : TEAL;
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.position.set(at[0], at[1], at[2]);
    const p = arrived ? 1 : 1 + Math.sin(clock.elapsedTime * 3.4) * 0.05;
    g.current.scale.setScalar(p);
  });

  /**
   * THE STABILITY RING. This is the single most important piece of feedback in
   * the drill, and nothing else in the suite has it: once the athlete ARRIVES,
   * the ring shows their live drift. Arriving is easy. Staying still is the task,
   * and an athlete cannot learn to stop if they cannot see themselves wobbling.
   */
  const unstable = drift > stabTol;
  return (
    <group ref={g}>
      <mesh>
        <sphereGeometry args={[tol, 20, 16]} />
        <meshBasicMaterial color={color} transparent opacity={arrived ? 0.10 : 0.16} wireframe />
      </mesh>
      {arrived && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[tol * (1 + holding * 0.25), 0.008 + (unstable ? 0.006 : 0), 8, 40]} />
          <meshBasicMaterial
            color={unstable ? RED : holding > 0.85 ? TEAL : WHITE}
            toneMapped={false} transparent opacity={0.85} />
        </mesh>
      )}
      <mesh>
        <sphereGeometry args={[0.016, 10, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The central stimulus — abstract folded geometry, never a ball or a weapon. */
function StimulusCore({ phase, rhythm, stage, falsePulse, ruleChange, streak }: {
  phase?: MovementPhase; rhythm: number; stage: string; falsePulse: boolean;
  ruleChange: boolean; streak: number;
}) {
  const g = useRef<THREE.Group>(null);
  const energy = Math.min(1, streak / 22);
  const v = phase ? STIMULUS_VISUAL[phase.kind] : undefined;

  useFrame((_, dt) => {
    if (!g.current) return;
    g.current.rotation.y += dt * (0.3 + energy * 0.4);
    // the visual rhythm — the ONLY timing cue in the drill
    const s = 1 + (rhythm - 0.5) * 0.18;
    g.current.scale.set(s, s, s);
  });

  const color = ruleChange ? RED : falsePulse ? LILAC : (v?.color ?? PURPLE);

  return (
    <group position={[0, 1.66, -2.1]}>
      <group ref={g}>
        {/* three counter-rotated folded planes — the origami core */}
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[i * 0.7, i * 1.1, i * 0.4]}>
            <tetrahedronGeometry args={[0.24 - i * 0.05, 0]} />
            <meshStandardMaterial
              color={color} emissive={color}
              emissiveIntensity={0.3 + energy * 0.4 + (stage === "go" ? 0.4 : 0)}
              metalness={0.6} roughness={0.25} wireframe={i !== 0} transparent opacity={i === 0 ? 0.85 : 0.5} />
          </mesh>
        ))}
      </group>
      {v && (
        <Text position={[0, -0.42, 0]} fontSize={0.09} color={color} anchorX="center"
          outlineWidth={0.005} outlineColor="#0B0D14">
          {v.label}
        </Text>
      )}
      {stage === "prepare" && (
        <Text position={[0, -0.56, 0]} fontSize={0.05} color={GRAY} anchorX="center">
          READY
        </Text>
      )}
      {stage === "go" && (
        <Text position={[0, -0.56, 0]} fontSize={0.06} color={TEAL} anchorX="center">
          GO
        </Text>
      )}
    </group>
  );
}

export function KeystoneRunner({
  settings, seed, onComplete, onExit,
}: {
  settings: KeySettings; seed: number;
  onComplete: (m: KeyMetrics) => void; onExit: () => void;
}) {
  const { camera } = useThree();
  const engine = useMemo(() => new KeystoneEngine(settings, seed), [settings, seed]);
  const tune = useMemo(() => tuningFor(settings.tier, settings.mode, settings.custom), [settings]);
  const [snap, setSnap] = useState<KeySnapshot>(() => engine.snapshot());
  const [paused, setPaused] = useState(false);
  const done = useRef(false);

  const lc = useXRInputSourceState("controller", "left");
  const rc = useXRInputSourceState("controller", "right");
  const lh = useXRInputSourceState("hand", "left");
  const rh = useXRInputSourceState("hand", "right");

  const prev = useRef<Record<"left" | "right" | "head", THREE.Vector3 | null>>({ left: null, right: null, head: null });
  const body = useRef<Body>({
    head: { pos: [...NEUTRAL.head] as [number, number, number], vel: [0, 0, 0], yaw: 0, pitch: 0 },
    left: { pos: [...NEUTRAL.left] as [number, number, number], vel: [0, 0, 0] },
    right: { pos: [...NEUTRAL.right] as [number, number, number], vel: [0, 0, 0] },
  });
  const lastEv = useRef(0);

  useEffect(() => {
    engine.start(performance.now());
    return engine.subscribe(setSnap);
  }, [engine]);

  useFrame((_, dt) => {
    if (done.current) return;
    const now = performance.now();
    const src = {
      left: { obj: lc?.object ?? lh?.object, haptic: lc?.inputSource?.gamepad?.hapticActuators?.[0] },
      right: { obj: rc?.object ?? rh?.object, haptic: rc?.inputSource?.gamepad?.hapticActuators?.[0] },
    };
    const tmp = new THREE.Vector3();
    for (const h of ["left", "right"] as const) {
      const o = src[h].obj;
      if (!o) continue;
      o.getWorldPosition(tmp);
      const p = prev.current[h];
      if (p && dt > 0) body.current[h].vel = [(tmp.x - p.x) / dt, (tmp.y - p.y) / dt, (tmp.z - p.z) / dt];
      body.current[h].pos = [tmp.x, tmp.y, tmp.z];
      prev.current[h] = tmp.clone();
    }
    // headset: position, and the YAW that the pattern's head role is judged against
    const hp = camera.position;
    const ph = prev.current.head;
    if (ph && dt > 0) body.current.head.vel = [(hp.x - ph.x) / dt, (hp.y - ph.y) / dt, (hp.z - ph.z) / dt];
    body.current.head.pos = [hp.x, hp.y, hp.z];
    prev.current.head = hp.clone();
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    body.current.head.yaw = e.y;
    body.current.head.pitch = e.x;

    engine.tick(now, body.current);

    if (engine.log.length > lastEv.current) {
      const ev = engine.log[engine.log.length - 1];
      lastEv.current = engine.log.length;
      // TIERED HAPTICS — on resolution only, never before a decision.
      for (const h of ["left", "right"] as const) {
        const act = src[h].haptic;
        if (!act || tune.haptics <= 0) continue;
        if (ev.critical) act.pulse(Math.max(0.7, tune.haptics), 130);
        else if (ev.correct) act.pulse(tune.haptics * 0.55, 24);
      }
    }

    if (engine.isFinished() && !done.current) {
      done.current = true;
      onComplete(computeKeyMetrics(engine, settings));
    }
  });

  const ph = snap.phases[snap.phaseIdx];
  const energy = Math.min(1, snap.streak / 22);
  const showZones = ph && (snap.stage === "go" || snap.stage === "hold");

  return (
    <group>
      <ambientLight intensity={0.32 + energy * 0.12} />
      <pointLight position={[0, 3.2, -2.4]} intensity={1.5 + energy * 1.6} color={PURPLE} distance={18} />
      <pointLight position={[-2.6, 1.5, -1.2]} intensity={0.45 + energy * 0.5} color={TEAL} distance={10} />
      <pointLight position={[2.6, 1.5, -1.2]} intensity={0.45 + energy * 0.5} color={PURPLE} distance={10} />

      <StimulusCore
        phase={ph} rhythm={snap.rhythm} stage={snap.stage}
        falsePulse={snap.falsePulse} ruleChange={snap.ruleChangeMs > 0} streak={snap.streak}
      />

      {/* ENDPOINT ZONES — where the body must arrive. */}
      {showZones && (["left", "right"] as const).map((h) => {
        const role = ph!.roles[h as Segment];
        const still = role === "stabilize" || role === "inhibit" || role === "neutral";
        // A segment told to STAY STILL has no zone to travel to — showing one
        // would be actively misleading, and would invite exactly the movement the
        // rule is asking the athlete to suppress.
        if (still) return null;
        return (
          <EndpointOrb
            key={h}
            at={ph!.endpoint[h]}
            tol={ph!.endpoint.tolM}
            hand={h}
            active={snap.stage === "go"}
            arrived={snap.stage === "hold"}
            holding={snap.holdProgress}
            drift={snap.liveDriftM}
            stabTol={ph!.endpoint.stabilityTolM}
          />
        );
      })}

      {/* A segment told to HOLD STILL gets an ANCHOR, not a target. Different
          symbol, because it is the opposite instruction. */}
      {showZones && (["left", "right"] as const).map((h) => {
        const role = ph!.roles[h as Segment];
        if (role !== "stabilize" && role !== "inhibit") return null;
        const p = h === "left" ? NEUTRAL.left : NEUTRAL.right;
        return (
          <mesh key={`a-${h}`} position={p} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.09, 0.01, 6, 24]} />
            <meshBasicMaterial color={GRAY} toneMapped={false} transparent opacity={0.6} />
          </mesh>
        );
      })}

      <KeystoneHUD snap={snap} tier={settings.tier} mode={settings.mode} />

      <SessionControlDock
        label={`KEYSTONE · ${settings.tier.toUpperCase()}`}
        paused={paused}
        onPause={() => { engine.setPaused(true); setPaused(true); }}
        onResume={() => { engine.setPaused(false); setPaused(false); }}
        onExit={() => { engine.stop(); onExit(); }}
      />
    </group>
  );
}

function KeystoneHUD({ snap, tier, mode }: { snap: KeySnapshot; tier: string; mode: string }) {
  const mm = Math.floor(snap.mainRemainingMs / 60000);
  const ss = Math.floor((snap.mainRemainingMs % 60000) / 1000);
  const bonus = snap.sessionPhase === "bonus";

  return (
    <group>
      {/* Far sides, angled in. The centre of the field belongs to the stimulus. */}
      <group position={[-1.95, 1.72, -1.5]} rotation={[0, 0.55, 0]}>
        <Text position={[0, 0.12, 0]} fontSize={0.09} color={WHITE} anchorX="center">
          {bonus ? `STAGE ${snap.bonusStage}` : `${mm}:${String(ss).padStart(2, "0")}`}
        </Text>
        <Text position={[0, 0.005, 0]} fontSize={0.04} color={GRAY} anchorX="center">
          {bonus ? "BONUS" : `${tier.toUpperCase()}${mode === "assessment" ? " · ASSESS" : ""}`}
        </Text>
      </group>

      <group position={[1.95, 1.72, -1.5]} rotation={[0, -0.55, 0]}>
        <Text position={[0, 0.12, 0]} fontSize={0.09} color={WHITE} anchorX="center">
          {snap.score.toLocaleString()}
        </Text>
        <Text position={[0, 0.005, 0]} fontSize={0.04}
          color={snap.streak >= 5 ? TEAL : GRAY} anchorX="center">
          {snap.streak > 0 ? `${snap.streak} CLEAN` : "—"}
        </Text>
      </group>

      {snap.inRecovery && (
        <Text position={[0, 0.72, -1.7]} fontSize={0.055} color={TEAL} anchorX="center">
          {`REORGANIZE  ${snap.recoveryStreak}/2`}
        </Text>
      )}
      {bonus && snap.bonusStrikes > 0 && (
        <Text position={[0, 0.72, -1.7]} fontSize={0.055} color={RED} anchorX="center">
          {`${3 - snap.bonusStrikes} STRIKES LEFT`}
        </Text>
      )}
    </group>
  );
}
