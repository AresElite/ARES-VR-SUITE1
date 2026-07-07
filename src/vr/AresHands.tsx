import { DefaultXRController, DefaultXRHand, useXRInputSourceStateContext } from "@react-three/xr";

/**
 * Hand identity — suite-wide: RIGHT = PURPLE, LEFT = TEAL.
 * Custom controller/hand renderers so rays, cursors, and models carry the
 * athlete's hand color everywhere (menus, drills, assessments).
 */
export const HAND_COLOR = { right: "#8B5CF6", left: "#2998AA" } as const;

export function AresController() {
  const state = useXRInputSourceStateContext("controller");
  const color = state.inputSource.handedness === "right" ? HAND_COLOR.right : HAND_COLOR.left;
  return (
    <DefaultXRController
      rayPointer={{ rayModel: { color, opacity: 0.7 }, cursorModel: { color } }}
      grabPointer={{ cursorModel: { color } }}
    />
  );
}

export function AresHand() {
  const state = useXRInputSourceStateContext("hand");
  const color = state.inputSource.handedness === "right" ? HAND_COLOR.right : HAND_COLOR.left;
  return (
    <DefaultXRHand
      rayPointer={{ rayModel: { color, opacity: 0.6 }, cursorModel: { color } }}
      touchPointer={{ cursorModel: { color } }}
    />
  );
}
