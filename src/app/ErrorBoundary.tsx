import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * NEVER FAIL TO A BLACK VOID.
 *
 * When a React error escapes, the tree unmounts — and in an R3F app that means
 * the canvas goes away and the athlete, mid-session and wearing a headset, is
 * left staring at nothing. No message, no exit, no idea what happened. That is
 * the worst possible failure mode for this product, and we had it: a conditional
 * hook in the trainer dock blanked the entire Training portal.
 *
 * A crash is now a legible, recoverable event: the athlete sees what broke and a
 * button to get back to the arena, and the trainer has something to report.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; info: string }
> {
  state = { error: null as Error | null, info: "" };

  static getDerivedStateFromError(error: Error) {
    return { error, info: "" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info: (info.componentStack ?? "").split("\n").slice(0, 6).join("\n") });
    // eslint-disable-next-line no-console
    console.error("[A.R.E.S.] render error:", error, info.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#0B0D14", color: "#E8E9F0",
          fontFamily: "ui-monospace, monospace", padding: "2rem", textAlign: "left",
        }}
      >
        <div style={{ maxWidth: 720, width: "100%" }}>
          <div style={{ color: "#FF4D6D", fontSize: 14, letterSpacing: 2, marginBottom: 8 }}>
            SESSION INTERRUPTED
          </div>
          <div style={{ fontSize: 20, marginBottom: 20, color: "#C9A6FF" }}>
            A.R.E.S. hit a rendering error and stopped safely.
          </div>
          <pre style={{
            background: "#14161F", border: "1px solid #2A2E3E", borderRadius: 8,
            padding: 16, fontSize: 12, color: "#FF9F1C",
            whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 8,
          }}>
            {error.message}
          </pre>
          {info && (
            <pre style={{
              background: "#14161F", border: "1px solid #2A2E3E", borderRadius: 8,
              padding: 16, fontSize: 11, color: "#6A7086",
              whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 20,
            }}>
              {info.trim()}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "#8B5CF6", color: "#fff", border: "none",
              borderRadius: 8, padding: "12px 28px", fontSize: 15,
              cursor: "pointer", letterSpacing: 1,
            }}
          >
            RETURN TO ARENA
          </button>
        </div>
      </div>
    );
  }
}
