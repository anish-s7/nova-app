export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface ConnectionCardJson {
  shared_why: string;
  evidence: { user_a: string; user_b: string };
  difference: string;
  openers: string[];
  suggested_swap_prompt: string;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { created_at: string; display_name: string; id: string };
        Insert: { created_at?: string; display_name: string; id: string };
        Update: { created_at?: string; display_name?: string; id?: string };
        Relationships: [];
      };
      songs: {
        Row: {
          artist: string;
          created_at: string;
          id: string;
          is_public: boolean;
          profile_id: string;
          reason_text: string;
          spotify_track_id: string | null;
          title: string;
        };
        Insert: {
          artist: string;
          created_at?: string;
          id?: string;
          is_public?: boolean;
          profile_id: string;
          reason_text: string;
          spotify_track_id?: string | null;
          title: string;
        };
        Update: {
          artist?: string;
          created_at?: string;
          id?: string;
          is_public?: boolean;
          profile_id?: string;
          reason_text?: string;
          spotify_track_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "songs_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      motivations: {
        Row: {
          created_at: string;
          embedding: number[];
          id: string;
          label: string;
          song_id: string;
        };
        Insert: {
          created_at?: string;
          embedding: number[];
          id?: string;
          label: string;
          song_id: string;
        };
        Update: {
          created_at?: string;
          embedding?: number[];
          id?: string;
          label?: string;
          song_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "motivations_song_id_fkey";
            columns: ["song_id"];
            isOneToOne: false;
            referencedRelation: "songs";
            referencedColumns: ["id"];
          },
        ];
      };
      connection_cards: {
        Row: {
          card_json: ConnectionCardJson;
          created_at: string;
          id: string;
          user_a: string;
          user_b: string;
        };
        Insert: {
          card_json: ConnectionCardJson;
          created_at?: string;
          id?: string;
          user_a: string;
          user_b: string;
        };
        Update: {
          card_json?: ConnectionCardJson;
          created_at?: string;
          id?: string;
          user_a?: string;
          user_b?: string;
        };
        Relationships: [
          {
            foreignKeyName: "connection_cards_user_a_fkey";
            columns: ["user_a"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connection_cards_user_b_fkey";
            columns: ["user_b"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          sender_id: string;
          user_a: string;
          user_b: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          sender_id: string;
          user_a: string;
          user_b: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          sender_id?: string;
          user_a?: string;
          user_b?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_user_a_fkey";
            columns: ["user_a"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_user_b_fkey";
            columns: ["user_b"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      match_profiles: {
        Args: { match_count?: number; target_profile_id: string };
        Returns: {
          display_name: string;
          profile_id: string;
          similarity: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
