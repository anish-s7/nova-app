/**
 * A normalized identity for a song from its title + artist, so the same song typed or found
 * differently lands on one key: accents, case, punctuation and spacing ignored; bracketed or
 * dashed extras ("(Remastered)", "- Live", "[feat. X]") and featured artists dropped.
 * "Gymnopédie No. 1" / "Gymnopedie No.1" and "HUMBLE." / "HUMBLE" share a key.
 * Used for song_tags now; a starting point for catalog dedup (CLAUDE.md backburner #1).
 */
const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function normalizeTitle(title: string) {
  return plain(title)
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\s-\s.*$/, " ")
    .replace(/\b(feat|ft)\.?\s.*$/, " ")
    .replace(/[^a-z0-9]/g, "");
}

export function normalizeArtist(artist: string) {
  return plain(artist)
    .replace(/\s(feat|ft|featuring)\.?\s.*$/, " ")
    .replace(/\s(&|and|x|,)\s.*$/, " ")
    .replace(/[^a-z0-9]/g, "");
}

export function songKey(title: string, artist: string) {
  return `${normalizeTitle(title)}::${normalizeArtist(artist)}`;
}
