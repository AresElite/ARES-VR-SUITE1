import { useEffect, useState } from "react";
import { useAppStore } from "@/app/providers/appStore";
import { detectXRSupport } from "@/utils/xrSupport";
import { LandingDashboard } from "@/ui/components/LandingDashboard";

/**
 * ScreenRouter — DOM-level view state.
 * "landing"  → branded dashboard over the (paused) arena
 * "immersive"→ overlay hidden; the canvas is the app (VR or desktop 3D)
 */
export function ScreenRouter() {
  const [view, setView] = useState<"landing" | "immersive">("landing");
  const setXRSupport = useAppStore((s) => s.setXRSupport);

  useEffect(() => {
    let mounted = true;
    detectXRSupport().then((info) => {
      if (mounted) setXRSupport(info);
    });
    return () => {
      mounted = false;
    };
  }, [setXRSupport]);

  // When an XR session ends, Quest users land back on the dashboard.
  useEffect(() => {
    const onEnd = () => setView("landing");
    window.addEventListener("ares-xr-session-ended", onEnd);
    return () => window.removeEventListener("ares-xr-session-ended", onEnd);
  }, []);

  if (view === "landing") {
    return <LandingDashboard onEnterDesktop={() => setView("immersive")} />;
  }

  return (
    <div className="exit-chip">
      <button className="ares-btn ares-btn-ghost" onClick={() => setView("landing")}>
        ⏏ Dashboard
      </button>
    </div>
  );
}
