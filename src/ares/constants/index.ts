/** Global A.R.E.S. constants. */
export const APP_NAME = "A.R.E.S. VR Performance Suite";
export const ENGINE_NAME = "A.R.E.S. Immersive Performance Engine";
export const ORG_NAME = "Ares Elite Sports Vision";

/**
 * Version stamp — visible in the site footer and the VR arena so anyone can
 * instantly tell which build is live. Bump on every deploy.
 */
export const APP_VERSION = "v0.19.0 — Execute suite: 50 levels across the board";

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
