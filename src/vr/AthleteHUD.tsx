import { useState } from "react";
import { Text } from "@react-three/drei";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { PHASE_META } from "@/ares/phases";
import { useAppStore } from "@/app/providers/appStore";
import { SessionControlDock } from "./SessionControlDock";

/**
 * ATHLETE HUD — collapsible, and out of the way.
 *
 * It used to be a full scoreboard PANEL parked at [0, 0.78, -1.75], dead ahead, on
 * every single drill. Two problems, and the second one is the serious one:
 *
 *   1. It sat inside the play space. On a pointer drill the athlete is aiming a ray
 *      through the exact volume the scoreboard occupies.
 *   2. On Schulte the grid rendered at z = -1.5 and the panel at z = -1.75 — so the
 *      GRID WAS IN FRONT OF THE MENU. The athlete was reading cells through a
 *      scoreboard. (The grid has also been pushed back 20%, but the panel should
 *      never have been there to collide with in the first place.)
 *
 * So the HUD now behaves like every other drill surface in the suite: a dim one-line
 * strip in the bottom quarter of the field, well below any target, showing only the
 * numbers worth glancing at mid-rep. Look down ~20 degrees and it lifts into the full
 * readout with PAUSE and TRAINER STOP.
 *
 * Gaze-armed rather than reachable, deliberately: a panel you can bump into with a
 * controller is a panel you WILL bump into mid-swing. And no athlete looks 20 degrees
 * down by accident while tracking a target — every target in the suite sits at or
 * above chest height.
 */
export function AthleteHUD() {
  const snapshot = useAppStore((s) => s.snapshot);
  const engine = useAppStore((s) => s.engine);
  const { pauseDrill, resumeDrill, stopDrill } = useAppStore.getState();
  const [, force] = useState(0);

  if (!engine || !snapshot) return null;

  const meta = PHASE_META[engine.definition.phase];
  const secondsLeft = Math.max(0, Math.ceil(snapshot.remainingMs / 1000));
  const stopwatch = engine.definition.stopwatch
    ? `${(Math.max(0, snapshot.elapsedMs - 600) / 1000).toFixed(1)}s`
    : null;
  const paused = snapshot.state === "paused";
  const clock = stopwatch ?? `${secondsLeft}s`;

  // DORMANT: the three numbers an athlete actually glances at. Nothing else.
  const summary = `${clock}   ${snapshot.accuracyPct}%${snapshot.streak > 0 ? `   STK ${snapshot.streak}` : ""}`;

  // ARMED: the full readout, revealed only when they ask for it.
  const detail =
    `${engine.definition.shortName}  ·  ${clock}  ·  HIT ${snapshot.hits}  ·  ERR ${snapshot.errors}  ·  ` +
    `${snapshot.accuracyPct}%  ·  STK ${snapshot.streak}` +
    (snapshot.lastReactionMs ? `  ·  ${Math.round(snapshot.lastReactionMs)}ms` : "");

  return (
    <group>
      {/* A streak milestone is worth surfacing WITHOUT the athlete looking away —
          it is the one piece of feedback that changes behaviour mid-rep. It lives in
          the lower periphery, never in the target field. */}
      {snapshot.streak >= 5 && (
        <Text
          position={[0, 0.92, -1.55]}
          rotation={[-0.3, 0, 0]}
          fontSize={0.045}
          color={snapshot.streak >= 10 ? ARES_ACCENTS.purpleGlow : ARES_ACCENTS.tealBright}
          anchorX="center"
        >
          {`${snapshot.streak} STREAK`}
        </Text>
      )}

      <SessionControlDock
        label={`${engine.definition.shortName}  ·  ${meta.phase.toUpperCase()}`}
        accent={meta.color}
        summary={summary}
        detail={detail}
        paused={paused}
        onPause={() => { pauseDrill(); force((v) => v + 1); }}
        onResume={() => { resumeDrill(); force((v) => v + 1); }}
        onExit={() => stopDrill()}
      />
    </group>
  );
}
