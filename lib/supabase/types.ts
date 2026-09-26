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
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
        };
        Update: Partial<{
          display_name: string;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
