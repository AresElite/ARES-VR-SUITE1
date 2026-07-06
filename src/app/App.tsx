import { XRRoot } from "@/vr/XRRoot";
import { ScreenRouter } from "./routes/ScreenRouter";

/**
 * A.R.E.S. VR Performance Suite — app shell.
 * The 3D arena canvas is always mounted; the DOM layer (landing dashboard,
 * exit chip) floats above it. Inside an immersive session the DOM disappears
 * automatically and the arena takes over.
 */
export default function App() {
  return (
    <>
      <XRRoot />
      <ScreenRouter />
    </>
  );
}
