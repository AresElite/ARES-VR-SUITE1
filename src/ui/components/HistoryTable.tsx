import { useAppStore } from "@/app/providers/appStore";
import { PHASE_META } from "@/ares/phases";
import { clearSessions } from "@/data/sessionStore";

/** Local session history — every saved ARESDrillSessionResult. */
export function HistoryTable() {
  const sessions = useAppStore((s) => s.sessions);
  const refresh = useAppStore((s) => s.refreshSessions);

  if (sessions.length === 0) {
    return <p className="ares-sub">No saved sessions yet. Run a drill and save it — results persist locally and stay sync-ready.</p>;
  }

  return (
    <div>
      <table className="ares-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Athlete</th>
            <th>Drill</th>
            <th>Phase</th>
            <th>Level</th>
            <th>Acc</th>
            <th>Avg RT</th>
            <th>AQ</th>
            <th>Recommendation</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((r) => (
            <tr key={r.sessionId}>
              <td>{new Date(r.startedAt).toLocaleString()}</td>
              <td>{r.athleteName ?? "—"}</td>
              <td>{r.drillName}</td>
              <td className="phase" style={{ color: PHASE_META[r.phase].color }}>
                {r.phase}
              </td>
              <td>L{r.progression.level}</td>
              <td>{r.metrics.accuracyPct}%</td>
              <td>{r.metrics.avgReactionMs ? `${r.metrics.avgReactionMs}ms` : "—"}</td>
              <td>{r.aq.overall ?? "—"}</td>
              <td>{r.aq.recommendation ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ares-cta-row">
        <button
          className="ares-btn ares-btn-danger"
          onClick={() => {
            clearSessions();
            refresh();
          }}
        >
          Clear local history
        </button>
      </div>
    </div>
  );
}
