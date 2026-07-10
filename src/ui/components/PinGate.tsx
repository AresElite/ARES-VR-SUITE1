import { useState } from "react";
import { useAppStore } from "@/app/providers/appStore";
import { ORG_NAME } from "@/ares/constants";

/**
 * PinGate — universal org/clinic unlock. The headset stays logged into one
 * provider org; the PIN unlocks the app for a session. After unlock, the
 * trainer connects the athlete's profile on the dashboard.
 *
 * PHASE 1 PROTOTYPE: a local unlock only. Phase 2 replaces this with real
 * provider auth and never stores PHI on the device.
 */
export function PinGate() {
  const unlockOrg = useAppStore((s) => s.unlockOrg);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const press = (d: string) => {
    setError(false);
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      if (!unlockOrg(next)) {
        setError(true);
        setTimeout(() => setPin(""), 400);
      }
    }
  };
  const clear = () => { setPin(""); setError(false); };

  return (
    <div className="pin-overlay">
      <div className="pin-card">
        <img className="pin-logo" src="/brand/aesv-logo.png" alt="AESV" />
        <p className="pin-kicker">{ORG_NAME}</p>
        <h1 className="pin-title">Enter org PIN</h1>
        <p className="pin-sub">Unlock this headset for a training session.</p>
        <div className={`pin-dots${error ? " err" : ""}`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`pin-dot${i < pin.length ? " on" : ""}`} />
          ))}
        </div>
        {error && <p className="pin-err">Incorrect PIN — try again</p>}
        <div className="pin-pad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} className="pin-key" onClick={() => press(d)}>{d}</button>
          ))}
          <button className="pin-key pin-key-ghost" onClick={clear}>CLR</button>
          <button className="pin-key" onClick={() => press("0")}>0</button>
          <span />
        </div>
        <p className="pin-note">PHASE 1 PROTOTYPE — local unlock only, no data transmitted.</p>
      </div>
    </div>
  );
}
