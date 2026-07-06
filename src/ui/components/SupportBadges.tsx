import { useAppStore } from "@/app/providers/appStore";
import { detectHeadset } from "@/utils/questDetection";

/** WebXR capability report — required to be explicit and visible. */
export function SupportBadges() {
  const s = useAppStore((st) => st.xrSupport);
  const headset = detectHeadset();

  if (!s.checked) return <span className="badge warn">Checking WebXR…</span>;

  return (
    <div>
      <span className={`badge ${s.webXRSupported ? "ok" : "bad"}`}>
        WebXR {s.webXRSupported ? "supported" : "not supported"}
      </span>
      <span className={`badge ${s.immersiveVRSupported ? "ok" : "bad"}`}>
        Immersive VR {s.immersiveVRSupported ? "supported" : "not supported"}
      </span>
      <span className={`badge ${s.handTrackingLikely ? "ok" : "warn"}`}>
        Hand tracking {s.handTrackingLikely ? "available" : "unavailable"}
      </span>
      <span className={`badge ${s.controllersLikely ? "ok" : "warn"}`}>
        Controllers {s.controllersLikely ? "available" : "unavailable"}
      </span>
      <span className="badge ok">Desktop fallback available</span>
      <span className={`badge ${s.secureContext ? "ok" : "bad"}`}>
        {s.secureContext ? "Secure context (HTTPS)" : "Insecure context — WebXR blocked"}
      </span>
      <span className="badge warn">Device: {headset}</span>
    </div>
  );
}
