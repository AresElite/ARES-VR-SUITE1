/**
 * Ares Elite Sports Vision — official brand palette.
 * Source: Ares Brand Guide ("Dark-first only · Teal acts · Purple glows").
 * Rule: Electric Teal is the ONLY action color; Vivid Purple is ambient
 * glow/identity only and never acts.
 */
export const ARES_COLORS = {
  /** Deep Indigo — borders, button fills, purple emissive base */
  deepPurple: "#2D234F",
  /** Deep Indigo — borders */
  royalPurple: "#2D234F",
  /** Electric Teal — primary action, only */
  electricTeal: "#2998AA",
  /** Deep Navy — core background */
  nearBlack: "#0B0F2A",
  /** Charcoal Blue — cards, nav, tables */
  graphite: "#111428",
  /** Panel — elevated surfaces */
  panel: "#1A1E3D",
  /** Ice White — headings, body */
  white: "#EAF0FF",
  /** Body Bright — reading text in cards */
  softGray: "#C3CBE6",
  /** Warning */
  warningGold: "#F5B648",
  /** Danger */
  errorRed: "#EF5A6F",
} as const;

/** Brand accents (glow, states, secondary text). */
export const ARES_ACCENTS = {
  /** Teal Light — teal text on dark */
  tealBright: "#7FD3DE",
  /** Vivid Purple — ambient glow only, never acts */
  purpleGlow: "#8B5CF6",
  /** Purple Light — purple text, eyebrows */
  purpleLight: "#C4B5FD",
  /** Success */
  goSignal: "#22C55E",
  /** Hover surface lift */
  hoverLift: "#1A1E3D",
  /** Muted — ledes, secondary */
  muted: "#9AA3C7",
  /** Dim — HUD labels, captions */
  dim: "#6B749C",
} as const;

export type AresColor = (typeof ARES_COLORS)[keyof typeof ARES_COLORS];
