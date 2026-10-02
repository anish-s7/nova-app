const FALLBACK = "/galaxy";

/**
 * Where to send someone after sign-in, from an untrusted `?next=` value. Only same-site paths
 * survive. Browsers and `new URL` treat `\` as `/`, so "/\evil.com" resolves to
 * "http://evil.com/" — checking for "//" alone isn't enough.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (typeof next !== "string") return FALLBACK;
  if (!next.startsWith("/") || next.startsWith("//")) return FALLBACK;
  if (next.includes("\\") || /[\u0000-\u001f\u007f]/.test(next)) return FALLBACK;
  return next;
}
