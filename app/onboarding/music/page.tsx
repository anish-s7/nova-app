import { redirect } from "next/navigation";

/**
 * The old "Spotify or pick your own" choice. Spotify's user import can't open up beyond a handful
 * of allowlisted accounts (development mode), so everyone picks their own songs from the real
 * catalog search. Kept as a redirect so old links and bookmarks still land somewhere useful.
 */
export default function BringYourMusicPage() {
  redirect("/onboarding/pick");
}
