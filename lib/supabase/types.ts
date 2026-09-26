/**
 * Hand-written placeholder types mirroring db/contract.md.
 * Replace with `supabase gen types typescript` output once the real
 * schema is applied — keep the shape in sync with db/contract.md until then.
 */

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
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          /** One of lib/clusters.ts CLUSTER_IDS. Not populated yet: needed by galaxy_pool (db/galaxy_window.sql). */
          primary_cluster: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          primary_cluster?: string | null;
        };
        Update: Partial<{
          display_name: string;
          primary_cluster: string | null;
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
        };
        Update: Partial<{
          tags: string[];
          valence: number;
          energy: number;
          embedding: number[];
          reason_text: string | null;
          is_public: boolean;
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
