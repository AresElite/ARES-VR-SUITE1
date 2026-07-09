import { LOCALSTORAGE_SESSIONS_KEY } from "@/ares/constants";
import type { ARESDrillSessionResult } from "./schemas";

/**
 * Local session persistence (development / offline mode).
 * localStorage keeps the MVP dependency-free; the shape written here is the
 * exact object the future backend sync layer (src/data/api.ts) will transmit.
 */
export function loadSessions(): ARESDrillSessionResult[] {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSession(result: ARESDrillSessionResult): void {
  try {
    const all = loadSessions();
    all.unshift(result);
    // Keep the local cache bounded; backend is the long-term home.
    localStorage.setItem(LOCALSTORAGE_SESSIONS_KEY, JSON.stringify(all.slice(0, 200)));
  } catch (e) {
    console.warn("[A.R.E.S.] Failed to save session locally", e);
  }
}

export function clearSessions(): void {
  localStorage.removeItem(LOCALSTORAGE_SESSIONS_KEY);
}
