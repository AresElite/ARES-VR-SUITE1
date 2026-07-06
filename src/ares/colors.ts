/** Ares Elite Sports Vision — brand palette. */
export const ARES_COLORS = {
  deepPurple: "#221461",
  royalPurple: "#2D234F",
  electricTeal: "#2998AA",
  nearBlack: "#05050A",
  graphite: "#141421",
  white: "#FFFFFF",
  softGray: "#D9D9E3",
  warningGold: "#C9A646",
  errorRed: "#FF4D4D",
} as const;

/** Brighter interaction accents derived from the base palette. */
export const ARES_ACCENTS = {
  tealBright: "#3FD4EA",
  purpleGlow: "#5B3FD4",
  goSignal: "#3FEA9C",
  hoverLift: "#38314F",
} as const;

export type AresColor = (typeof ARES_COLORS)[keyof typeof ARES_COLORS];
