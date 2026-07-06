import type { HeadsetKind } from "@/data/schemas";

/**
 * Best-effort Quest model detection from the user agent.
 * Quest Browser UAs contain "OculusBrowser" and usually "Quest 2/3/3S".
 * Detection only picks a default performance mode — the trainer can override.
 */
export function detectHeadset(): HeadsetKind {
  const ua = navigator.userAgent;
  if (/OculusBrowser|Quest/i.test(ua)) {
    if (/Quest 3S/i.test(ua)) return "Quest 3S";
    if (/Quest 3/i.test(ua)) return "Quest 3";
    if (/Quest 2/i.test(ua)) return "Quest 2";
    return "Unknown";
  }
  return "Desktop";
}

export function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/OculusBrowser/i.test(ua)) return "Meta Quest Browser";
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  if (/Firefox\//.test(ua)) return "Firefox";
  return "Unknown";
}
