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

  const NAV = [
    { id: "launch", label: "Launch" },
    { id: "plan", label: "Today's Plan" },
    { id: "config", label: "Session Config" },
    { id: "loop", label: "Performance Loop" },
    { id: "library", label: "Drill Library" },
    { id: "history", label: "Session History" },
  ];
  const jump = (id: string) =>
    document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="portal-shell">
      {/* sidebar — portal language: glass rail, brand block, mono labels */}
      <aside className="portal-aside">
        <div className="portal-brand">
          <img src="/brand/aesv-logo.png" alt="AESV" />
          <div>
            <div className="brand-top">ARES ELITE</div>
            <div className="brand-sub">Sports Vision · VR Suite</div>
          </div>
        </div>
        <div className="portal-nav">
          <div className="portal-nav-label">Suite</div>
          {NAV.map((n) => (
            <div key={n.id} className="portal-nav-item" onClick={() => jump(n.id)}>
              <span className="dot" style={{ background: "var(--ares-teal)" }} />
              {n.label}
            </div>
          ))}
          <div className="portal-nav-label">Phases</div>
          {ARES_ALL_PHASES.map((p) => (
            <div key={p} className="portal-nav-item" onClick={() => jump("library")}>
              <span className="dot" style={{ background: PHASE_META[p].color }} />
              {p}
            </div>
          ))}
        </div>
        <div className="portal-aside-foot">{APP_VERSION.toUpperCase()}</div>
      </aside>

      <main className="portal-main">
        {/* sticky topbar with mono breadcrumb */}
        <div className="portal-topbar">
          <div className="portal-crumb">
            <span className="tag">A.R.E.S.</span>
            <span className="sep">/</span>
            <span className="page">VR Performance Suite</span>
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.18em",
              color: "var(--ares-dim)",
            }}
          >
            {ORG_NAME.toUpperCase()}
          </span>
        </div>

        <div className="portal-content">
        <section id="sec-launch">
        <p className="ares-kicker">{ORG_NAME}</p>
        <h1 className="portal-hero-h1">
          A.R.E.S. <span style={{ background: "var(--grad-brand-3)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>VR</span> Performance Suite
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

        <div className="num-tile-row">
          <div className="num-tile"><div className="n">{ALL_DRILLS.length}</div><div className="l">Drills</div></div>
          <div className="num-tile"><div className="n">{ALL_DRILLS.reduce((a, d) => a + d.levels.length, 0)}</div><div className="l">Progression levels</div></div>
          <div className="num-tile"><div className="n">6</div><div className="l">Suites — Loop + Assess + Perform</div></div>
          <div className="num-tile"><div className="n">1M+</div><div className="l">Simulated QA reps</div></div>
        </div>

        <div style={{ marginTop: 20 }}>
          <SupportBadges />
        </div>
        </section>

        <h2 className="portal-h2" id="sec-config">Session configuration</h2>
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

        <h2 className="portal-h2" id="sec-plan">Today's prescribed session</h2>
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

        <h2 className="portal-h2" id="sec-loop">The A.R.E.S. Performance Loop</h2>
        <div className="ares-grid">
          {ARES_ALL_PHASES.map((p) => {
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

        <h2 className="portal-h2" id="sec-library">Drill library</h2>
        <div className="ares-grid">
          {ARES_ALL_PHASES.map((p) => {
            const meta = PHASE_META[p];
            return (
              <div className="ares-card" key={`lib-${p}`}>
                <h3 style={{ color: meta.color }}>{p}</h3>
                <ul className="drill-list">
                  {drillsForPhase(p).map((d) => (
                    <li key={d.id}>
                      <span className="dot" style={{ background: meta.color }} />
                      {d.name}
                      <span className="lv">{d.assessment ? "PROTOCOL" : d.phase === "Perform" ? "12 LV" : "25 LV"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {lastFinished && (
          <>
            <h2 className="portal-h2">Last session</h2>
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

        <h2 className="portal-h2" id="sec-history">Local session history</h2>
        <HistoryTable />

        <p className="footer-note">
          {APP_NAME} · <b style={{ color: "var(--ares-teal-200)", fontWeight: 600 }}>{APP_VERSION}</b> ·
          A.R.E.S. Immersive Performance Engine · WebXR requires HTTPS — use the Netlify deploy URL
          in the Meta Quest Browser. Results stored locally, EMR-sync ready.
        </p>
        </div>
      </main>
    </div>
  );
}
