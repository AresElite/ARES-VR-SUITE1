import type { ARESDrillSessionResult } from "./schemas";

/**
 * Placeholder backend sync layer (Phase 2 production concern).
 *
 * Drill engines never talk to the network — they emit ARESDrillSessionResult
 * objects and hand them to this module. When a production endpoint exists,
 * only this file changes: set VITE_BACKEND_API_URL and implement transport.
 */
export interface SyncOutcome {
  ok: boolean;
  synced: boolean;
  message: string;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_API_URL as string | undefined;

export async function syncSessionToEMR(result: ARESDrillSessionResult): Promise<SyncOutcome> {
  if (!BACKEND_URL) {
    return {
      ok: true,
      synced: false,
      message: "Backend sync not configured — prototype session stored locally only.",
    };
  }
  try {
    const res = await fetch(`${BACKEND_URL}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(import.meta.env.VITE_BACKEND_API_KEY
          ? { Authorization: `Bearer ${import.meta.env.VITE_BACKEND_API_KEY}` }
          : {}),
      },
      body: JSON.stringify(result),
    });
    return res.ok
      ? { ok: true, synced: true, message: "Session synced." }
      : { ok: false, synced: false, message: `Backend responded ${res.status}.` };
  } catch (e) {
    return { ok: false, synced: false, message: `Backend sync failed: ${String(e)}` };
  }
}
