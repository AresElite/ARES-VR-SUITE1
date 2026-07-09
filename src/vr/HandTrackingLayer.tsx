import { useEffect } from "react";
import { useXRInputSourceState } from "@react-three/xr";
import { useAppStore } from "@/app/providers/appStore";

/**
 * HandTrackingLayer — passive hand-tracking status reporter.
 * Rendering of tracked hands + pinch pointers is handled natively by
 * @react-three/xr; this layer only records real availability inside the
 * session so device info on saved results is accurate. It renders nothing
 * and never breaks the app when hands are unavailable.
 */
export function HandTrackingLayer() {
  const leftHand = useXRInputSourceState("hand", "left");
  const rightHand = useXRInputSourceState("hand", "right");
  const leftCtl = useXRInputSourceState("controller", "left");
  const rightCtl = useXRInputSourceState("controller", "right");

  useEffect(() => {
    const s = useAppStore.getState();
    const handTracking = Boolean(leftHand || rightHand);
    const controllers = Boolean(leftCtl || rightCtl);
    if (
      s.xrSupport.handTrackingLikely !== handTracking ||
      s.xrSupport.controllersLikely !== controllers
    ) {
      s.setXRSupport({
        ...s.xrSupport,
        handTrackingLikely: handTracking || s.xrSupport.handTrackingLikely,
        controllersLikely: controllers || s.xrSupport.controllersLikely,
      });
    }
  }, [leftHand, rightHand, leftCtl, rightCtl]);

  return null;
}
