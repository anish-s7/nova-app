/**
 * Themes: shared moments that cut across the five "whys". A theme is a constellation of songs
 * that people have tied to the same kind of moment. It only becomes a real cluster once
 * THEME_THRESHOLD songs carry it; below that it is "forming" and waits for someone to add the next one.
 *
 * Mock-only: the seeds stand in for what per-pick clustering would surface from real data.
 */
export const THEME_THRESHOLD = 3;

export type ThemeId = "windows_down" | "slow_sundays" | "rain_on_glass" | "before_the_thing" | "first_apartment" | "cant_sleep" | "long_runs";

export type Theme = {
  id: ThemeId;
  label: string;
  short: string;
  description: string;
  color: string;
  /** Catalog song ids already tied to this moment in the mock world. */
  seed: string[];
};

export const THEMES: Record<ThemeId, Theme> = {
  windows_down: {
    id: "windows_down",
    label: "Windows down",
    short: "Windows down",
    description: "The road with nowhere to be. Everyone knows the words.",
    color: "#e0b25c",
    seed: ["kids-mgmt", "september", "dreams", "1901", "cant-hold-us"],
  },
  slow_sundays: {
    id: "slow_sundays",
    label: "Slow Sundays",
    short: "Slow Sundays",
    description: "Blinds half open, nothing to be productive about.",
    color: "#8ec3b0",
    seed: ["experience", "gymnopedie", "holocene", "weightless", "space-song"],
  },
  rain_on_glass: {
    id: "rain_on_glass",
    label: "Rain on the window",
    short: "Rain on glass",
    description: "Songs that sound like weather you're watching from inside.",
    color: "#7f9fd6",
    seed: ["fix-you", "night-we-met", "skinny-love", "landslide", "seventeen"],
  },
  before_the_thing: {
    id: "before_the_thing",
    label: "Before the big thing",
    short: "Before the thing",
    description: "The last three minutes before the interview, the game, the hard talk.",
    color: "#d9826b",
    seed: ["lose-yourself", "eye-of-the-tiger", "till-i-collapse", "power", "humble"],
  },
  first_apartment: {
    id: "first_apartment",
    label: "First apartment",
    short: "First apartment",
    description: "Boxes, one lamp, and a place that is finally yours.",
    color: "#c48ec9",
    seed: ["bags", "dancing-on-my-own"],
  },
  cant_sleep: {
    id: "cant_sleep",
    label: "Can't sleep",
    short: "Can't sleep",
    description: "The hour where the ceiling gets very interesting.",
    color: "#9a8fbf",
    seed: ["intro-xx", "clair-de-lune"],
  },
  long_runs: {
    id: "long_runs",
    label: "Long runs",
    short: "Long runs",
    description: "Mile six, when the only thing left is the playlist.",
    color: "#88c46d",
    seed: ["titanium", "run-the-world"],
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export function getTheme(id: string): Theme {
  return THEMES[id as ThemeId] ?? THEMES.slow_sundays;
}
