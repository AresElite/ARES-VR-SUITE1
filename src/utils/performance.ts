import { detectHeadset } from "./questDetection";

export type PerfModeId = "quest2-safe" | "quest3s-balanced" | "quest3-enhanced";

export interface PerfMode {
  id: PerfModeId;
  label: string;
  /** WebGL framebuffer scale inside XR sessions */
  frameBufferScaling: number;
  /** fixed foveated rendering level 0..1 */
  foveation: number;
  /** decorative star / particle counts in the arena */
  starCount: number;
  /** segments used for spheres/tori — geometry budget */
  sphereSegments: number;
  /** enable soft glow ring animations */
  glow: boolean;
  maxPooledTargets: number;
}

export const PERF_MODES: Record<PerfModeId, PerfMode> = {
  "quest2-safe": {
    id: "quest2-safe",
    label: "Quest 2 Safe Mode",
    frameBufferScaling: 0.9,
    foveation: 1,
    starCount: 120,
    sphereSegments: 12,
    glow: false,
    maxPooledTargets: 16,
  },
  "quest3s-balanced": {
    id: "quest3s-balanced",
    label: "Quest 3S Balanced Mode",
    frameBufferScaling: 1.0,
    foveation: 0.7,
    starCount: 240,
    sphereSegments: 16,
    glow: true,
    maxPooledTargets: 20,
  },
  "quest3-enhanced": {
    id: "quest3-enhanced",
    label: "Quest 3 Enhanced Mode",
    frameBufferScaling: 1.2,
    foveation: 0.4,
    starCount: 400,
    sphereSegments: 24,
    glow: true,
    maxPooledTargets: 24,
  },
};

export function defaultPerfMode(): PerfModeId {
  const forced = import.meta.env.VITE_FORCE_PERF_MODE as PerfModeId | undefined;
  if (forced && forced in PERF_MODES) return forced;
  switch (detectHeadset()) {
    case "Quest 2":
      return "quest2-safe";
    case "Quest 3S":
      return "quest3s-balanced";
    case "Quest 3":
      return "quest3-enhanced";
    default:
      return "quest3s-balanced";
  }
}
