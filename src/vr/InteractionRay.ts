/**
 * InteractionRay — pointer configuration for the suite.
 *
 * @react-three/xr v6 attaches ray pointers to controllers and pinch pointers
 * to tracked hands automatically; every mesh onClick/onPointerOver in the
 * scene works with controller trigger, hand pinch, and desktop mouse without
 * per-drill input code. This module centralizes the store options so pointer
 * behavior stays consistent across the app.
 */
import type { XRStoreOptions } from "@react-three/xr";

export function pointerStoreOptions(frameBufferScaling: number, foveation: number): XRStoreOptions {
  return {
    foveation,
    frameBufferScaling,
    // Defaults: controllers + hands rendered with ray/pinch pointers.
    hand: { rayPointer: { rayModel: { color: "#7FD3DE", opacity: 0.6 } } },
    controller: { rayPointer: { rayModel: { color: "#7FD3DE", opacity: 0.7 } } },
  };
}
