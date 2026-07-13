import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { XR, XROrigin, createXRStore, useXR } from "@react-three/xr";
import { useAppStore } from "@/app/providers/appStore";
import { AegisSession, AegisSetup, AegisResultsPanel } from "@/vr/AegisSession";
import { SequenceSession, SequenceSetup, SequenceResultsPanel } from "@/vr/SequenceSession";
import { KeystoneSession, KeystoneSetup, KeystoneResultsPanel } from "@/vr/KeystoneSession";
import { drillById } from "@/drills/registry";
import { PERF_MODES, defaultPerfMode } from "@/utils/performance";
import { pointerStoreOptions } from "./InteractionRay";
import { ArenaEnvironment } from "./ArenaEnvironment";
import { VRPerformanceArena } from "./VRPerformanceArena";
import { TrainerControlDock } from "./TrainerControlDock";
import { SafetyBoundary } from "./SafetyBoundary";
import { DrillRunner } from "./DrillRunner";
import { AthleteHUD } from "./AthleteHUD";
import { PostDrillPanel } from "./PostDrillPanel";
import { HandTrackingLayer } from "./HandTrackingLayer";

/**
 * XRRoot — one Canvas, one XR store, every mode.
 * The same scene graph serves immersive VR (Quest Browser) and the desktop
 * fallback (mouse pointer + orbit look) for fast development iteration.
 */

const initialPerf = PERF_MODES[defaultPerfMode()];
export const xrStore = createXRStore(
  pointerStoreOptions(initialPerf.frameBufferScaling, initialPerf.foveation),
);

// Notify the DOM layer when the immersive session ends (Quest home button etc.)
let hadSession = false;
xrStore.subscribe((state) => {
  const has = Boolean(state.session);
  if (hadSession && !has) {
    window.dispatchEvent(new Event("ares-xr-session-ended"));
  }
  hadSession = has;
});

function DesktopControls() {
  const inSession = useXR((s) => s.session);
  if (inSession) return null;
  return (
    <OrbitControls
      target={[0, 1.5, -2]}
      enablePan={false}
      enableZoom={false}
      rotateSpeed={-0.4}
      dampingFactor={0.12}
    />
  );
}

function SceneContent() {
  const arenaMode = useAppStore((s) => s.arenaMode);
  const drillId = useAppStore((s) => s.drillId);
  const seated = useAppStore((s) => s.seated);
  const def = drillId ? drillById(drillId) : undefined;
  const environment = (arenaMode === "drill" || arenaMode === "calibration") && def ? def.environment : "arena";

  return (
    <>
      <XROrigin position={[0, seated ? 0.45 : 0, 0]} />
      <HandTrackingLayer />
      <ArenaEnvironment environment={environment} />
      {arenaMode === "home" && <VRPerformanceArena />}
      {arenaMode === "setup" && <TrainerControlDock />}
      {arenaMode === "calibration" && <SafetyBoundary />}
      {arenaMode === "drill" && (
        <>
          <DrillRunner />
          <AthleteHUD />
        </>
      )}
      {arenaMode === "keySetup" && <KeystoneSetup />}
      {arenaMode === "keystone" && <KeystoneSession />}
      {arenaMode === "keyResults" && <KeystoneResultsPanel />}
      {arenaMode === "seqSetup" && <SequenceSetup />}
      {arenaMode === "sequence" && <SequenceSession />}
      {arenaMode === "seqResults" && <SequenceResultsPanel />}
      {arenaMode === "aegisSetup" && <AegisSetup />}
      {arenaMode === "aegis" && <AegisSession />}
      {arenaMode === "aegisResults" && <AegisResultsPanel />}
      {arenaMode === "results" && <PostDrillPanel />}
    </>
  );
}

export function XRRoot() {
  return (
    <Canvas
      camera={{ position: [0, 1.6, 0.01], fov: 70 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      dpr={[1, 1.5]}
      style={{ position: "fixed", inset: 0, background: "#0B0F2A" }}
    >
      <XR store={xrStore}>
        <Suspense fallback={null}>
          <SceneContent />
        </Suspense>
        <DesktopControls />
      </XR>
    </Canvas>
  );
}
