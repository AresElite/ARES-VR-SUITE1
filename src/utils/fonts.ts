import { configureTextBuilder } from "troika-three-text";

/**
 * Brand typography (Ares Brand Guide): Poppins carries every word;
 * JetBrains Mono is used ONLY for HUD labels, metrics, timestamps, tags.
 * Self-hosted so the suite renders on restricted gym/facility networks.
 */
export const FONT_POPPINS = "/fonts/Poppins-Regular.ttf";
export const FONT_POPPINS_SEMIBOLD = "/fonts/Poppins-SemiBold.ttf";
export const FONT_MONO = "/fonts/JetBrainsMono-Regular.ttf";

export function configureFonts(): void {
  configureTextBuilder({
    defaultFontURL: FONT_POPPINS,
  });
}
