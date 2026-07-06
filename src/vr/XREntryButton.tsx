import { useAppStore } from "@/app/providers/appStore";
import { xrStore } from "./XRRoot";
import { sfx } from "@/utils/audio";

/**
 * XREntryButton — DOM button that starts an immersive-vr session.
 * Only rendered when immersive VR is actually supported (QA requirement).
 */
export function XREntryButton({ onEnter }: { onEnter?: () => void }) {
  const support = useAppStore((s) => s.xrSupport);
  if (!support.checked || !support.immersiveVRSupported) return null;

  return (
    <button
      className="ares-btn ares-btn-primary ares-btn-xl"
      onClick={() => {
        sfx.unlock();
        sfx.portal();
        onEnter?.();
        void xrStore.enterVR();
      }}
    >
      ⬢ ENTER IMMERSIVE VR
    </button>
  );
}
