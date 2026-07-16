import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useXRInputSourceState } from "@react-three/xr";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { useAppStore } from "@/app/providers/appStore";
import { SpatialPanel, PanelText, PanelButton } from "@/vr/SpatialPanel";
import { ARES_COLORS } from "@/ares/colors";
import {
  GauntletEngine, objColor,
  GAUNTLET_TIERS, GAUNTLET_TIER_LABEL,
  type GauntletSettings, type GauntletSnapshot, type GauntletMetrics,
  type HandId, type HandState, type GauntletTier, type GauntletHandRule,
} from "@/gauntlet/engine";

/** A turret prop — a barrel aimed at the athlete, glowing when idle. */
function Turret({ at }: { at: [number, number, number] }) {
  const look = useMemo(() => {
    const m = new THREE.Object3D();
    m.position.set(at[0], at[1], at[2]);
    m.lookAt(0, 1.45, 0);
    return [m.rotation.x + Math.PI / 2, m.rotation.y, m.rotation.z] as [number, number, number];
  }, [at]);
  return (
    <group position={at} rotation={look}>
      <mesh>
        <cylinderGeometry args={[0.16, 0.2, 0.34, 16]} />
        <meshStandardMaterial color="#1A1E2E" emissive="#2D234F" emissiveIntensity={0.4} metalness={0.6} roughness={0.5} flatShading />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <torusGeometry args={[0.12, 0.02, 8, 20]} />
        <meshStandardMaterial color="#8B5CF6" emissive="#8B5CF6" emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

function ObjMesh({ o }: { o: GauntletSnapshot["objects"][number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (ref.current) { ref.current.rotation.x += dt * 0.9; ref.current.rotation.y += dt * 1.2; } });
  const color = objColor(o.kind);
  return (
    <group ref={ref} position={o.pos}>
      {o.kind === "bomb" ? (
        <mesh>
          <boxGeometry args={[o.scale * 1.7, o.scale * 1.7, o.scale * 1.7]} />
          <meshStandardMaterial color={o.slowed ? "#3B82F6" : color} emissive={o.slowed ? "#3B82F6" : color} emissiveIntensity={o.slowed ? 0.6 : 0.3} metalness={0.4} roughness={0.7} />
        </mesh>
      ) : (
        <mesh>
          <sphereGeometry args={[o.scale, 20, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} metalness={0.35} roughness={0.28} />
        </mesh>
      )}
    </group>
  );
}

function GauntletHUD({ snap, tier }: { snap: GauntletSnapshot; tier: string }) {
  const mm = Math.floor(snap.timeLeftMs / 60000);
  const ss = Math.floor((snap.timeLeftMs % 60000) / 1000);
  const inBonus = snap.phase === "bonus";
  return (
    <group>
      <group position={[-1.72, 1.62, -1.5]} rotation={[0, 0.5, 0]}>
        <Text position={[0, 0.12, 0]} fontSize={0.095} color="#E8E9F0" anchorX="center">
          {inBonus ? `STAGE ${snap.bonusStage}` : `${mm}:${String(ss).padStart(2, "0")}`}
        </Text>
        <Text position={[0, 0, 0]} fontSize={0.042} color="#6A7086" anchorX="center">
          {inBonus ? "BONUS" : tier.toUpperCase()}
        </Text>
      </group>
      <group position={[1.72, 1.62, -1.5]} rotation={[0, -0.5, 0]}>
        <Text position={[0, 0.12, 0]} fontSize={0.095} color="#E8E9F0" anchorX="center">{snap.score.toLocaleString()}</Text>
        <Text position={[0, 0, 0]} fontSize={0.042} color={snap.streak >= 10 ? "#C9A6FF" : "#6A7086"} anchorX="center">
          {snap.streak > 0 ? `STREAK ${snap.streak}` : "—"}
        </Text>
      </group>
      {snap.pace === "slow" && (
        <Text position={[0, 0.82, -1.6]} fontSize={0.07} color="#2998AA" anchorX="center">RESET — REBUILD YOUR STREAK</Text>
      )}
      {snap.switchWarnMs > 0 && (
        <Text position={[0, 2.15, -1.5]} fontSize={0.13} color="#C9A6FF" anchorX="center" outlineWidth={0.006} outlineColor="#14161F">
          {`HANDS SWAP IN ${Math.ceil(snap.switchWarnMs / 1000)}`}
        </Text>
      )}
      {snap.handFlipped && (
        <Text position={[0, 2.0, -1.5]} fontSize={0.06} color="#C9A6FF" anchorX="center">SWAPPED · PURPLE = LEFT · TEAL = RIGHT</Text>
      )}
    </group>
  );
}

function GauntletRunner({ settings, seed, onComplete }: {
  settings: GauntletSettings; seed: number; onComplete: (m: GauntletMetrics) => void;
}) {
  const { camera } = useThree();
  const engine = useMemo(() => new GauntletEngine(settings, seed), [settings, seed]);
  const [snap, setSnap] = useState<GauntletSnapshot>(() => engine.snapshot());
  const done = useRef(false);
  const leftCtl = useXRInputSourceState("controller", "left");
  const rightCtl = useXRInputSourceState("controller", "right");
  const leftHandSrc = useXRInputSourceState("hand", "left");
  const rightHandSrc = useXRInputSourceState("hand", "right");
  const prev = useRef<Record<HandId, THREE.Vector3 | null>>({ left: null, right: null });
  const hands = useRef<Record<HandId, HandState>>({
    left: { pos: [-0.3, 1.3, -0.25], vel: [0, 0, 0] },
    right: { pos: [0.3, 1.3, -0.25], vel: [0, 0, 0] },
  });
  const trigPrev = useRef<Record<HandId, boolean>>({ left: false, right: false });
  const flash = useRef<{ t: number; good: boolean; critical: boolean }>({ t: -9999, good: true, critical: false });
  const lastEv = useRef(0);

  useEffect(() => { engine.start(performance.now()); return engine.subscribe(setSnap); }, [engine]);

  useFrame((_, dt) => {
    if (done.current) return;
    const now = performance.now();
    const objFor = (h: HandId) => (h === "left" ? leftCtl?.object ?? leftHandSrc?.object : rightCtl?.object ?? rightHandSrc?.object);
    const trigFor = (h: HandId) => {
      const c = h === "left" ? leftCtl : rightCtl;
      return c?.gamepad?.["xr-standard-trigger"]?.state === "pressed";
    };
    const tmp = new THREE.Vector3();
    for (const h of ["left", "right"] as HandId[]) {
      const obj = objFor(h);
      if (obj) {
        obj.getWorldPosition(tmp);
        const p = prev.current[h];
        if (p && dt > 0) hands.current[h].vel = [(tmp.x - p.x) / dt, (tmp.y - p.y) / dt, (tmp.z - p.z) / dt];
        hands.current[h].pos = [tmp.x, tmp.y, tmp.z];
        prev.current[h] = tmp.clone();
      }
      // trigger rising edge -> slow a tracked bomb
      const t = trigFor(h);
      if (t && !trigPrev.current[h]) engine.registerTrigger(h);
      trigPrev.current[h] = t;
    }
    const head: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z];
    engine.tick(now, hands.current, head);

    const evs = engine.events;
    if (evs.length > lastEv.current) {
      const e = evs[evs.length - 1]; lastEv.current = evs.length;
      flash.current = { t: now, good: e.correct, critical: e.critical };
      const c = e.responseHand === "left" ? leftCtl : e.responseHand === "right" ? rightCtl : undefined;
      const hap = c?.inputSource?.gamepad?.hapticActuators?.[0];
      if (hap) { if (e.critical) hap.pulse(0.8, 130); else if (e.correct) hap.pulse(0.5, 26); }
    }

    if (engine.isFinished() && !done.current) { done.current = true; onComplete(engine.metrics()); }
  });

  const flashAge = performance.now() - flash.current.t;
  const flashOn = flashAge < 240 * (flash.current.critical ? 2.2 : 1);
  const streakEnergy = Math.min(1, snap.streak / 40);

  return (
    <group>
      <ambientLight intensity={0.36 + streakEnergy * 0.14} />
      <pointLight position={[0, 3.2, -2]} intensity={1.5 + streakEnergy * 1.3} color="#8B5CF6" distance={16} />
      <pointLight position={[-2.6, 1.6, -1]} intensity={0.5 + streakEnergy * 0.6} color="#2998AA" distance={10} />
      <pointLight position={[2.6, 1.6, -1]} intensity={0.5 + streakEnergy * 0.6} color="#8B5CF6" distance={10} />

      {snap.turrets.map((t, i) => <Turret key={i} at={t} />)}
      {snap.objects.map((o) => <ObjMesh key={o.id} o={o} />)}

      {flashOn && (
        <mesh position={[0, 1.5, -1.4]} renderOrder={-1}>
          <planeGeometry args={[7, 4]} />
          <meshBasicMaterial color={flash.current.critical ? "#FF4D6D" : flash.current.good ? "#8B5CF6" : "#6A7086"}
            transparent opacity={(1 - flashAge / 500) * 0.16 * (flash.current.critical ? 2.4 : 1)} depthWrite={false} toneMapped={false} />
        </mesh>
      )}

      <GauntletHUD snap={snap} tier={settings.tier} />
    </group>
  );
}

/** The live GAUNTLET session. */
export function GauntletSession() {
  const settings = useAppStore((s) => s.gauntlet);
  const finish = useAppStore((s) => s.finishGauntlet);
  const [seed] = useState(() => (Date.now() ^ Math.floor(Math.random() * 2147483647)) % 2147483647);
  return (
    <group>
      <GauntletRunner settings={settings} seed={seed} onComplete={(m) => finish(m)} />
      <PanelButton position={[0, 0.55, -1.3]} label="STOP" onClick={() => useAppStore.setState({ arenaMode: "gauntletSetup" })} width={0.34} height={0.09} />
    </group>
  );
}

/** GAUNTLET setup — tier, hand rule, bonus. */
export function GauntletSetup() {
  const a = useAppStore((s) => s.gauntlet);
  const setG = useAppStore((s) => s.setGauntlet);
  const startG = useAppStore((s) => s.startGauntlet);
  return (
    <SpatialPanel position={[0, 1.5, -1.4]} width={1.7} height={1.5} title="GAUNTLET — SETUP" accent="#8B5CF6">
      <PanelText position={[-0.74, 0.5, 0]} text="TIER" size={0.03} color={ARES_COLORS.softGray} />
      {GAUNTLET_TIERS.map((tier, i) => (
        <PanelButton key={tier} position={[-0.5 + i * 0.34, 0.36, 0]} label={GAUNTLET_TIER_LABEL[tier]}
          onClick={() => setG({ tier: tier as GauntletTier })} width={0.32} height={0.11}
          color={a.tier === tier ? "#8B5CF6" : "#1A1E2E"} accent={ARES_COLORS.electricTeal} />
      ))}

      <PanelText position={[-0.74, 0.12, 0]} text="HAND RULE" size={0.03} color={ARES_COLORS.softGray} />
      {(["symmetric", "asymmetric"] as GauntletHandRule[]).map((hr, i) => (
        <PanelButton key={hr} position={[-0.36 + i * 0.5, -0.02, 0]} label={hr === "symmetric" ? "Symmetric (either hand)" : "Asymmetric (R purple / L teal)"}
          onClick={() => setG({ handRule: hr })} width={0.46} height={0.11}
          color={a.handRule === hr ? "#2998AA" : "#1A1E2E"} accent={ARES_COLORS.electricTeal} />
      ))}

      <PanelButton position={[-0.36, -0.28, 0]} label={a.bonusEnabled ? "Bonus round: ON" : "Bonus round: OFF"}
        onClick={() => setG({ bonusEnabled: !a.bonusEnabled })} width={0.6} height={0.1} />

      <PanelText position={[-0.74, -0.44, 0]}
        text="Turrets fire purple balls (block), teal balls (asym: left hand), and bombs (dodge — or pull the trigger early to slow one). Streak speeds it up; 3 hits reset the pace. 2:30 + bonus until failure."
        size={0.022} color={ARES_COLORS.softGray} maxWidth={1.5} />

      <PanelButton position={[0.34, -0.62, 0]} label="BEGIN" onClick={startG} width={0.5} height={0.12}
        color="#8B5CF6" accent={ARES_COLORS.electricTeal} />
      <PanelButton position={[-0.34, -0.62, 0]} label="BACK" onClick={() => useAppStore.setState({ arenaMode: "home" })} width={0.5} height={0.12} />
    </SpatialPanel>
  );
}

/** GAUNTLET results. */
export function GauntletResultsPanel() {
  const m = useAppStore((s) => s.gauntletResult);
  const a = useAppStore((s) => s.gauntlet);
  const startG = useAppStore((s) => s.startGauntlet);
  const goHome = () => useAppStore.setState({ arenaMode: "home" });
  if (!m) return null;
  const row = (y: number, k: string, v: string, c: string = ARES_COLORS.white) => (
    <group>
      <PanelText position={[-0.86, y, 0]} text={k} size={0.03} color={ARES_COLORS.softGray} />
      <PanelText position={[0.32, y, 0]} text={v} size={0.038} color={c} />
    </group>
  );
  return (
    <SpatialPanel position={[0, 1.5, -1.4]} width={1.9} height={1.6} title="GAUNTLET — COMPLETE" accent="#8B5CF6">
      <PanelText position={[-0.86, 0.66, 0]} text={`${a.tier.toUpperCase()} · ${a.handRule.toUpperCase()}`} size={0.03} color={ARES_COLORS.softGray} />
      {row(0.54, "SCORE", m.score.toLocaleString(), ARES_COLORS.electricTeal)}
      {row(0.44, "BLOCKS · LONGEST STREAK", `${m.totalBlocks}  ·  ${m.longestStreak}`)}
      {row(0.34, "PERFECT · GOOD · POOR", `${m.perfectPct}%  ·  ${m.goodPct}%  ·  ${m.poorPct}%`,
        m.perfectPct >= 40 ? ARES_COLORS.electricTeal : ARES_COLORS.white)}
      {row(0.24, "ACCURACY", `${m.accuracyPct}%`)}
      {row(0.14, "REACTION (avg / best)", `${m.avgReactionMs}ms  /  ${m.fastestReactionMs}ms`)}
      {row(0.04, "BOMBS DODGED · SLOWED", `${m.bombsDodged}  ·  ${m.bombsSlowed}`)}
      {row(-0.06, "BOMB HITS · MISSES", `${m.bombContacts}  ·  ${m.misses}`, (m.bombContacts + m.misses) === 0 ? ARES_COLORS.electricTeal : "#FF9F1C")}
      {row(-0.16, "WRONG HAND · SWITCHES", `${m.wrongHand}  ·  ${m.switchesHandled}`)}
      {row(-0.26, "BONUS DEPTH", m.bonusStage > 0 ? `stage ${m.bonusStage} · ${(m.bonusDurationMs / 1000).toFixed(0)}s · ${m.failCause ?? ""}` : "not reached")}

      <PanelText position={[-0.86, -0.42, 0]} text="Performance descriptors from this session only. Not diagnostic." size={0.022} color={ARES_COLORS.softGray} />
      <PanelButton position={[-0.34, -0.6, 0]} label="ARENA" onClick={goHome} width={0.5} height={0.12} />
      <PanelButton position={[0.34, -0.6, 0]} label="RUN AGAIN" onClick={startG} width={0.5} height={0.12} color="#8B5CF6" accent={ARES_COLORS.electricTeal} />
    </SpatialPanel>
  );
}
