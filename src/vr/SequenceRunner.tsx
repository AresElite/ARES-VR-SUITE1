import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useXRInputSourceState } from "@react-three/xr";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { SequenceEngine, type SeqSnapshot, type HandInput, type Hand } from "@/sequence/SequenceEngine";
import { computeSeqMetrics, type SeqMetrics } from "@/sequence/metrics";
import type { Cue, CueZone, PlanStep, SeqSettings, CentralCommand, SeqAction } from "@/sequence/types";
import { tuningFor } from "@/sequence/tiers";
import { SessionControlDock } from "@/vr/SessionControlDock";

/**
 * THE SEQUENCING CHAMBER (§41).
 *
 * A cognitive command centre, not an arcade. Four zones, and the athlete's eyes
 * must travel between them constantly — which is the drill:
 *
 *   PERIPHERAL CUE RING   the edge of the field. Information arrives here.
 *   CENTRAL DECISION CORE dead ahead. The rule lives here.
 *   L / R EXECUTION ZONES six pads. The plan is discharged here.
 *   PROGRESS SPINE        below centre. Where you are in the plan.
 *
 * Deliberately NO fixation point, and the cue ring is wide enough that a cue can
 * never be read foveally while the core is also being watched. That tension —
 * you cannot look at both — is the entire acquisition demand.
 */

const PURPLE = "#8B5CF6";
const TEAL = "#2998AA";
const WHITE = "#E8E9F0";
const GRAY = "#6A7086";
const RED = "#FF4D6D";

/** Cue ring geometry — angle and elevation for each zone (§7). */
const ZONE_POS: Record<CueZone, [number, number, number]> = {
  upLeft: [-0.95, 1.98, -1.5],
  upRight: [0.95, 1.98, -1.5],
  downLeft: [-0.95, 1.02, -1.5],
  downRight: [0.95, 1.02, -1.5],
  farLeft: [-1.55, 1.50, -1.25],
  farRight: [1.55, 1.50, -1.25],
  upFarLeft: [-1.48, 2.05, -1.15],
  upFarRight: [1.48, 2.05, -1.15],
  downFarLeft: [-1.48, 0.95, -1.15],
  downFarRight: [1.48, 0.95, -1.15],
};

/**
 * CUE IDENTITY — four redundant channels (§8): colour, silhouette, symbol, and
 * position. Any ONE of them is sufficient to read the cue. Colour is never
 * load-bearing, because if it were we would be measuring colour vision and
 * calling it working memory.
 *   HAND    purple/octahedron = RIGHT · teal/cube = LEFT
 *   ACTION  carried by the SYMBOL, independent of the hand channel
 */
const ACTION_SYMBOL: Record<SeqAction, string> = {
  strike: "/", block: "T", catch: "U", hold: "=", trace: "~", inhibit: "X",
};

function CueMesh({ cue }: { cue: Cue }) {
  const p = ZONE_POS[cue.zone];
  const isRight = cue.hand === "right";
  const color = cue.distractor ? GRAY : isRight ? PURPLE : TEAL;
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (g.current) g.current.rotation.y += dt * 0.9; });

  return (
    <group position={p}>
      <group ref={g}>
        <mesh>
          {isRight
            ? <octahedronGeometry args={[0.1, 0]} />
            : <boxGeometry args={[0.15, 0.15, 0.15]} />}
          <meshStandardMaterial
            color={color}
            emissive={color}
            // The SALIENT decoy is deliberately brighter — it is engineered to
            // capture the gaze, because overriding that capture is the skill.
            emissiveIntensity={cue.salient ? 1.5 : 0.6}
            wireframe={cue.distractor}
          />
        </mesh>
      </group>
      {/* SYMBOL — the action channel, readable independent of colour and shape */}
      <Text position={[0, -0.17, 0]} fontSize={0.075} color={color} anchorX="center">
        {ACTION_SYMBOL[cue.action]}
      </Text>
      {/* BAND — the third channel: a tick above, level, or below */}
      <Text position={[0, 0.17, 0]} fontSize={0.05} color={GRAY} anchorX="center">
        {cue.band === "high" ? "^" : cue.band === "low" ? "v" : "-"}
      </Text>
    </group>
  );
}

/** THE CENTRAL DECISION CORE — origami geometry that energizes with the streak. */
function DecisionCore({ commands, streak, live }: { commands: CentralCommand[] | null; streak: number; live: boolean }) {
  const g = useRef<THREE.Group>(null);
  const energy = Math.min(1, streak / 25);
  useFrame(({ clock }, dt) => {
    if (!g.current) return;
    g.current.rotation.y += dt * (0.25 + energy * 0.5);
    const p = 1 + Math.sin(clock.elapsedTime * 2.4) * 0.03 * (1 + energy);
    g.current.scale.setScalar(p);
  });

  return (
    <group position={[0, 1.52, -1.72]}>
      <group ref={g}>
        {/* an origami-folded core: two counter-rotated tetrahedra */}
        <mesh rotation={[0, 0, 0]}>
          <tetrahedronGeometry args={[0.17, 0]} />
          <meshStandardMaterial color={PURPLE} emissive={PURPLE}
            emissiveIntensity={0.35 + energy * 0.5} metalness={0.6} roughness={0.25} wireframe />
        </mesh>
        <mesh rotation={[Math.PI, Math.PI / 3, 0]}>
          <tetrahedronGeometry args={[0.17, 0]} />
          <meshStandardMaterial color={TEAL} emissive={TEAL}
            emissiveIntensity={0.25 + energy * 0.4} metalness={0.6} roughness={0.25} wireframe />
        </mesh>
      </group>

      {commands && (
        <Text position={[0, -0.3, 0]} fontSize={0.085}
          color={live ? RED : WHITE} anchorX="center" outlineWidth={0.005} outlineColor="#0B0D14">
          {commands.map(cmdLabel).filter(Boolean).join("  +  ")}
        </Text>
      )}
    </group>
  );
}

function cmdLabel(c: CentralCommand): string {
  const M: Partial<Record<CentralCommand, string>> = {
    execute: "EXECUTE", selectA: "STREAM A", selectB: "STREAM B",
    reverse: "REVERSE", repeat: "REPEAT", mirror: "MIRROR",
    mirrorSpatial: "MIRROR + FLIP", skip: "SKIP", replace: "REPLACE",
    branchLeft: "BRANCH LEFT", branchRight: "BRANCH RIGHT", combine: "COMBINE",
    oppositeHand: "OPPOSITE HAND", oppositeCue: "OPPOSITE CUE",
    wait: "WAIT", hold: "HOLD", resume: "RESUME", cancel: "CANCEL",
    switchStream: "SWITCH",
  };
  return M[c] ?? "";
}

/** EXECUTION PADS — six of them. Two hands, three bands. */
function Pad({ step, pos, active, pending }: { step: PlanStep; pos: [number, number, number]; active: boolean; pending: boolean }) {
  const isRight = step.hand === "right";
  const color = isRight ? PURPLE : TEAL;
  const m = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (m.current) {
      m.current.position.set(pos[0], pos[1], pos[2]);
      const p = active ? 1 + Math.sin(clock.elapsedTime * 7) * 0.07 : 1;
      m.current.scale.setScalar(p);
    }
  });
  return (
    <group>
      <mesh ref={m}>
        {step.action === "catch" || step.action === "hold"
          ? <torusGeometry args={[0.11, 0.028, 10, 24]} />
          : <boxGeometry args={[0.19, 0.19, 0.05]} />}
        <meshStandardMaterial
          color={step.action === "inhibit" ? RED : color}
          emissive={step.action === "inhibit" ? RED : color}
          // A PENDING target is visible but NOT yours yet. It is dim and hollow —
          // legible enough to plan around, tempting enough to be a real test.
          emissiveIntensity={active ? 0.9 : pending ? 0.12 : 0.35}
          wireframe={pending && !active}
          transparent
          opacity={pending && !active ? 0.45 : 1}
        />
      </mesh>
      <Text position={[pos[0], pos[1], pos[2] + 0.05]} fontSize={0.055}
        color={active ? WHITE : GRAY} anchorX="center">
        {ACTION_SYMBOL[step.action]}
      </Text>
    </group>
  );
}

export function SequenceRunner({
  settings, seed, onComplete, onExit,
}: {
  settings: SeqSettings;
  seed: number;
  onComplete: (m: SeqMetrics) => void;
  onExit: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const engine = useMemo(() => new SequenceEngine(settings, seed), [settings, seed]);
  const tune = useMemo(() => tuningFor(settings.tier, settings.mode, settings.custom), [settings]);
  const [snap, setSnap] = useState<SeqSnapshot>(() => engine.snapshot());
  const done = useRef(false);

  const lc = useXRInputSourceState("controller", "left");
  const rc = useXRInputSourceState("controller", "right");
  const lh = useXRInputSourceState("hand", "left");
  const rh = useXRInputSourceState("hand", "right");

  const prev = useRef<Record<Hand, THREE.Vector3 | null>>({ left: null, right: null });
  const hands = useRef<Record<Hand, HandInput>>({
    left: { pos: [-0.9, 1.3, -0.2], vel: [0, 0, 0], gripping: false },
    right: { pos: [0.9, 1.3, -0.2], vel: [0, 0, 0], gripping: false },
  });
  const lastEv = useRef(0);

  useEffect(() => {
    engine.start(performance.now());
    return engine.subscribe(setSnap);
  }, [engine]);

  useFrame((_, dt) => {
    if (done.current) return;
    const now = performance.now();
    const src: Record<Hand, { obj?: THREE.Object3D; grip: boolean; haptic?: (i: number, d: number) => void }> = {
      left: {
        obj: lc?.object ?? lh?.object,
        grip: lc?.gamepad?.["xr-standard-squeeze"]?.state === "pressed"
          || lc?.gamepad?.["xr-standard-trigger"]?.state === "pressed",
        haptic: lc?.inputSource?.gamepad?.hapticActuators?.[0]
          ? (i: number, d: number) => lc.inputSource.gamepad!.hapticActuators![0].pulse(i, d) : undefined,
      },
      right: {
        obj: rc?.object ?? rh?.object,
        grip: rc?.gamepad?.["xr-standard-squeeze"]?.state === "pressed"
          || rc?.gamepad?.["xr-standard-trigger"]?.state === "pressed",
        haptic: rc?.inputSource?.gamepad?.hapticActuators?.[0]
          ? (i: number, d: number) => rc.inputSource.gamepad!.hapticActuators![0].pulse(i, d) : undefined,
      },
    };
    const tmp = new THREE.Vector3();
    for (const h of ["left", "right"] as Hand[]) {
      const o = src[h].obj;
      if (o) {
        o.getWorldPosition(tmp);
        const p = prev.current[h];
        if (p && dt > 0) hands.current[h].vel = [(tmp.x - p.x) / dt, (tmp.y - p.y) / dt, (tmp.z - p.z) / dt];
        hands.current[h].pos = [tmp.x, tmp.y, tmp.z];
        prev.current[h] = tmp.clone();
      }
      hands.current[h].gripping = src[h].grip;
    }

    engine.tick(now, hands.current);

    // TIERED HAPTICS (§44). Fires on resolution only. Never before a response,
    // and never in a way that could disclose what the next correct action is.
    if (engine.events.length > lastEv.current) {
      const e = engine.events[engine.events.length - 1];
      lastEv.current = engine.events.length;
      const hp = e.actualHand ? src[e.actualHand].haptic : undefined;
      if (hp && tune.haptics > 0) {
        if (e.critical) hp(Math.max(0.7, tune.haptics), 130);
        else if (e.correct) hp(tune.haptics * 0.6, 25);
      }
    }

    if (engine.isFinished() && !done.current) {
      done.current = true;
      onComplete(computeSeqMetrics(engine, settings));
    }
  });

  const energy = Math.min(1, snap.streak / 25);
  const inExec = snap.phase === "execute";

  return (
    <group>
      {/* ENVIRONMENTAL ESCALATION (§42) — light and depth only. Target contrast
          and legibility are held EXACTLY constant, because the instant the
          chamber starts obscuring the task, the reaction times stop meaning
          anything and the whole instrument is worthless. */}
      <ambientLight intensity={0.3 + energy * 0.12} />
      <pointLight position={[0, 3, -2.2]} intensity={1.4 + energy * 1.6} color={PURPLE} distance={16} />
      <pointLight position={[-2.6, 1.5, -1]} intensity={0.4 + energy * 0.5} color={TEAL} distance={10} />
      <pointLight position={[2.6, 1.5, -1]} intensity={0.4 + energy * 0.5} color={PURPLE} distance={10} />

      {/* PERIPHERAL CUE RING */}
      {snap.liveCues.map((c) => <CueMesh key={c.id} cue={c} />)}

      {/* CENTRAL DECISION CORE */}
      <DecisionCore commands={snap.visibleCommand} streak={snap.streak} live={snap.liveUpdateMs > 0} />

      {/* INTERFERENCE — visual noise during the retention delay. It must be
          ignored. It never appears where a cue or a pad is, so it degrades
          memory rather than vision. */}
      {snap.interference > 0 && Array.from({ length: Math.round(snap.interference * 10) }).map((_, i) => (
        <mesh key={i} position={[
          Math.sin(i * 2.4 + snap.tMs / 400) * 0.7,
          1.5 + Math.cos(i * 1.7 + snap.tMs / 500) * 0.35,
          -1.62,
        ]}>
          <tetrahedronGeometry args={[0.035, 0]} />
          <meshBasicMaterial color={GRAY} transparent opacity={0.4} wireframe />
        </mesh>
      ))}

      {/* EXECUTION PADS */}
      {inExec && snap.targets.map((s) => {
        const cur = snap.cursor[s.stream];
        const streamSteps = snap.targets.filter((x) => x.stream === s.stream);
        const active = streamSteps.length > 0 && s.slot === Math.min(...streamSteps.map((x) => x.slot));
        return (
          <Pad key={`${s.slot}-${s.cueId}`} step={s} pos={engine.targetPos(s)}
            active={active} pending={!active} />
        );
      })}

      {/* PREVIEW — the resolved plan, shown back. Low tiers only (§27). */}
      {snap.preview && (
        <group position={[0, 0.72, -1.55]}>
          {snap.preview.map((s, i) => (
            <group key={i} position={[(i - (snap.preview!.length - 1) / 2) * 0.18, 0, 0]}>
              <mesh>
                {s.hand === "right"
                  ? <octahedronGeometry args={[0.05, 0]} />
                  : <boxGeometry args={[0.075, 0.075, 0.075]} />}
                <meshStandardMaterial
                  color={s.hand === "right" ? PURPLE : TEAL}
                  emissive={s.hand === "right" ? PURPLE : TEAL} emissiveIntensity={0.7} />
              </mesh>
              <Text position={[0, -0.09, 0]} fontSize={0.04} color={GRAY} anchorX="center">
                {ACTION_SYMBOL[s.action]}
              </Text>
            </group>
          ))}
        </group>
      )}

      <SequenceHUD snap={snap} tier={settings.tier} mode={settings.mode} />

      <SessionControlDock
        label={`SEQUENCE COMMAND · ${settings.tier.toUpperCase()}`}
        paused={paused}
        onPause={() => { engine.setPaused(true); setPaused(true); }}
        onResume={() => { engine.setPaused(false); setPaused(false); }}
        onExit={() => { engine.stop(); onExit(); }}
      />
    </group>
  );
}

/** HUD lives in the far upper periphery. The centre stays clear — no fixation point. */
function SequenceHUD({ snap, tier, mode }: { snap: SeqSnapshot; tier: string; mode: string }) {
  const contacts = snap.events.filter((e) => e.precisionZone);
  const centrePct = contacts.length
    ? Math.round((contacts.filter((e) => e.precisionZone === "perfect").length / contacts.length) * 100)
    : 0;
  const mm = Math.floor(snap.mainRemainingMs / 60000);
  const ss = Math.floor((snap.mainRemainingMs % 60000) / 1000);
  const bonus = snap.sessionPhase === "bonus";

  const PHASE_LABEL: Record<string, string> = {
    encode: "WATCH", delay: "HOLD", command: "READ",
    preview: "PLAN", execute: "GO", result: "",
  };

  return (
    <group>
      {/* The HUD sits OUTSIDE the cue ring, angled inward. It must never compete
          with a peripheral cue for attention — that would corrupt the very thing
          this drill measures. */}
      <group position={[-2.05, 1.62, -1.35]} rotation={[0, 0.62, 0]}>
        <Text position={[0, 0.12, 0]} fontSize={0.09} color={WHITE} anchorX="center">
          {bonus ? `STAGE ${snap.bonusStage}` : `${mm}:${String(ss).padStart(2, "0")}`}
        </Text>
        <Text position={[0, 0.005, 0]} fontSize={0.04} color={GRAY} anchorX="center">
          {bonus ? "BONUS" : `${tier.toUpperCase()}${mode === "assessment" ? " · ASSESS" : ""}`}
        </Text>
      </group>

      <group position={[2.05, 1.62, -1.35]} rotation={[0, -0.62, 0]}>
        <Text position={[0, 0.12, 0]} fontSize={0.09} color={WHITE} anchorX="center">
          {snap.score.toLocaleString()}
        </Text>
        <Text position={[0, 0.005, 0]} fontSize={0.04}
          color={snap.streak >= 5 ? TEAL : GRAY} anchorX="center">
          {snap.streak > 0 ? `${snap.streak} PERFECT` : "—"}
        </Text>
        {/* Running localization. The pads here are FIXED, so a live tally is more
            useful than a per-hit tag — and far less clutter in a drill whose whole
            demand is peripheral attention. */}
        <Text position={[0, -0.09, 0]} fontSize={0.032} color={GRAY} anchorX="center">
          {`CENTRE ${centrePct}%`}
        </Text>
      </group>

      {/* The phase word is the ONLY central text, and it disappears during GO so
          it can never sit between the athlete and the pads. */}
      {snap.phase !== "execute" && PHASE_LABEL[snap.phase] && (
        <Text position={[0, 0.62, -1.6]} fontSize={0.06} color={GRAY} anchorX="center">
          {PHASE_LABEL[snap.phase]}
        </Text>
      )}

      {snap.inRecovery && (
        <Text position={[0, 0.5, -1.6]} fontSize={0.055} color={TEAL} anchorX="center">
          {`RESET  ${snap.recoveryStreak}/2`}
        </Text>
      )}
      {bonus && snap.bonusStrikes > 0 && (
        <Text position={[0, 0.5, -1.6]} fontSize={0.055} color={RED} anchorX="center">
          {`${3 - snap.bonusStrikes} STRIKES LEFT`}
        </Text>
      )}
    </group>
  );
}
