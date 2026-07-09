import { isXRInputSourceState } from "@react-three/xr";
import type { Hand, SliceDirection } from "@/ares/drillTypes";

/**
 * InputMapper — normalizes XR / desktop pointer input into drill actions.
 * Controller & hand pointer events carry an XRInputSourceState in
 * `event.pointerState`; desktop mouse events do not.
 */
export function handFromPointerEvent(e: unknown): Hand {
  const evt = e as { pointerState?: unknown };
  const ps = evt?.pointerState;
  if (ps && isXRInputSourceState(ps)) {
    const handedness = ps.inputSource?.handedness;
    if (handedness === "left" || handedness === "right") return handedness;
  }
  return "unknown";
}

/** Classify a movement vector into an 8-way slice direction (view plane). */
export function sliceDirectionFromDelta(dx: number, dy: number): SliceDirection {
  const angle = Math.atan2(dy, dx); // -PI..PI, 0 = +x (right)
  const oct = Math.round(angle / (Math.PI / 4));
  switch (((oct % 8) + 8) % 8) {
    case 0:
      return "right";
    case 1:
      return "upRight";
    case 2:
      return "up";
    case 3:
      return "upLeft";
    case 4:
      return "left";
    case 5:
      return "downLeft";
    case 6:
      return "down";
    default:
      return "downRight";
  }
}

export function handSatisfiesRule(hand: Hand, rule?: "left" | "right" | "either" | "both"): boolean {
  if (!rule || rule === "either") return true;
  if (rule === "both") return hand === "both" || hand !== "unknown"; // MVP: any tracked hand counts toward 'both'
  return hand === rule || hand === "unknown"; // desktop fallback can't attribute a hand — don't punish
}
