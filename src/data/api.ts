import type { ARESDrillSessionResult } from "./schemas";

/**
 * Placeholder EMR sync layer.
 *
 * Drill engines never talk to the network — they emit ARESDrillSessionResult
 * objects and hand them to this module. When the EMR endpoint exists, only
 * this file changes: set VITE_EMR_API_URL and implement the transport.
 */
export interface SyncOutcome {
  ok: boolean;
  synced: boolean;
  message: string;
}

const EMR_URL = import.meta.env.VITE_EMR_API_URL as string | undefined;

export async function syncSessionToEMR(result: ARESDrillSessionResult): Promise<SyncOutcome> {
  if (!EMR_URL) {
    return {
      ok: true,
      synced: false,
      message: "EMR sync not configured — session stored locally and queued.",
    };
  }
  try {
    const res = await fetch(`${EMR_URL}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(import.meta.env.VITE_EMR_API_KEY
          ? { Authorization: `Bearer ${import.meta.env.VITE_EMR_API_KEY}` }
          : {}),
      },
      body: JSON.stringify(result),
    });
    return res.ok
      ? { ok: true, synced: true, message: "Session synced to EMR." }
      : { ok: false, synced: false, message: `EMR responded ${res.status}.` };
  } catch (e) {
    return { ok: false, synced: false, message: `EMR sync failed: ${String(e)}` };
  }
}
