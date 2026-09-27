import { NextResponse, type NextRequest } from "next/server";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export function privateJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", PRIVATE_HEADERS["Cache-Control"]);
  return NextResponse.json(body, { ...init, headers });
}

export function mutationAllowed(request: NextRequest): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  if (!forwardedHost) return false;
  try {
    return new URL(origin).origin === `${forwardedProto}://${forwardedHost}`;
  } catch {
    return false;
  }
}

export async function jsonObject(request: NextRequest): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  try {
    const value: unknown = await request.json();
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}
