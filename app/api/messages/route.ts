import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createSessionClient, getCurrentProfileId } from "@/lib/supabase/serverAuth";
import type { SongSwapPayloadV1 } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_ID = /^\d+$/;

function cleanString(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Same hosts as next.config.ts's images.remotePatterns (minus the avatars bucket). */
const COVER_HOSTS = [/^i\.scdn\.co$/, /^coverartarchive\.org$/, /\.archive\.org$/, /\.mzstatic\.com$/, /^cdn-images\.dzcdn\.net$/];

function coverArtUrl(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && COVER_HOSTS.some((host) => host.test(url.hostname)) ? url.toString() : "";
  } catch (err) {
    console.warn("Song swap: dropping an unparseable album art URL", err);
    return "";
  }
}

function validatedSwap(value: unknown): SongSwapPayloadV1 | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (input.version !== 1 || !input.song || typeof input.song !== "object") return null;
  const rawSong = input.song as Record<string, unknown>;
  const title = cleanString(rawSong.title, 200);
  const artist = cleanString(rawSong.artist, 200);
  const reason = cleanString(input.reason, 160);
  if (!title || !artist || !reason) return null;

  const catalogId = cleanString(rawSong.catalogId, 36);
  if (catalogId && !UUID.test(catalogId)) return null;
  const provider = rawSong.provider === "deezer" || rawSong.provider === "itunes" ? rawSong.provider : undefined;
  const providerTrackId = cleanString(rawSong.providerTrackId, 32);
  if ((provider && !providerTrackId) || (!provider && providerTrackId) || (providerTrackId && !PROVIDER_ID.test(providerTrackId))) return null;
  // Cover art is shown to the recipient through next/image, which throws on hosts outside
  // next.config.ts's remotePatterns (and any other host would learn when they opened the chat), so
  // art from anywhere else is dropped; the card falls back to a generated sleeve.
  const albumArtUrl = coverArtUrl(cleanString(rawSong.albumArtUrl, 1000));

  let snippet: SongSwapPayloadV1["snippet"];
  if (input.snippet !== undefined) {
    if (!input.snippet || typeof input.snippet !== "object") return null;
    const raw = input.snippet as Record<string, unknown>;
    const startSeconds = raw.startSeconds;
    const endSeconds = raw.endSeconds;
    if (typeof startSeconds !== "number" || typeof endSeconds !== "number" || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) return null;
    const duration = endSeconds - startSeconds;
    if (startSeconds < 0 || endSeconds <= startSeconds || duration < 5 || duration > 12) return null;
    const label = cleanString(raw.label, 80);
    snippet = { startSeconds: Math.round(startSeconds * 1000) / 1000, endSeconds: Math.round(endSeconds * 1000) / 1000, ...(label ? { label } : {}) };
  }

  const replyToMessageId = cleanString(input.replyToMessageId, 36);
  if (replyToMessageId && !UUID.test(replyToMessageId)) return null;
  return {
    version: 1,
    song: { ...(catalogId ? { catalogId } : {}), ...(provider ? { provider, providerTrackId } : {}), title, artist, ...(albumArtUrl ? { albumArtUrl } : {}) },
    reason,
    ...(snippet ? { snippet } : {}),
    ...(replyToMessageId ? { replyToMessageId } : {}),
  };
}

/**
 * Reads the signed-in user's messages (all threads, or one with `?with=<profileId>`), oldest first.
 * Uses the session client so RLS ("Participants can view messages") scopes it: no one can read a
 * thread they're not in. Clients poll this until the Realtime subscription lands (backburner #4).
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentProfileId();
  if (!me) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const other = req.nextUrl.searchParams.get("with");
  const supabase = await createSessionClient();
  let query = supabase.from("messages").select("*").order("created_at", { ascending: true });
  if (other) {
    const [a, b] = me < other ? [me, other] : [other, me];
    query = query.eq("user_a", a).eq("user_b", b);
  }

  const { data, error } = await query;
  if (error) {
    console.error("GET /api/messages failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ messages: data ?? [] });
}

// Writes go through here so we can validate/rate-limit server-side later.
export async function POST(req: NextRequest) {
  const senderId = await getCurrentProfileId();
  if (!senderId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const otherProfileId = cleanString(body?.otherProfileId, 36);
  if (body?.kind !== undefined && body.kind !== "text" && body.kind !== "song_swap") {
    return NextResponse.json({ error: "Unsupported message kind" }, { status: 400 });
  }
  const kind = body?.kind === "song_swap" ? "song_swap" : "text";

  if (!UUID.test(otherProfileId)) {
    return NextResponse.json(
      { error: "A valid otherProfileId is required" },
      { status: 400 }
    );
  }

  const payload = kind === "song_swap" ? validatedSwap(body?.payload) : null;
  const text = kind === "text" ? cleanString(body?.text, 4000) : "";
  if ((kind === "text" && !text) || (kind === "song_swap" && !payload)) {
    return NextResponse.json({ error: kind === "text" ? "text is required" : "Invalid song_swap payload" }, { status: 400 });
  }

  const supabase = createServerClient();
  const [a, b] = senderId < otherProfileId ? [senderId, otherProfileId] : [otherProfileId, senderId];

  const { data, error } = await supabase
    .from("messages")
    .insert({
      user_a: a,
      user_b: b,
      sender_id: senderId,
      body: payload ? `Song swap: “${payload.song.title}” by ${payload.song.artist} — ${payload.reason}` : text,
      kind,
      payload,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: data });
}
