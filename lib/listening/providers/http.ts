import { ListeningProviderError } from "../types";

export type FetchLike = typeof fetch;

export function retryAfterMs(response: Response, nowMs: number): number | undefined {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - nowMs);
}

export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new ListeningProviderError({
      code: "malformed_response",
      message: "The listening provider returned invalid JSON",
      retryable: true,
      cause,
    });
  }
}

export function httpError(response: Response, nowMs: number): ListeningProviderError {
  const retryAfter = retryAfterMs(response, nowMs);
  if (response.status === 429) {
    return new ListeningProviderError({
      code: "rate_limited",
      message: "The listening provider rate limited the request",
      retryable: true,
      retryAfterMs: retryAfter,
    });
  }
  if (response.status === 404) {
    return new ListeningProviderError({
      code: "invalid_username",
      message: "That listening username was not found",
      retryable: false,
    });
  }
  return new ListeningProviderError({
    code: "provider_unavailable",
    message: "The listening provider is unavailable",
    retryable: response.status >= 500 || response.status === 408,
    retryAfterMs: retryAfter,
  });
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
