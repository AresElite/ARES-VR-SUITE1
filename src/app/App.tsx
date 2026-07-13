import { XRRoot } from "@/vr/XRRoot";
import { ErrorBoundary } from "./ErrorBoundary";
import { ScreenRouter } from "./routes/ScreenRouter";

/**
 * A.R.E.S. VR Performance Suite — app shell.
 * The 3D arena canvas is always mounted; the DOM layer (landing dashboard,
 * exit chip) floats above it. Inside an immersive session the DOM disappears
 * automatically and the arena takes over.
 */
export default function App() {
  return (
    // A render error must never present as a silent black void to someone wearing
    // a headset. It now shows what broke, and a way back to the arena.
    <ErrorBoundary>
      <XRRoot />
      <ScreenRouter />
    </ErrorBoundary>
  );
}
