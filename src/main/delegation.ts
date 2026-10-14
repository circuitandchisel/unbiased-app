/**
 * The delegation proxy setting (docs/DELEGATION.md): a loopback URL the
 * engine's Unbiased base URL points at, so Pareto's frontier escalations run
 * on this machine's own provider credential. Pure: the main process supplies
 * the file path and the fetch.
 */

/** Loopback only — the protocol's whole point is that the credential never
 *  leaves this machine. A `/v1` path, an optional port, an optional slash. */
const DELEGATION_PROXY_URL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?\/v1\/?$/;

export function isDelegationProxyUrl(url: string): boolean {
  return DELEGATION_PROXY_URL.test(url.trim());
}

/** The stored proxy URL, or null for a missing, malformed or non-loopback file. */
export function parseDelegationFile(text: string | null): string | null {
  if (text === null) return null;
  try {
    const d = JSON.parse(text) as { proxyUrl?: unknown };
    return typeof d.proxyUrl === "string" && isDelegationProxyUrl(d.proxyUrl) ? d.proxyUrl.trim() : null;
  } catch {
    return null;
  }
}

/** The proxy's own routes live beside `/v1` (unbiased-proxy README, "For a UI"). */
export function delegationProxyOrigin(url: string): string {
  return url.trim().replace(/\/v1\/?$/, "");
}
