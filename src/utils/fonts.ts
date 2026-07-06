import { configureTextBuilder } from "troika-three-text";

/**
 * Self-hosted default font for all spatial text.
 * Avoids troika's runtime CDN font fetch so the suite keeps rendering on
 * restricted gym/facility networks — only the app origin is required.
 */
export function configureFonts(): void {
  configureTextBuilder({
    defaultFontURL: "/fonts/Inter-Regular.woff",
  });
}
