import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { isMissingColumn } from "@/lib/supabase/missing-table";

const BUCKET = "avatars";
/** The client resizes to 256px JPEG first (~20-60 KB), so this only stops abuse. Matches the bucket's limit. */
const MAX_BYTES = 1024 * 1024;
const NOT_SET_UP = "Profile photos aren't set up on the server yet.";

const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/**
 * Uploads my profile photo (multipart field `photo`, a JPEG) to the public `avatars` bucket as
 * <my id>.jpg, replacing any earlier one, and points profiles.avatar_url at it. The photo overrides
 * my illustrated face everywhere. Service role: users have no storage write policies of their own.
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentProfileId();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "photo is required" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That photo is too large." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Checked by content, not the declared type: the bucket serves it as image/jpeg to everyone.
  if (!isJpeg(bytes)) return NextResponse.json({ error: "That file isn't a photo we can use." }, { status: 415 });

  const supabase = createServerClient();
  const path = `${me}.jpg`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  if (uploadError) {
    console.error("POST /api/avatar/photo upload failed:", uploadError);
    const missing = /bucket not found/i.test(uploadError.message);
    return NextResponse.json({ error: missing ? NOT_SET_UP : "The photo didn't upload. Try again." }, { status: missing ? 503 : 500 });
  }

  // Same path every time, so the URL carries a version: otherwise browsers and the CDN keep the old photo.
  const photoUrl = `${supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  const { error } = await supabase.from("profiles").update({ avatar_url: photoUrl }).eq("id", me);
  if (isMissingColumn(error)) return NextResponse.json({ error: NOT_SET_UP }, { status: 503 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ photoUrl });
}

/** Removes my profile photo; my illustrated face shows again. */
export async function DELETE() {
  const me = await getCurrentProfileId();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = createServerClient();
  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", me);
  if (isMissingColumn(error)) return NextResponse.json({ error: NOT_SET_UP }, { status: 503 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The profile no longer points at it; a leftover file is harmless, so a failed delete is only logged.
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([`${me}.jpg`]);
  if (removeError) console.error("DELETE /api/avatar/photo: couldn't delete the file:", removeError);
  return NextResponse.json({ photoUrl: null });
}
