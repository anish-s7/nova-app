/**
 * Hand-written placeholder types mirroring db/contract.md.
 * Replace with `supabase gen types typescript` output once the real
 * schema is applied — keep the shape in sync with db/contract.md until then.
 */
import type { CardThread, Portrait } from "../portrait";

export interface ConnectionCardJson {
  shared_why: string;
  evidence: {
    user_a: string;
    user_b: string;
  };
  difference: string;
  openers: string[];
  suggested_swap_prompt: string;
  /** Absent means a regular match card. "contrast" cards come from Wander (same song, different feeling). */
  kind?: "match" | "contrast";
  /** Contrast cards only: the one song both people picked. Plain strings, never a Spotify payload. */
  shared_song?: { title: string; artist: string };
  /** Whole-profile assessment (lib/gemini/assessConnection.ts): 0..100, sets the match order. Absent on older cards. */
  score?: number;
  /** Why the AI judged this a connection, in a sentence. Not shown to users. */
  rationale?: string;
  /** The AI's categorical judgments the score is computed from (lib/gemini/assessConnection.ts). Not shown. */
  rubric?: { specificity: string; evidence: string; conversation: string };
  /** 1–2 specific shared threads, each anchored by a song on each side. Absent on older cards. */
  threads?: CardThread[];
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          /**
           * Pre-migration column (still what the hosted project actually has). One of
           * lib/clusters.ts CLUSTER_IDS. Superseded by primary_topic_cluster_id below once
           * migration 20260929000000 is applied — see db/contract.md's topic_clusters notes.
           */
          primary_cluster: string | null;
          /** Post-migration replacement for primary_cluster (not live on the hosted project yet). FK -> topic_clusters.id. Written by lib/matching/refreshPrimaryCluster.ts and scripts/recompute-topic-clusters.ts (service role). */
          primary_topic_cluster_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          primary_cluster?: string | null;
          primary_topic_cluster_id?: string | null;
        };
        Update: Partial<{
          display_name: string;
          primary_cluster: string | null;
          primary_topic_cluster_id: string | null;
        }>;
        Relationships: [];
      };
      topic_clusters: {
        Row: {
          id: string;
          label: string;
          short: string;
          description: string | null;
          color: string;
          centroid: number[] | null;
          member_count: number;
          created_at: string;
          superseded_by: string | null;
        };
        Insert: {
          id?: string;
          label: string;
          short: string;
          description?: string | null;
          color: string;
          centroid?: number[] | null;
          member_count?: number;
          superseded_by?: string | null;
        };
        Update: Partial<{
          label: string;
          short: string;
          description: string | null;
          color: string;
          centroid: number[] | null;
          member_count: number;
          superseded_by: string | null;
        }>;
        Relationships: [];
      };
      songs: {
        Row: {
          id: string;
          title: string;
          artist: string;
          mbid: string | null;
          fallback_key: string | null;
          resolution_source: "musicbrainz" | "gemini_fallback";
          spotify_track_id: string | null;
          album_art_url: string | null;
          context_summary: string | null;
          embedding: number[] | null;
          created_at: string;
        };
        Insert: {
          title: string;
          artist: string;
          mbid?: string | null;
          fallback_key?: string | null;
          resolution_source: "musicbrainz" | "gemini_fallback";
          spotify_track_id?: string | null;
          album_art_url?: string | null;
          context_summary?: string | null;
          embedding?: number[] | null;
        };
        Update: Partial<{
          context_summary: string | null;
          embedding: number[] | null;
        }>;
        Relationships: [];
      };
      song_picks: {
        Row: {
          id: string;
          profile_id: string;
          song_id: string;
          tags: string[];
          valence: number;
          energy: number;
          embedding: number[];
          reason_text: string | null;
          is_public: boolean;
          created_at: string;
          /** Last time the pick's feelings changed (20260928000000_one_pick_per_song.sql). */
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          song_id: string;
          tags: string[];
          valence: number;
          energy: number;
          embedding: number[];
          reason_text?: string | null;
          is_public?: boolean;
          updated_at?: string;
        };
        Update: Partial<{
          tags: string[];
          valence: number;
          energy: number;
          embedding: number[];
          reason_text: string | null;
          is_public: boolean;
          updated_at: string;
        }>;
        Relationships: [];
      };
      connection_cards: {
        Row: {
          id: string;
          user_a: string;
          user_b: string;
          card_json: ConnectionCardJson;
          created_at: string;
        };
        Insert: {
          user_a: string;
          user_b: string;
          card_json: ConnectionCardJson;
        };
        Update: Partial<{
          card_json: ConnectionCardJson;
        }>;
        Relationships: [];
      };
      profile_portraits: {
        Row: {
          profile_id: string;
          portrait: Portrait;
          pick_count: number;
          /** Newest song_picks.updated_at this portrait was generated from. Null = predates tracking. */
          picks_updated_at: string | null;
          model: string;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          portrait: Portrait;
          pick_count: number;
          picks_updated_at?: string | null;
          model: string;
          updated_at?: string;
        };
        Update: Partial<{
          portrait: Portrait;
          pick_count: number;
          picks_updated_at: string | null;
          model: string;
          updated_at: string;
        }>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          user_a: string;
          user_b: string;
          sender_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          user_a: string;
          user_b: string;
          sender_id: string;
          body: string;
        };
        Update: Partial<{
          body: string;
        }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      match_picks: {
        Args: { target_profile_id: string; match_count?: number };
        Returns: {
          profile_id: string;
          display_name: string;
          song_pick_id: string;
          target_pick_id: string;
          similarity: number;
        }[];
      };
      galaxy_pool: {
        Args: { target_profile_id: string; near_size?: number; fresh_size?: number; fresh_days?: number };
        Returns: {
          profile_id: string;
          display_name: string;
          cluster: string;
          similarity: number;
          joined_days_ago: number;
          tags: string[];
          valence: number;
          energy: number;
          source: "near" | "fresh";
        }[];
      };
      galaxy_cluster_counts: {
        Args: { target_profile_id: string };
        Returns: { cluster: string; people: number }[];
      };
      wander_picks: {
        Args: { target_profile_id: string; match_count?: number; min_emotion_gap?: number };
        Returns: {
          profile_id: string;
          display_name: string;
          song_pick_id: string;
          target_pick_id: string;
          emotion_gap: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
