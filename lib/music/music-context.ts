import type { ClusterId } from "../galaxy/clusters";
import type { Song } from "../data/types";

/** How a song tends to be used: to sit with a feeling, or to change it. */
export type SongMode = "lean_in" | "lift";

export type SongContext = {
  clusters: Partial<Record<ClusterId, number>>;
  mode: SongMode;
  /** Completes the sentence: `"<title>" ...` */
  meaning: string;
};

type Row = [id: string, title: string, artist: string, cover: number | null, mode: SongMode, clusters: Partial<Record<ClusterId, number>>, meaning: string];

const Q = "quiet_company";
const A = "armor_up";
const L = "carrying_loss";
const S = "somewhere_else";
const O = "old_selves";

const ROWS: Row[] = [
  // Company in the quiet
  ["motion-sickness", "Motion Sickness", "Phoebe Bridgers", 1, "lean_in", { [Q]: 1, [O]: 0.4 }, "sounds like someone talking to you at 2am, not performing for a crowd"],
  ["liability", "Liability", "Lorde", 2, "lean_in", { [Q]: 1, [L]: 0.3 }, "is about being alone in a way that makes being alone feel shared"],
  ["holocene", "Holocene", "Bon Iver", 3, "lean_in", { [Q]: 0.9, [S]: 0.5 }, "makes feeling small in a big quiet room feel almost peaceful"],
  ["skinny-love", "Skinny Love", "Bon Iver", 4, "lean_in", { [Q]: 0.8, [L]: 0.5 }, "is a voice cracking in an empty cabin, recorded with nobody else there"],
  ["marvins-room", "Marvins Room", "Drake", 9, "lift", { [Q]: 1, [L]: 0.2 }, "is a late-night phone call to someone, so the room doesn't feel empty"],
  ["snooze", "Snooze", "SZA", 10, "lift", { [Q]: 0.9, [O]: 0.2 }, "is warm and unhurried, like someone lying next to you on the couch"],
  ["good-news", "Good News", "Mac Miller", 11, "lift", { [Q]: 0.9, [L]: 0.4 }, "is gentle company for the nights when everything feels far away"],
  ["get-you", "Get You", "Daniel Caesar", 12, "lift", { [Q]: 0.8, [S]: 0.3 }, "turns a dark, empty kitchen into somewhere warm"],
  ["dead-man-walking", "Dead Man Walking", "Brent Faiyaz", 15, "lift", { [Q]: 0.8, [A]: 0.3 }, "is a low, steady voice that fills the space while you do the dishes alone"],
  ["intro-xx", "Intro", "The xx", null, "lean_in", { [Q]: 0.8, [S]: 0.4 }, "is almost all space, the sound of a room at night"],
  ["bags", "Bags", "Clairo", null, "lean_in", { [Q]: 0.7, [O]: 0.5 }, "is a quiet, nervous conversation you'd only have after midnight"],
  ["nights", "Nights", "Frank Ocean", 6, "lean_in", { [Q]: 0.7, [O]: 0.5 }, "splits in half like a night that won't end"],
  ["glimpse-of-us", "Glimpse of Us", "Joji", null, "lean_in", { [Q]: 0.6, [L]: 0.7 }, "is a piano and one voice, for when the apartment is too still"],
  ["weightless", "Weightless", "Marconi Union", null, "lift", { [Q]: 0.7, [S]: 0.6 }, "was literally designed to slow your heartbeat down"],
  ["clair-de-lune", "Clair de Lune", "Claude Debussy", null, "lift", { [Q]: 0.7, [S]: 0.5 }, "is moonlight on the wall of a dark bedroom"],
  ["white-ferrari", "White Ferrari", "Frank Ocean", null, "lean_in", { [Q]: 0.6, [O]: 0.6 }, "sounds like a memory playing back in an empty car"],

  // Armor for hard days
  ["lose-yourself", "Lose Yourself", "Eminem", 14, "lift", { [A]: 1 }, "is a countdown clock, one shot, don't miss it"],
  ["humble", "HUMBLE.", "Kendrick Lamar", null, "lift", { [A]: 1 }, "is pure posture, you walk differently while it's on"],
  ["stronger", "Stronger", "Kanye West", null, "lift", { [A]: 0.9, [O]: 0.3 }, "turns what didn't break you into a beat"],
  ["eye-of-the-tiger", "Eye of the Tiger", "Survivor", null, "lift", { [A]: 0.9, [O]: 0.3 }, "is the training montage everyone secretly plays in their head"],
  ["run-the-world", "Run the World (Girls)", "Beyoncé", null, "lift", { [A]: 0.9 }, "is a marching band for walking into a room you're nervous about"],
  ["titanium", "Titanium", "David Guetta ft. Sia", null, "lift", { [A]: 0.9, [S]: 0.3 }, "is a shield made of synths"],
  ["till-i-collapse", "Till I Collapse", "Eminem", null, "lift", { [A]: 1 }, "is about going when there's nothing left in the tank"],
  ["dna", "DNA.", "Kendrick Lamar", null, "lift", { [A]: 0.9 }, "is a reminder of exactly who you are, at full volume"],
  ["cant-hold-us", "Can't Hold Us", "Macklemore & Ryan Lewis", null, "lift", { [A]: 0.8, [O]: 0.3 }, "is a sprint that never lets you catch your breath"],
  ["survivor", "Survivor", "Destiny's Child", null, "lift", { [A]: 0.9, [L]: 0.2 }, "is a comeback speech you can sing along to"],
  ["rise-up", "Rise Up", "Andra Day", null, "lean_in", { [A]: 0.7, [L]: 0.4 }, "is quiet strength, getting up one more time"],
  ["power", "POWER", "Kanye West", null, "lift", { [A]: 0.9 }, "makes a walk to class feel like a coronation"],

  // Staying close to someone gone
  ["fourth-of-july", "Fourth of July", "Sufjan Stevens", 5, "lean_in", { [L]: 1, [Q]: 0.4 }, "is a conversation with someone in their last days"],
  ["casimir-pulaski-day", "Casimir Pulaski Day", "Sufjan Stevens", null, "lean_in", { [L]: 1 }, "is about losing a friend and still not having the words"],
  ["hurt", "Hurt", "Johnny Cash", null, "lean_in", { [L]: 0.9, [O]: 0.5 }, "is an old man looking back at everything he's lost"],
  ["tears-in-heaven", "Tears in Heaven", "Eric Clapton", null, "lean_in", { [L]: 1 }, "was written for a son, and people still play it for theirs"],
  ["fix-you", "Fix You", "Coldplay", 8, "lift", { [L]: 0.8, [A]: 0.3 }, "is what people play for someone they can't reach anymore"],
  ["night-we-met", "The Night We Met", "Lord Huron", 13, "lean_in", { [L]: 0.9, [O]: 0.6 }, "asks to go back to one specific night and do it over"],
  ["landslide", "Landslide", "Fleetwood Mac", null, "lean_in", { [L]: 0.7, [O]: 0.7 }, "is about watching your parents get older"],
  ["see-you-again", "See You Again", "Wiz Khalifa ft. Charlie Puth", null, "lift", { [L]: 0.9, [O]: 0.3 }, "is a goodbye to a friend, played at a lot of real funerals"],
  ["time-zimmer", "Time", "Hans Zimmer", null, "lean_in", { [L]: 0.6, [S]: 0.6 }, "builds slowly, like remembering someone piece by piece"],
  ["nuvole-bianche", "Nuvole Bianche", "Ludovico Einaudi", null, "lean_in", { [L]: 0.7, [Q]: 0.4 }, "is the piano piece people play when they can't find the words"],
  ["seventeen", "Seventeen", "Sharon Van Etten", null, "lean_in", { [O]: 0.8, [L]: 0.4 }, "is a letter to your younger self"],

  // A door to somewhere else
  ["space-song", "Space Song", "Beach House", 7, "lift", { [S]: 1, [Q]: 0.4 }, "floats, like the room slowly lifting off the ground"],
  ["let-it-happen", "Let It Happen", "Tame Impala", null, "lift", { [S]: 1 }, "is an eight-minute trapdoor out of whatever you're in"],
  ["midnight-city", "Midnight City", "M83", 16, "lift", { [S]: 0.9, [O]: 0.4 }, "is a city seen from above, at night, somewhere bigger"],
  ["dreams", "Dreams", "Fleetwood Mac", null, "lift", { [S]: 0.8, [O]: 0.5 }, "drifts, like watching the world through a car window"],
  ["redbone", "Redbone", "Childish Gambino", null, "lift", { [S]: 0.8 }, "is a slow, hazy other room you can walk into"],
  ["tadow", "Tadow", "Masego & FKJ", null, "lift", { [S]: 0.8, [Q]: 0.3 }, "sounds like two people improvising in a warmer city than yours"],
  ["kids-mgmt", "Kids", "MGMT", null, "lift", { [S]: 0.7, [O]: 0.7 }, "is a sugar rush from somewhere you've never been"],
  ["heartbeats", "Heartbeats", "José González", null, "lean_in", { [S]: 0.7, [Q]: 0.5 }, "is one guitar, slow enough to breathe with"],
  ["sofia", "Sofia", "Clairo", null, "lift", { [S]: 0.6, [O]: 0.5 }, "is a daydream on a bedroom floor"],
  ["ivy", "Ivy", "Frank Ocean", null, "lean_in", { [S]: 0.5, [O]: 0.8 }, "is a summer that already ended"],
  ["pink-white", "Pink + White", "Frank Ocean", null, "lift", { [S]: 0.8, [O]: 0.3 }, "is sunlight through a car window on a road going nowhere"],
  ["gymnopedie", "Gymnopédie No. 1", "Erik Satie", null, "lean_in", { [S]: 0.6, [Q]: 0.6 }, "slows time down to almost nothing"],
  ["experience", "Experience", "Ludovico Einaudi", null, "lift", { [S]: 0.7, [L]: 0.4 }, "rises until you're not in the room anymore"],

  // Visiting who you used to be
  ["mr-brightside", "Mr. Brightside", "The Killers", null, "lift", { [O]: 1, [A]: 0.3 }, "is every party you went to at nineteen"],
  ["september", "September", "Earth, Wind & Fire", null, "lift", { [O]: 0.9 }, "is a family kitchen, a wedding, a car ride with your parents"],
  ["dancing-on-my-own", "Dancing On My Own", "Robyn", null, "lift", { [O]: 0.8, [Q]: 0.3 }, "is a crying-on-the-dancefloor song from a specific year of your life"],
  ["kilby-girl", "Kilby Girl", "The Backseat Lovers", null, "lean_in", { [O]: 0.9 }, "is a road trip with people you don't talk to anymore"],
  ["ribs", "Ribs", "Lorde", null, "lean_in", { [O]: 1, [Q]: 0.3 }, "is about being scared of getting old while you're still young"],
  ["supercut", "Supercut", "Lorde", null, "lift", { [O]: 0.8, [L]: 0.4 }, "replays the best parts of something that already ended"],
  ["ophelia", "Ophelia", "The Lumineers", null, "lift", { [O]: 0.7 }, "is a stomp-clap time capsule of a certain year"],
  ["1901", "1901", "Phoenix", null, "lift", { [O]: 0.8, [S]: 0.4 }, "is the soundtrack to an old version of your city"],
  ["teenage-dream", "Teenage Dream", "Katy Perry", null, "lift", { [O]: 0.9 }, "is a middle school dance in three and a half minutes"],
  ["last-nite", "Last Nite", "The Strokes", null, "lift", { [O]: 0.8, [A]: 0.3 }, "is a sticky basement show you swear you'll never forget"],
  ["stick-season", "Stick Season", "Noah Kahan", null, "lean_in", { [O]: 0.9, [L]: 0.4 }, "is about driving past the places you grew up in"],
];

export const SONG_CONTEXT: Record<string, SongContext> = Object.fromEntries(
  ROWS.map(([id, , , , mode, clusters, meaning]) => [id, { clusters, mode, meaning }]),
);

export const SONG_CATALOG: Song[] = ROWS.map(([id, title, artist, cover]) => ({
  id,
  title,
  artist,
  albumArtUrl: cover ? `/covers/cover-${cover}.png` : undefined,
  spotifyId: `mock-${id}`,
  source: "manual",
}));

const byId = new Map(SONG_CATALOG.map((s) => [s.id, s]));
const dynamicKnown = new Map<string, Song>();

export function registerSong(s: Song) {
  if (s && s.id) {
    dynamicKnown.set(s.id, s);
  }
}

export function registerSongs(songs: Song[]) {
  if (!songs) return;
  for (const s of songs) registerSong(s);
}

export function songById(id: string): Song {
  const s = byId.get(id) ?? dynamicKnown.get(id);
  if (s) return s;
  const cleanId = id.replace(/^(deezer|itunes|spotify):/, "");
  return {
    id,
    title: cleanId || id,
    artist: "Unknown Artist",
    source: "manual",
  };
}

export function contextFor(songId: string): SongContext {
  return SONG_CONTEXT[songId] ?? { clusters: {}, mode: "lean_in", meaning: "clearly means something to you" };
}

export function songsInCluster(cluster: ClusterId, min = 0.6) {
  return SONG_CATALOG.filter((s) => (contextFor(s.id).clusters[cluster] ?? 0) >= min);
}

