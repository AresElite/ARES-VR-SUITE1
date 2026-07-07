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
import { AresController, AresHand } from "./AresHands";

export function pointerStoreOptions(frameBufferScaling: number, foveation: number): XRStoreOptions {
  return {
    foveation,
    frameBufferScaling,
    // Hand identity everywhere: RIGHT = purple, LEFT = teal
    controller: AresController,
    hand: AresHand,
  };
}
