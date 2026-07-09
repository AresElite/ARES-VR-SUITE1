import { ARES_ALL_PHASES, PHASE_META } from "@/ares/phases";
import { APP_NAME, APP_VERSION, ORG_NAME } from "@/ares/constants";
import { useAppStore } from "@/app/providers/appStore";
import { drillsForPhase, ALL_DRILLS } from "@/drills/registry";
import { MOCK_ATHLETES } from "@/data/mockAthletes";
import { PERF_MODES, type PerfModeId } from "@/utils/performance";
import { aqBand } from "@/ares/aq";
import { buildPrescription } from "@/prescribe/prescription";
import { XREntryButton } from "@/vr/XREntryButton";
import { SupportBadges } from "./SupportBadges";
import { HistoryTable } from "./HistoryTable";

/**
 * LandingDashboard — the polished Ares-branded landing screen and desktop
 * testing dashboard. Trainers configure everything here before the athlete
 * puts the headset on.
 */
export function LandingDashboard({ onEnterDesktop }: { onEnterDesktop: () => void }) {
  const athlete = useAppStore((s) => s.athlete);
  const perfModeId = useAppStore((s) => s.perfModeId);
  const lastFinished = useAppStore((s) => s.lastFinished);
  const lastSyncMessage = useAppStore((s) => s.lastSyncMessage);
  const sessions = useAppStore((s) => s.sessions);
  const { setAthlete, setPerfMode } = useAppStore.getState();

  return (
    <div className="ares-overlay">
      <div className="ares-shell">
        <img className="ares-logo" src="/brand/aesv-logo.png" alt="Ares Elite Sports Vision" />
        <p className="ares-kicker">{ORG_NAME}</p>
        <h1 className="ares-title">
          A.R.E.S. <span className="accent">VR</span> Performance Suite
        </h1>
        <p className="ares-loopline">
          <b>Acquire</b> · <b>Route</b> · <b>Execute</b> · <b>Synchronize</b>
        </p>
        <p className="ares-sub">
          The immersive operating system for elite sports vision and neuro-performance. The same
          A.R.E.S. drill logic, progression structure, and AQ scoring as the performance-lab
          touchscreen suite — translated into a WebXR arena for Meta Quest.
        </p>

        <div className="ares-cta-row">
          <XREntryButton />
          <button className="ares-btn" onClick={onEnterDesktop}>
            ▷ Desktop testing mode
          </button>
        </div>

        <div className="stat-strip">
          <div className="stat"><span className="stat-n">{ALL_DRILLS.length}</span><span className="stat-l">Drills</span></div>
          <div className="stat"><span className="stat-n">{ALL_DRILLS.reduce((a, d) => a + d.levels.length, 0)}</span><span className="stat-l">Progression levels</span></div>
          <div className="stat"><span className="stat-n">6</span><span className="stat-l">Suites (Loop + Assess + Perform)</span></div>
          <div className="stat"><span className="stat-n">547k+</span><span className="stat-l">Simulated QA reps</span></div>
        </div>

        <div style={{ marginTop: 20 }}>
          <SupportBadges />
        </div>

        <p className="ares-section-title">Session configuration</p>
        <div className="ares-grid">
          <div className="ares-card">
            <h3 style={{ color: "var(--ares-teal-bright)" }}>Athlete</h3>
            <label className="ares-label" htmlFor="athlete-select">
              Active athlete / quick test
            </label>
            <select
              id="athlete-select"
              value={athlete.id}
              onChange={(e) =>
                setAthlete(MOCK_ATHLETES.find((a) => a.id === e.target.value) ?? MOCK_ATHLETES[0])
              }
            >
              {MOCK_ATHLETES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} {a.sport !== "—" ? `(${a.sport})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="ares-card">
            <h3 style={{ color: "var(--ares-teal-bright)" }}>Performance mode</h3>
            <label className="ares-label" htmlFor="perf-select">
              Quest hardware safeguard
            </label>
            <select
              id="perf-select"
              value={perfModeId}
              onChange={(e) => setPerfMode(e.target.value as PerfModeId)}
            >
              {Object.values(PERF_MODES).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <p style={{ marginTop: 10 }}>
              Frame-rate stability is the top priority. Modes trade visual density for timing
              accuracy.
            </p>
          </div>
        </div>

        <p className="ares-section-title">Today's prescribed session</p>
        <div className="ares-card">
          <h3 style={{ color: "var(--ares-purple-glow, #8B5CF6)" }}>
            The closed loop — assessment drives training
          </h3>
          <ul className="drill-list">
            {buildPrescription(sessions, athlete.id).map((item, i) => (
              <li key={item.drillId}>
                <span className="dot" style={{ background: "#8B5CF6" }} />
                <b>{i + 1}. {item.drillName}</b>
                {` — ${item.reason}`}
                <span className="lv">LV {item.level}</span>
              </li>
            ))}
          </ul>
          <p style={{ marginTop: 10 }}>
            Recomputed after every session. Weakest visual-cognitive systems first, each at the
            level targeting ~80% success — the optimal challenge point.
          </p>
        </div>

        <p className="ares-section-title">The A.R.E.S. Performance Loop</p>
        <div className="ares-grid">
          {ARES_ALL_PHASES.filter((p) => p !== "Sport").map((p) => {
            const meta = PHASE_META[p];
            const drills = drillsForPhase(p);
            return (
              <div className="ares-card" key={p}>
                <h3 style={{ color: meta.color }}>{p}</h3>
                <div className="big" style={{ color: meta.color }}>
                  {drills.length}
                </div>
                <p>
                  {meta.tagline}. {drills.filter((d) => d.mvp).length} MVP drill(s),{" "}
                  {drills.filter((d) => !d.mvp).length} scaffolded prototype(s).
                </p>
              </div>
            );
          })}
        </div>

        <p className="ares-section-title">Drill library</p>
        <div className="ares-grid">
          {ARES_ALL_PHASES.filter((p) => p !== "Sport").map((p) => {
            const meta = PHASE_META[p];
            return (
              <div className="ares-card" key={`lib-${p}`}>
                <h3 style={{ color: meta.color }}>{p}</h3>
                <ul className="drill-list">
                  {drillsForPhase(p).map((d) => (
                    <li key={d.id}>
                      <span className="dot" style={{ background: meta.color }} />
                      {d.name}
                      <span className="lv">{d.assessment ? "PROTOCOL" : d.phase === "Perform" ? "12 LV" : `${d.levels.length} LV`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {lastFinished && (
          <>
            <p className="ares-section-title">Last session</p>
            <div className="ares-card">
              <h3 style={{ color: PHASE_META[lastFinished.result.phase].color }}>
                {lastFinished.result.drillName} — AQ {lastFinished.result.aq.overall ?? "—"} (
                {aqBand(lastFinished.result.aq.overall)})
              </h3>
              <p>
                {lastFinished.result.metrics.accuracyPct}% accuracy ·{" "}
                {lastFinished.result.metrics.avgReactionMs ?? "—"}ms avg reaction ·{" "}
                {lastFinished.recommendation.headline}: {lastFinished.recommendation.detail}
              </p>
              {lastSyncMessage && <p style={{ color: "var(--ares-warning-gold)" }}>{lastSyncMessage}</p>}
            </div>
          </>
        )}

        <p className="ares-section-title">Local session history</p>
        <HistoryTable />

        <p className="footer-note">
          {APP_NAME} · <b style={{ color: "var(--ares-teal-200)", fontWeight: 600 }}>{APP_VERSION}</b> ·
          A.R.E.S. Immersive Performance Engine · WebXR requires HTTPS — use the Netlify deploy URL
          in the Meta Quest Browser. PHASE 1 PROTOTYPE — design validation only. Numbers shown are non-validating; production measurement ships in the native build.
        </p>
      </div>
    </div>
  );
}
