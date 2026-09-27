/**
 * Hand-written placeholder types mirroring db/contract.md.
 * Replace with `supabase gen types typescript` output once the real
 * schema is applied — keep the shape in sync with db/contract.md until then.
 */
import type { CardThread, Portrait } from "../portrait";
import type { SongSwapPayloadV1 } from "../types";

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
          /** Illustrated-face settings (lib/avatar.ts Face), null = generated from the name. Migration 20260930000000 (may not be applied yet). */
          avatar: unknown;
          /** Public URL of an uploaded photo in the `avatars` bucket, overriding the face. Migration 20260930000000. */
          avatar_url: string | null;
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
          avatar: unknown;
          avatar_url: string | null;
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
      listening_connections: {
        Row: {
          id: string;
          profile_id: string;
          provider: Database["public"]["Enums"]["listening_provider"];
          canonical_username: string;
          verification_state: "unverified";
          status: Database["public"]["Enums"]["listening_connection_status"];
          generation: number;
          consent_version: string;
          consented_at: string;
          last_successful_query_at: string | null;
          latest_observed_listen_at: string | null;
          next_due_at: string;
          safe_error_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          provider: Database["public"]["Enums"]["listening_provider"];
          canonical_username: string;
          verification_state?: "unverified";
          status?: Database["public"]["Enums"]["listening_connection_status"];
          generation?: number;
          consent_version: string;
          consented_at?: string;
          last_successful_query_at?: string | null;
          latest_observed_listen_at?: string | null;
          next_due_at?: string;
          safe_error_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["listening_connections"]["Insert"]>;
        Relationships: [];
      };
      listening_preferences: {
        Row: {
          profile_id: string;
          primary_connection_id: string | null;
          timezone: string;
          exploration_setting: "close" | "balanced" | "explore";
          input_revision: number;
          raw_retention_days: number;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          primary_connection_id?: string | null;
          timezone?: string;
          exploration_setting?: "close" | "balanced" | "explore";
          input_revision?: number;
          raw_retention_days?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["listening_preferences"]["Insert"]>;
        Relationships: [];
      };
      listening_tracks: {
        Row: {
          id: string;
          profile_id: string;
          title: string;
          artist_credit: string;
          credited_artist_key: string;
          album_hint: string | null;
          version_hint: string | null;
          identity_fingerprint: string;
          catalog_song_id: string | null;
          identity_status: Database["public"]["Enums"]["listening_identity_status"];
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          title: string;
          artist_credit: string;
          credited_artist_key: string;
          album_hint?: string | null;
          version_hint?: string | null;
          identity_fingerprint: string;
          catalog_song_id?: string | null;
          identity_status?: Database["public"]["Enums"]["listening_identity_status"];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["listening_tracks"]["Insert"]>;
        Relationships: [];
      };
      listening_track_aliases: {
        Row: {
          id: string;
          profile_id: string;
          provider: Database["public"]["Enums"]["listening_provider"];
          namespace: string;
          identifier: string;
          track_id: string;
          resolution_method: string;
          provenance: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["listening_track_aliases"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["listening_track_aliases"]["Insert"]>;
        Relationships: [];
      };
      listening_events: {
        Row: {
          id: string;
          profile_id: string;
          connection_id: string;
          connection_generation: number;
          track_id: string;
          played_at: string;
          idempotency_fingerprint: string;
          provider_event_id: string | null;
          source_metadata: Record<string, unknown>;
          excluded: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["listening_events"]["Row"], "id" | "created_at" | "source_metadata" | "excluded"> & {
          id?: string;
          source_metadata?: Record<string, unknown>;
          excluded?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["listening_events"]["Insert"]>;
        Relationships: [];
      };
      listening_sync_jobs: {
        Row: {
          id: string;
          profile_id: string;
          connection_id: string;
          connection_generation: number;
          state: Database["public"]["Enums"]["listening_sync_state"];
          kind: Database["public"]["Enums"]["listening_sync_kind"];
          range_lower: string;
          range_upper: string;
          continuation: Record<string, unknown> | null;
          checkpoint_revision: number;
          lease_token: string | null;
          lease_expires_at: string | null;
          attempt_count: number;
          next_attempt_at: string;
          pages_fetched: number;
          events_seen: number;
          events_inserted: number;
          events_deduplicated: number;
          safe_error_code: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          profile_id: string;
          connection_id: string;
          connection_generation: number;
          state?: Database["public"]["Enums"]["listening_sync_state"];
          kind: Database["public"]["Enums"]["listening_sync_kind"];
          range_lower: string;
          range_upper: string;
          continuation?: Record<string, unknown> | null;
          checkpoint_revision?: number;
          lease_token?: string | null;
          lease_expires_at?: string | null;
          attempt_count?: number;
          next_attempt_at?: string;
          pages_fetched?: number;
          events_seen?: number;
          events_inserted?: number;
          events_deduplicated?: number;
          safe_error_code?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["listening_sync_jobs"]["Insert"]>;
        Relationships: [];
      };
      listening_daily_tracks: {
        Row: {
          profile_id: string;
          connection_id: string;
          track_id: string;
          local_date: string;
          play_count: number;
          distinct_observed_timestamps: number;
          aggregation_revision: number;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["listening_daily_tracks"]["Row"], "updated_at"> & {
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["listening_daily_tracks"]["Insert"]>;
        Relationships: [];
      };
      listening_dirty_dates: {
        Row: {
          profile_id: string;
          connection_id: string;
          local_date: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["listening_dirty_dates"]["Row"], "created_at"> & {
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      listening_provider_pacing: {
        Row: {
          provider: Database["public"]["Enums"]["listening_provider"];
          not_before: string;
          updated_at: string;
        };
        Insert: {
          provider: Database["public"]["Enums"]["listening_provider"];
          not_before?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["listening_provider_pacing"]["Insert"]>;
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
          kind: "text" | "song_swap";
          payload: SongSwapPayloadV1 | null;
          created_at: string;
        };
        Insert: {
          user_a: string;
          user_b: string;
          sender_id: string;
          body: string;
          kind?: "text" | "song_swap";
          payload?: SongSwapPayloadV1 | null;
        };
        Update: Partial<{
          body: string;
          kind: "text" | "song_swap";
          payload: SongSwapPayloadV1 | null;
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
      claim_listening_job: {
        Args: { p_now: string };
        Returns: {
          id: string;
          profile_id: string;
          connection_id: string;
          connection_generation: number;
          provider: Database["public"]["Enums"]["listening_provider"];
          canonical_username: string;
          kind: Database["public"]["Enums"]["listening_sync_kind"];
          range_lower: string;
          range_upper: string;
          continuation: Record<string, unknown> | null;
          checkpoint_revision: number;
          lease_token: string;
          lease_expires_at: string;
        }[];
      };
      commit_listening_page: {
        Args: {
          p_job_id: string;
          p_lease_token: string;
          p_connection_generation: number;
          p_expected_checkpoint_revision: number;
          p_events: unknown;
          p_next_continuation: Record<string, unknown> | null;
          p_range_complete: boolean;
        };
        Returns: { inserted: number; duplicates: number; input_revision: number }[];
      };
      release_listening_job: {
        Args: {
          p_job_id: string;
          p_lease_token: string;
          p_connection_generation: number;
          p_expected_checkpoint_revision: number;
          p_next_attempt_at: string;
        };
        Returns: undefined;
      };
      fail_listening_job: {
        Args: {
          p_job_id: string;
          p_lease_token: string;
          p_connection_generation: number;
          p_expected_checkpoint_revision: number;
          p_retryable: boolean;
          p_next_attempt_at: string;
          p_safe_error_code: string;
        };
        Returns: undefined;
      };
      reserve_listening_provider_request: {
        Args: {
          p_provider: Database["public"]["Enums"]["listening_provider"];
          p_min_interval_ms: number;
        };
        Returns: string;
      };
      configure_listening_connection: {
        Args: {
          p_profile_id: string;
          p_provider: Database["public"]["Enums"]["listening_provider"];
          p_canonical_username: string;
          p_consent_version: string;
          p_now: string;
        };
        Returns: { connection_id: string; job_id: string }[];
      };
      enqueue_listening_sync: {
        Args: { p_profile_id: string; p_connection_id: string; p_now: string };
        Returns: string;
      };
      disconnect_listening_connection: {
        Args: {
          p_profile_id: string;
          p_provider: Database["public"]["Enums"]["listening_provider"];
        };
        Returns: boolean;
      };
      set_listening_preferences: {
        Args: {
          p_profile_id: string;
          p_primary_connection_id: string | null;
          p_timezone: string;
          p_exploration_setting: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      listening_provider: "lastfm" | "listenbrainz";
      listening_connection_status: "active" | "error" | "disconnected";
      listening_identity_status: "unresolved" | "catalog_matched" | "ambiguous";
      listening_sync_state: "queued" | "running" | "retry_wait" | "complete" | "failed" | "cancelled";
      listening_sync_kind: "backfill" | "incremental" | "reconcile";
    };
    CompositeTypes: Record<string, never>;
  };
}
