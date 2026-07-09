export interface XRSupportInfo {
  secureContext: boolean;
  webXRSupported: boolean;
  immersiveVRSupported: boolean;
  handTrackingLikely: boolean;
  controllersLikely: boolean;
  checked: boolean;
}

export const EMPTY_XR_SUPPORT: XRSupportInfo = {
  secureContext: false,
  webXRSupported: false,
  immersiveVRSupported: false,
  handTrackingLikely: false,
  controllersLikely: false,
  checked: false,
};

/**
 * Feature-detect WebXR. Real hand-tracking availability is only knowable
 * inside a session; outside we report a device-based expectation.
 */
export async function detectXRSupport(): Promise<XRSupportInfo> {
  const secureContext = window.isSecureContext;
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr) {
    return { ...EMPTY_XR_SUPPORT, secureContext, checked: true };
  }
  let immersiveVRSupported = false;
  try {
    immersiveVRSupported = await xr.isSessionSupported("immersive-vr");
  } catch {
    immersiveVRSupported = false;
  }
  const onQuest = /OculusBrowser|Quest/i.test(navigator.userAgent);
  return {
    secureContext,
    webXRSupported: true,
    immersiveVRSupported,
    handTrackingLikely: onQuest,
    controllersLikely: onQuest || immersiveVRSupported,
    checked: true,
  };
}
