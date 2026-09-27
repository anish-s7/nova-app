/**
 * When the galaxy plays its build-out intro: the first galaxy view after you sign in (or sign up),
 * and the first one in a new tab. Reloads and tab switches in between open straight to the galaxy.
 * `/galaxy?intro` replays it every time, for demos.
 */

const SEEN_KEY = "song-galaxy-built-out";

export function shouldPlayGalaxyIntro(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).has("intro") || !sessionStorage.getItem(SEEN_KEY);
  } catch (err) {
    // Storage blocked (e.g. some private modes): skip the intro rather than replay it every visit.
    console.error("Couldn't check whether the galaxy intro was shown:", err);
    return false;
  }
}

export function markGalaxyIntroSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch (err) {
    console.error("Couldn't remember the galaxy intro was shown:", err);
  }
}

/** Call on sign-in, sign-up and sign-out, so the next galaxy view builds out again. */
export function replayGalaxyIntro() {
  try {
    sessionStorage.removeItem(SEEN_KEY);
  } catch (err) {
    console.error("Couldn't reset the galaxy intro:", err);
  }
}
