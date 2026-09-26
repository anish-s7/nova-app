export type Song = {
  id: string;
  title: string;
  artist: string;
  albumArtUrl?: string;
  spotifyId?: string;
  source: "spotify" | "manual";
};

export type ContextTag =
  | "late_night"
  | "on_repeat"
  | "commute"
  | "workout"
  | "alone"
  | "with_friends"
  | "studying"
  | "after_a_hard_day"
  | "getting_ready";

export type ListeningSignal = {
  songId: string;
  playCount?: number;
  lateNightShare?: number;
  contextTags: ContextTag[];
};

export type Evidence = {
  kind: "listening_pattern" | "song_context" | "user_tag";
  text: string;
  songIds: string[];
};

export type InferredMotivation = {
  id: string;
  label: string;
  description: string;
  cluster: string;
  confidence: number;
  evidence: Evidence[];
  feedback: "unreviewed" | "confirmed" | "rejected";
  isPublic: boolean;
  note?: string;
};

export type User = {
  id: string;
  name: string;
  avatarUrl?: string;
  songs: Song[];
  motivations: InferredMotivation[];
};

export type AnalysisResult = {
  headline: string;
  motivations: InferredMotivation[];
  highlights: string[];
};

// GET /api/galaxy
export type GalaxyNode = {
  userId: string;
  name: string;
  avatarUrl?: string;
  cluster: string;
  topMotivations: string[];
  isMe: boolean;
};

export type GalaxyEdge = {
  source: string;
  target: string;
  similarity: number;
  sharedMotivation: string;
  sharedSongs: number;
  sharedArtists: number;
};

export type GalaxyResponse = {
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
  topMatchId?: string;
  status: "ready" | "processing";
};

export type SharedEvidence = { song: Song; text: string };

export type ConnectionCard = {
  userA: string;
  userB: string;
  overlap: { sharedSongs: number; sharedArtists: number };
  sharedMotivations: { motivation: string; evidenceA: SharedEvidence; evidenceB: SharedEvidence }[];
  meaningfulDifference: { summary: string; evidenceA: string; evidenceB: string };
  suggestedOpeners: string[];
};

export type SongSwap = {
  id: string;
  fromUserId: string;
  toUserId: string;
  song: Song;
  reason: string;
  status: "pending" | "returned";
};

// App-level shapes returned by the mock route handlers.

export type Connection = {
  user: Pick<User, "id" | "name" | "avatarUrl">;
  cluster: string;
  similarity: number;
  sharedMotivation: string;
  sharedSongs: number;
  sharedArtists: number;
};

export type Message =
  | { id: string; fromUserId: string; sentAt: string; kind: "text"; text: string }
  | { id: string; fromUserId: string; sentAt: string; kind: "swap"; swap: SongSwap };

export type ConversationSummary = {
  userId: string;
  name: string;
  avatarUrl?: string;
  cluster: string;
  lastMessage?: Message;
};

export type Conversation = {
  user: Pick<User, "id" | "name" | "avatarUrl">;
  cluster: string;
  sharedMotivation?: string;
  messages: Message[];
  suggestedOpeners: string[];
};

export type SpotifyImport = { songs: Song[]; signals: ListeningSignal[] };
