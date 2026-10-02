/**
 * One-off: finds Cover Art Archive covers for catalog songs that have an mbid
 * but no album_art_url, and prints UPDATE statements to paste into the
 * Supabase SQL Editor (the service role has no UPDATE grant on songs).
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/backfill-cover-art.ts
 *
 * Sequential: MusicBrainz allows 1 request/second.
 */
import { createServerClient } from "../lib/supabase/server";
import { findCover } from "../lib/music/cover-art";

const MB = "https://musicbrainz.org/ws/2/recording/";

async function main() {
  const supabase = createServerClient();
  const { data: songs, error } = await supabase
    .from("songs")
    .select("id, title, artist, mbid")
    .is("album_art_url", null);
  if (error) throw error;

  const statements: string[] = [];
  for (const song of songs ?? []) {
    let ids: string[] = [];
    if (song.mbid) {
      await new Promise((r) => setTimeout(r, 1100));
      try {
        const res = await fetch(`${MB}${song.mbid}?inc=releases&fmt=json`, {
          headers: {
            "User-Agent": `SongGalaxy/0.1 (contact: ${process.env.MUSICBRAINZ_CONTACT_EMAIL})`,
            Accept: "application/json",
          },
        });
        if (res.ok) {
          const rec = (await res.json()) as { releases?: { id: string; status?: string }[] };
          ids = (rec.releases ?? [])
            .slice()
            .sort((a, b) => Number(b.status === "Official") - Number(a.status === "Official"))
            .map((r) => r.id);
        } else {
          console.error(`-- ${song.title}: MusicBrainz ${res.status}, trying iTunes/Deezer only`);
        }
      } catch (err) {
        console.error(`-- ${song.title}: MusicBrainz unreachable, trying iTunes/Deezer only`, err);
      }
    }
    const url = await findCover(song.title, song.artist, ids);
    if (url) statements.push(`update public.songs set album_art_url = '${url}' where id = '${song.id}'; -- ${song.title}`);
    else console.error(`-- no cover: ${song.title} — ${song.artist}`);
  }
  console.log(statements.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
