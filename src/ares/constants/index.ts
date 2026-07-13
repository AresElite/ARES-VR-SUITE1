/** Global A.R.E.S. constants. */
export const APP_NAME = "A.R.E.S. VR Performance Suite";
export const ENGINE_NAME = "A.R.E.S. Immersive Performance Engine";
export const ORG_NAME = "Ares Elite Sports Vision";

/**
 * Version stamp — visible in the site footer and the VR arena so anyone can
 * instantly tell which build is live. Bump on every deploy.
 */
export const APP_VERSION = "v0.47.1 — FIX: conditional hook in the trainer dock blanked the canvas mid-drill";

/** Spatial UI distances (meters) — panels live 1.5–2.5m from the athlete. */
export const PANEL_NEAR = 1.6;
export const PANEL_MID = 2.0;
export const PANEL_FAR = 2.4;

/** Standing eye height used for seated-mode offset math. */
export const EYE_HEIGHT = 1.6;

/** HUD refresh rate (Hz) — drill state itself runs on the XR frame clock. */
export const HUD_REFRESH_HZ = 5;

export const LOCALSTORAGE_SESSIONS_KEY = "ares.vr.sessions.v1";
export const LOCALSTORAGE_SETTINGS_KEY = "ares.vr.settings.v1";


/**
 * Stroboscopic occlusion presets (binocular). Level 1 = quick, sparse
 * occlusion (mostly open); Level 5 = long, frequent occlusion (little light).
 * The occluder toggles on the drill's frame clock, so it pauses with the drill.
 */
export const STROBE_LEVELS: { clearMs: number; occludeMs: number }[] = [
  { clearMs: 0, occludeMs: 0 },      // 0 = off
  { clearMs: 220, occludeMs: 70 },   // 1
  { clearMs: 170, occludeMs: 120 },  // 2
  { clearMs: 130, occludeMs: 160 },  // 3
  { clearMs: 100, occludeMs: 210 },  // 4
  { clearMs: 75, occludeMs: 270 },   // 5
];

/** Universal org/clinic unlock PIN (prototype). Phase 2 replaces with real auth. */
export const ORG_PIN = "9876";
