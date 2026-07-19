import type { EnvironmentId, DrillDefinition } from "@/ares/drillTypes";

/**
 * ENVIRONMENT SELECTION
 *
 * Environments are surround-only decoration. They never enter the action volume
 * (see docs/ENVIRONMENTS_SCOPE.md), so an athlete may pick whichever venue they
 * like — EXCEPT on drills where background luminance, contrast or clutter IS the
 * measurement. Those stay locked to their authored environment, always.
 */

export interface EnvironmentOption {
  id: EnvironmentId;
  label: string;
  blurb: string;
}

/** What the athlete may choose at the start of a session. */
export const SELECTABLE_ENVIRONMENTS: EnvironmentOption[] = [
  { id: "arena", label: "NEURAL ARENA", blurb: "The A.R.E.S. default. Deep space, performance loop floor." },
  { id: "soccer", label: "SOCCER STADIUM", blurb: "Night pitch, single-tier bowl, four corner masts." },
  { id: "hockey", label: "HOCKEY ARENA", blurb: "Ice, dasher boards and glass, truss roof, centre scoreboard." },
  { id: "football", label: "FOOTBALL FIELD", blurb: "Midfield at night, double-tier bowl, press box." },
  { id: "baseball", label: "BASEBALL DIAMOND", blurb: "Batter's box, open-corner grandstand, outfield wall." },
  { id: "racing", label: "SPEEDWAY BRICKS", blurb: "Standing on the brick start/finish stripe under the gantry." },
];

export const ENVIRONMENT_LABEL: Record<string, string> = Object.fromEntries(
  SELECTABLE_ENVIRONMENTS.map((e) => [e.id, e.label]),
);

/**
 * Drills whose environment cannot be overridden. Either the background is the
 * independent variable, or the drill presents optotypes/plates at a specified
 * contrast that a venue backdrop would silently modulate.
 */
export const ENVIRONMENT_LOCKED_DRILLS = new Set<string>([
  "assess-contrast-sensitivity",
  "assess-color-vision",
  "assess-stereopsis",
  "assess-dva-motion",
  "assess-cat",
  "assess-ufov",
  "assess-dem-arrows",
  "gaze-stabilization",
  "visual-clarity",
]);

/**
 * The whole Assess phase is locked. An assessment is only comparable against an
 * athlete's own history if the visual world it ran in was identical every time,
 * and a preference the athlete can flip between sessions destroys that.
 */
export function environmentLocked(def: DrillDefinition): boolean {
  if (def.phase === "Assess") return true;
  if (def.environment === "visibility") return true;
  return ENVIRONMENT_LOCKED_DRILLS.has(def.id);
}

/** Why the picker is greyed out, shown to the athlete rather than hidden. */
export function lockReason(def: DrillDefinition): string {
  if (def.environment === "visibility") return "BACKGROUND LUMINANCE IS THE MEASUREMENT";
  if (def.phase === "Assess") return "ASSESSMENTS RUN IN A FIXED VISUAL WORLD";
  return "THIS DRILL'S BACKDROP IS PART OF THE MEASUREMENT";
}

/**
 * Resolve what to render. Locked drills always win; otherwise the athlete's
 * preference wins; the drill's authored default is the fallback.
 */
export function resolveEnvironment(
  def: DrillDefinition | undefined,
  preference: EnvironmentId,
): EnvironmentId {
  if (!def) return preference;
  if (environmentLocked(def)) return def.environment;
  return preference;
}
