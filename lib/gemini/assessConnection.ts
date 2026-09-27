import { Type, type Schema } from "@google/genai";
import type { CardThread, Portrait, SongRef } from "../portrait";
import type { ConnectionCardJson } from "../supabase/types";
import type { PortraitPick } from "./generatePortrait";
import { generateJson } from "./json";

export interface PersonForAssessment {
  displayName: string;
  /** Their stored portrait, if one exists; the assessment falls back to picks alone. */
  portrait: Portrait | null;
  picks: PortraitPick[];
}

export type AssessmentResult =
  | { status: "match"; card: ConnectionCardJson }
  | { status: "insufficient_evidence"; score: number; rationale: string };

/** Below this the pair isn't shown, whatever the model's status says. */
export const MIN_CONNECTION_SCORE = 35;

/**
 * The score is computed here, not asked for: a model asked for "0-100" anchors on one safe number
 * (every match came back 85). Gemini answers categorical questions it's good at; the rest is
 * measured from the data. Points add up to 100.
 */
const SPECIFICITY_POINTS = { generic: 0, specific: 20, very_specific: 35 } as const;
const EVIDENCE_POINTS = { one_song_pair: 0, several_songs: 10, pattern_across_profiles: 20 } as const;
const CONVERSATION_POINTS = { little: 0, some: 5, a_lot: 10 } as const;
const BASE_POINTS = 10;
const SECOND_THREAD_POINTS = 10;
const MOOD_POINTS = 15;
/** Farthest two points on the valence/energy circle can be apart (opposite edges). */
const MAX_MOOD_DISTANCE = 2;

type Rubric = {
  specificity: keyof typeof SPECIFICITY_POINTS;
  evidence: keyof typeof EVIDENCE_POINTS;
  conversation: keyof typeof CONVERSATION_POINTS;
};

const SYSTEM_INSTRUCTION = `You decide whether two people should be introduced because of WHY they listen
to music: a shared, specific reason, not shared taste. You see each person's whole
listening profile: every song they chose to share, the mood tags they picked, a
point on a circle (valence = sad to happy, energy = calm to intense, -1 to 1), any
words of their own, and (when available) a short portrait of how they use music.
A vector search suggested this pair; its best-matching songs are given as a hint only.

Judge the people, not one song:
- Look for threads: a way each of them uses music that genuinely lines up, anchored
  by one song on each side. The two songs can be completely different in genre.
- Strong: the same need met in the same way (e.g. both use music to stay with a
  loss rather than escape it). Weak: same genre, same artist, same era, popularity,
  or both just liking happy songs. Weak overlap alone is insufficient_evidence.
- A difference is good when it gives them something real to talk about.

Rate the connection with three plain judgments (no numbers; be honest, most pairs are
not "very_specific"):
- specificity: "generic" (a broad mood anyone could share, e.g. both like calm music at
  night), "specific" (a particular use of music, e.g. both use it to stay with a loss),
  or "very_specific" (a distinctive, unusual shared use you'd rarely see twice).
- evidence_strength: "one_song_pair" (rests on one song each), "several_songs" (two or more
  songs on at least one side show it), or "pattern_across_profiles" (it runs through
  most of both people's picks).
- conversation: how much the difference between them gives a first conversation to
  explore: "little", "some" or "a_lot".

The card is shown to BOTH people. Ground everything in songs and tags; never quote or
paraphrase the portraits, never diagnose, never guess at anyone's life story, and
be gentle and brief with grief or heartbreak. Describe feelings in words, never
numbers. Use song titles exactly as given, only from the right person's list.

Fields (fill the card fields only for a match):
- status: "match" or "insufficient_evidence".
- specificity, evidence_strength, conversation (above), and rationale: one sentence on why
  (internal, not shown).
- threads: 1 or 2, strongest first. why: one sentence naming the shared use of
  music. song_a / song_b: exact title from person A's / person B's list.
  evidence_a / evidence_b: a few words on how that person's pick shows it.
- shared_why: one sentence, the headline of the connection.
- evidence: user_a / user_b, a short reference to each person's strongest pick.
- difference: one meaningful difference between them, framed as something to discuss.
- openers: 2 or 3 short first messages, specific to these songs, that either person
  could send as-is.
- suggested_swap_prompt: one line suggesting which song each should play the other, and why.`;

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    status: { type: Type.STRING, enum: ["match", "insufficient_evidence"] },
    specificity: { type: Type.STRING, enum: Object.keys(SPECIFICITY_POINTS) },
    evidence_strength: { type: Type.STRING, enum: Object.keys(EVIDENCE_POINTS) },
    conversation: { type: Type.STRING, enum: Object.keys(CONVERSATION_POINTS) },
    rationale: { type: Type.STRING },
    threads: {
      type: Type.ARRAY,
      maxItems: "2",
      items: {
        type: Type.OBJECT,
        properties: {
          why: { type: Type.STRING },
          song_a: { type: Type.STRING },
          song_b: { type: Type.STRING },
          evidence_a: { type: Type.STRING },
          evidence_b: { type: Type.STRING },
        },
        required: ["why", "song_a", "song_b", "evidence_a", "evidence_b"],
        propertyOrdering: ["why", "song_a", "song_b", "evidence_a", "evidence_b"],
      },
    },
    shared_why: { type: Type.STRING },
    evidence: {
      type: Type.OBJECT,
      properties: { user_a: { type: Type.STRING }, user_b: { type: Type.STRING } },
      required: ["user_a", "user_b"],
    },
    difference: { type: Type.STRING },
    openers: { type: Type.ARRAY, items: { type: Type.STRING }, maxItems: "3" },
    suggested_swap_prompt: { type: Type.STRING },
  },
  required: ["status", "specificity", "evidence_strength", "conversation", "rationale"],
  propertyOrdering: ["status", "specificity", "evidence_strength", "conversation", "rationale", "threads", "shared_why", "evidence", "difference", "openers", "suggested_swap_prompt"],
};

type RawAssessment = {
  status: "match" | "insufficient_evidence";
  specificity: Rubric["specificity"];
  evidence_strength: Rubric["evidence"];
  conversation: Rubric["conversation"];
  rationale: string;
  threads?: { why: string; song_a: string; song_b: string; evidence_a: string; evidence_b: string }[];
  shared_why?: string;
  evidence?: { user_a: string; user_b: string };
  difference?: string;
  openers?: string[];
  suggested_swap_prompt?: string;
};

function describePerson(label: string, p: PersonForAssessment) {
  const lines = [`${label} (${p.displayName}):`];
  if (p.portrait) {
    const motivations = p.portrait.motivations.map((m) => `${m.label} (${m.description})`).join("; ");
    lines.push(`  portrait: ${p.portrait.headline} Uses music for: ${motivations}.${p.portrait.seeks ? ` Would connect with: ${p.portrait.seeks}` : ""}${p.portrait.tensions ? ` Tension: ${p.portrait.tensions}` : ""}`);
  }
  lines.push("  songs:");
  for (const s of p.picks) {
    const words = s.reasonText ? `; in their words: "${s.reasonText}"` : "";
    lines.push(`  - "${s.title}" by ${s.artist} [tags: ${s.tags.join(", ")}; valence ${s.valence.toFixed(2)}, energy ${s.energy.toFixed(2)}${words}]`);
  }
  return lines.join("\n");
}

const loose = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function songLookup(picks: PortraitPick[]) {
  const byTitle = new Map(picks.map((p) => [loose(p.title), p]));
  return (title: string) => byTitle.get(loose(title)) ?? null;
}

const songRef = (p: PortraitPick): SongRef => ({ title: p.title, artist: p.artist });

/** 1 when two picks sit at the same spot on the mood circle, 0 at opposite edges. */
function moodCloseness(x: PortraitPick, y: PortraitPick) {
  const distance = Math.hypot(x.valence - y.valence, x.energy - y.energy);
  return Math.max(0, 1 - distance / MAX_MOOD_DISTANCE);
}

/** Points from the rubric (Gemini's judgments) plus what's measured: threads and mood closeness. */
function computeScore(rubric: Rubric, anchors: [PortraitPick, PortraitPick][]) {
  const mood = anchors.length ? anchors.reduce((sum, [x, y]) => sum + moodCloseness(x, y), 0) / anchors.length : 0;
  const total =
    BASE_POINTS +
    (SPECIFICITY_POINTS[rubric.specificity] ?? 0) +
    (EVIDENCE_POINTS[rubric.evidence] ?? 0) +
    (CONVERSATION_POINTS[rubric.conversation] ?? 0) +
    (anchors.length >= 2 ? SECOND_THREAD_POINTS : 0) +
    mood * MOOD_POINTS;
  return Math.max(0, Math.min(100, Math.round(total)));
}

/**
 * The AI judgment step for a candidate pair: reads both whole profiles and decides whether there's
 * a specific shared reason to introduce them, rates it on a categorical rubric (the 0-100 score that
 * orders matches is computed from that plus mood closeness, see computeScore), and writes the card. `a` is the requester; card.evidence.user_a and threads[].song_a/evidence_a
 * refer to them until alignCardEvidence reorders for storage. A "match" always has at least one
 * thread whose songs really are in each person's list; anything else is dropped.
 */
export async function assessConnection(
  a: PersonForAssessment,
  b: PersonForAssessment,
  hint?: { songA: string; songB: string }
): Promise<AssessmentResult> {
  const hintLine = hint ? `\nVector search's closest pair (hint only): A's "${hint.songA}" and B's "${hint.songB}".` : "";
  const prompt = `${describePerson("Person A", a)}\n\n${describePerson("Person B", b)}${hintLine}`;
  const { data } = await generateJson<RawAssessment>({ system: SYSTEM_INSTRUCTION, prompt, schema: SCHEMA });

  const rationale = data.rationale?.trim() ?? "";
  const rubric: Rubric = { specificity: data.specificity, evidence: data.evidence_strength, conversation: data.conversation };

  // Only threads whose songs really are in each person's list count, for the card and the score.
  const songOfA = songLookup(a.picks);
  const songOfB = songLookup(b.picks);
  const threads: CardThread[] = [];
  const anchors: [PortraitPick, PortraitPick][] = [];
  for (const t of data.threads ?? []) {
    const pickA = songOfA(t.song_a);
    const pickB = songOfB(t.song_b);
    if (!pickA || !pickB || !t.why?.trim()) continue;
    threads.push({ why: t.why.trim(), song_a: songRef(pickA), song_b: songRef(pickB), evidence_a: t.evidence_a.trim(), evidence_b: t.evidence_b.trim() });
    anchors.push([pickA, pickB]);
  }

  const score = computeScore(rubric, anchors);
  const drop = { status: "insufficient_evidence" as const, score, rationale };
  if (data.status !== "match" || score < MIN_CONNECTION_SCORE) return drop;

  const openers = (data.openers ?? []).map((o) => o.trim()).filter(Boolean);
  if (threads.length === 0 || !data.shared_why?.trim() || openers.length === 0) {
    console.warn(`assessConnection: dropped a "match" with no grounded thread (${a.displayName} / ${b.displayName})`);
    return drop;
  }

  return {
    status: "match",
    card: {
      shared_why: data.shared_why.trim(),
      evidence: {
        user_a: data.evidence?.user_a?.trim() || threads[0].evidence_a,
        user_b: data.evidence?.user_b?.trim() || threads[0].evidence_b,
      },
      difference: data.difference?.trim() ?? "",
      openers,
      suggested_swap_prompt: data.suggested_swap_prompt?.trim() ?? "",
      kind: "match",
      score,
      rationale,
      rubric,
      threads,
    },
  };
}
