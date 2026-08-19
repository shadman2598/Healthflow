/**
 * Runtime config so local Next, Pages static export, and optional hosted API stay aligned.
 *
 * - Local `next dev` / `next start`: always same-origin `/api/backend` (Next rewrite → Express).
 *   Do not use NEXT_PUBLIC_API_URL here — that breaks cookies and diverges from how most
 *   clinic deploys proxy the API.
 * - GitHub Pages / `preview:pages`: no Express rewrite. Use NEXT_PUBLIC_API_URL when a
 *   hosted API exists; otherwise callers use browser public-integration fallbacks
 *   (Nager, openFDA, nearby resources).
 */

export function isGithubPagesRuntime(): boolean {
  if (process.env.NEXT_PUBLIC_GITHUB_PAGES === "true") return true;
  if (typeof window !== "undefined" && /\.github\.io$/i.test(window.location.hostname)) {
    return true;
  }
  return false;
}

/** Absolute API origin for static/Pages builds only. */
export function publicApiOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

/**
 * Base URL for HealthFlow authenticated API calls.
 * Returns null on static Pages when no hosted API is configured.
 */
export function apiRequestBase(): string | null {
  if (isGithubPagesRuntime()) {
    return publicApiOrigin();
  }
  return "/api/backend";
}
