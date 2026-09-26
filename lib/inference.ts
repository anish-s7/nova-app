import { CLUSTERS, CLUSTER_IDS, TAG_CLUSTER_WEIGHTS, contextTagLabel, type ClusterId } from "./clusters";
import { contextFor, type SongMode } from "./music-context";
import type { AnalysisResult, Evidence, InferredMotivation, ListeningSignal, Song } from "./types";

export type Vector = Record<ClusterId, number>;

export const zeroVector = (): Vector =>
  Object.fromEntries(CLUSTER_IDS.map((c) => [c, 0])) as Vector;

export type Subject = { isMe: true } | { isMe: false; name: string };

const subj = (s: Subject) => (s.isMe ? "You" : s.name);
const pron = (s: Subject) => (s.isMe ? "you" : "they");
const poss = (s: Subject) => (s.isMe ? "your" : `${s.name}'s`);

const HEADLINES: Record<ClusterId, string> = {
  quiet_company: "You put music on so you're not alone with the quiet.",
  armor_up: "Music is how you get ready for the hard parts of the day.",
  carrying_loss: "Your songs keep you close to people and places you miss.",
  somewhere_else: "When things get heavy, music is how you step out for a few minutes.",
  old_selves: "Certain songs put you right back in an earlier year.",
};

function songScore(song: Song, signal: ListeningSignal | undefined, cluster: ClusterId) {
  let score = contextFor(song.id).clusters[cluster] ?? 0;
  if (signal) {
    const plays = Math.min((signal.playCount ?? 0) / 40, 1.5);
    score *= 1 + plays * 0.35;
    for (const tag of signal.contextTags) score += (TAG_CLUSTER_WEIGHTS[tag][cluster] ?? 0) * 0.55;
    if (cluster === "quiet_company" || cluster === "carrying_loss") score += (signal.lateNightShare ?? 0) * 0.6;
  }
  return score;
}

function evidenceFor(song: Song, signal: ListeningSignal | undefined, s: Subject, withContext: boolean): Evidence[] {
  const out: Evidence[] = [];
  const title = `"${song.title}"`;
  if (signal?.playCount && (signal.lateNightShare ?? 0) >= 0.4) {
    out.push({
      kind: "listening_pattern",
      text: `${subj(s)} played ${title} ${signal.playCount} times, ${Math.round((signal.lateNightShare ?? 0) * 100)}% of them after midnight.`,
      songIds: [song.id],
    });
  } else if (signal?.playCount) {
    out.push({
      kind: "listening_pattern",
      text: `${title} has ${signal.playCount} plays, more than almost anything else in ${poss(s)} library.`,
      songIds: [song.id],
    });
  } else if (signal?.contextTags.length) {
    out.push({
      kind: "user_tag",
      text: `${subj(s)} said ${pron(s)} play ${title} ${contextTagLabel(signal.contextTags[0])}.`,
      songIds: [song.id],
    });
  }
  if (withContext || out.length === 0) {
    out.push({ kind: "song_context", text: `${title} ${contextFor(song.id).meaning}.`, songIds: [song.id] });
  }
  return out;
}

export function dominantMode(songs: Song[]): SongMode {
  const lift = songs.filter((s) => contextFor(s.id).mode === "lift").length;
  return lift > songs.length / 2 ? "lift" : "lean_in";
}

export type InferenceInput = {
  userId: string;
  subject: Subject;
  songs: Song[];
  signals: ListeningSignal[];
  bias?: Partial<Vector>;
};

export function infer({ userId, subject, songs, signals, bias }: InferenceInput): AnalysisResult {
  const sig = new Map(signals.map((x) => [x.songId, x]));
  const raw = zeroVector();
  for (const c of CLUSTER_IDS) {
    raw[c] = songs.reduce((sum, song) => sum + songScore(song, sig.get(song.id), c), 0) + (bias?.[c] ?? 0);
  }
  const max = Math.max(...Object.values(raw), 0.001);
  const ranked = CLUSTER_IDS.map((c) => ({ c, v: raw[c] / max }))
    .sort((a, b) => b.v - a.v)
    .filter((x, i) => i === 0 || x.v >= 0.3)
    .slice(0, 3);

  const motivations: InferredMotivation[] = ranked.map(({ c, v }, i) => {
    const bySong = [...songs].sort((a, b) => songScore(b, sig.get(b.id), c) - songScore(a, sig.get(a.id), c));
    const [first, second] = bySong;
    const evidence = [
      ...(first ? evidenceFor(first, sig.get(first.id), subject, true) : []),
      ...(second && i === 0 ? evidenceFor(second, sig.get(second.id), subject, false) : []),
    ].slice(0, 3);
    return {
      id: `${userId}-${c}`,
      label: CLUSTERS[c].label,
      description: CLUSTERS[c].description,
      cluster: c,
      confidence: Math.round((0.52 + 0.43 * v - i * 0.04) * 100) / 100,
      evidence,
      feedback: "unreviewed",
      isPublic: true,
    };
  });

  const primary = ranked[0].c;
  const bestFor = [...songs].sort((a, b) => songScore(b, sig.get(b.id), primary) - songScore(a, sig.get(a.id), primary));
  const patternSong =
    songs.find((s) => (sig.get(s.id)?.lateNightShare ?? 0) >= 0.4) ??
    songs.find((s) => sig.get(s.id)?.contextTags.length) ??
    bestFor[0];
  const meaningSong = bestFor.find((s) => s.id !== patternSong?.id) ?? bestFor[0];
  const patternSignal = patternSong ? sig.get(patternSong.id) : undefined;

  const highlights = [
    patternSong
      ? (patternSignal?.lateNightShare ?? 0) >= 0.4
        ? `"${patternSong.title}" keeps coming back, mostly after dark.`
        : patternSignal?.contextTags.length
          ? `You play "${patternSong.title}" ${contextTagLabel(patternSignal.contextTags[0])}.`
          : `You keep "${patternSong.title}" close.`
      : "You picked these for a reason.",
    meaningSong ? `"${meaningSong.title}" ${contextFor(meaningSong.id).meaning}.` : "Every song here is doing a job.",
    dominantMode(songs) === "lift"
      ? "Most of what you chose changes the feeling in a room."
      : "Most of what you chose sits with a feeling instead of fixing it.",
  ];

  return { headline: HEADLINES[primary], motivations, highlights };
}

/** Turns reviewed motivations into a similarity vector. Rejected ones drop out. */
export function vectorFromMotivations(motivations: InferredMotivation[]): Vector {
  const v = zeroVector();
  for (const c of CLUSTER_IDS) v[c] = 0.04;
  for (const m of motivations) {
    if (m.feedback === "rejected") continue;
    const boost = m.feedback === "confirmed" ? 1.12 : 1;
    v[m.cluster as ClusterId] = Math.max(v[m.cluster as ClusterId], m.confidence * boost);
  }
  return v;
}

export function cosine(a: Vector, b: Vector) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const c of CLUSTER_IDS) {
    dot += a[c] * b[c];
    na += a[c] * a[c];
    nb += b[c] * b[c];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export function primaryCluster(motivations: InferredMotivation[]): ClusterId {
  const active = motivations.filter((m) => m.feedback !== "rejected");
  const top = [...active].sort((a, b) => b.confidence * (b.feedback === "confirmed" ? 1.12 : 1) - a.confidence * (a.feedback === "confirmed" ? 1.12 : 1))[0];
  return (top?.cluster as ClusterId) ?? "quiet_company";
}
