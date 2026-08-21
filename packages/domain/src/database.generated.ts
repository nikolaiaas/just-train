export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      ai_job_media: {
        Row: {
          created_at: string;
          family_id: string;
          job_id: string;
          media_asset_id: string;
          ordinal: number;
          slot: string;
        };
        Insert: {
          created_at?: string;
          family_id: string;
          job_id: string;
          media_asset_id: string;
          ordinal?: number;
          slot: string;
        };
        Update: {
          created_at?: string;
          family_id?: string;
          job_id?: string;
          media_asset_id?: string;
          ordinal?: number;
          slot?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_job_media_asset_family_fkey";
            columns: ["media_asset_id", "family_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id", "family_id"];
          },
          {
            foreignKeyName: "ai_job_media_job_family_fkey";
            columns: ["job_id", "family_id"];
            isOneToOne: false;
            referencedRelation: "ai_jobs";
            referencedColumns: ["id", "family_id"];
          },
        ];
      };
      ai_jobs: {
        Row: {
          actual_cost_microusd: number | null;
          attempt_count: number;
          child_profile_id: string | null;
          client_request_id: string;
          completed_at: string | null;
          created_at: string;
          family_id: string | null;
          id: string;
          input_data: Json;
          max_attempts: number;
          max_cost_microusd: number;
          operation_id: string;
          operation_version_id: string;
          output_data: Json | null;
          processing_started_at: string | null;
          public_error_code: string | null;
          queued_at: string | null;
          requested_by: string;
          scope_kind: Database["public"]["Enums"]["ai_job_scope_kind"];
          status: Database["public"]["Enums"]["ai_job_status"];
          subject_kind:
            Database["public"]["Enums"]["media_subject_kind"] | null;
          updated_at: string;
        };
        Insert: {
          actual_cost_microusd?: number | null;
          attempt_count?: number;
          child_profile_id?: string | null;
          client_request_id: string;
          completed_at?: string | null;
          created_at?: string;
          family_id?: string | null;
          id?: string;
          input_data?: Json;
          max_attempts: number;
          max_cost_microusd: number;
          operation_id: string;
          operation_version_id: string;
          output_data?: Json | null;
          processing_started_at?: string | null;
          public_error_code?: string | null;
          queued_at?: string | null;
          requested_by: string;
          scope_kind?: Database["public"]["Enums"]["ai_job_scope_kind"];
          status?: Database["public"]["Enums"]["ai_job_status"];
          subject_kind?:
            Database["public"]["Enums"]["media_subject_kind"] | null;
          updated_at?: string;
        };
        Update: {
          actual_cost_microusd?: number | null;
          attempt_count?: number;
          child_profile_id?: string | null;
          client_request_id?: string;
          completed_at?: string | null;
          created_at?: string;
          family_id?: string | null;
          id?: string;
          input_data?: Json;
          max_attempts?: number;
          max_cost_microusd?: number;
          operation_id?: string;
          operation_version_id?: string;
          output_data?: Json | null;
          processing_started_at?: string | null;
          public_error_code?: string | null;
          queued_at?: string | null;
          requested_by?: string;
          scope_kind?: Database["public"]["Enums"]["ai_job_scope_kind"];
          status?: Database["public"]["Enums"]["ai_job_status"];
          subject_kind?:
            Database["public"]["Enums"]["media_subject_kind"] | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_jobs_child_family_fkey";
            columns: ["child_profile_id", "family_id"];
            isOneToOne: false;
            referencedRelation: "child_profiles";
            referencedColumns: ["id", "family_id"];
          },
          {
            foreignKeyName: "ai_jobs_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_jobs_operation_id_fkey";
            columns: ["operation_id"];
            isOneToOne: false;
            referencedRelation: "ai_operations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_jobs_operation_version_fkey";
            columns: ["operation_version_id", "operation_id"];
            isOneToOne: false;
            referencedRelation: "ai_operation_versions";
            referencedColumns: ["id", "operation_id"];
          },
          {
            foreignKeyName: "ai_jobs_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_operation_versions: {
        Row: {
          created_at: string;
          created_by: string | null;
          gateway: string;
          id: string;
          input_contract: Json;
          max_attempts: number;
          max_cost_microusd: number;
          model: string;
          operation_id: string;
          output_contract: Json;
          prompt_template: string;
          provider: string;
          request_options: Json;
          timeout_ms: number;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          gateway: string;
          id?: string;
          input_contract?: Json;
          max_attempts?: number;
          max_cost_microusd: number;
          model: string;
          operation_id: string;
          output_contract?: Json;
          prompt_template: string;
          provider: string;
          request_options?: Json;
          timeout_ms?: number;
          version: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          gateway?: string;
          id?: string;
          input_contract?: Json;
          max_attempts?: number;
          max_cost_microusd?: number;
          model?: string;
          operation_id?: string;
          output_contract?: Json;
          prompt_template?: string;
          provider?: string;
          request_options?: Json;
          timeout_ms?: number;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ai_operation_versions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_operation_versions_operation_id_fkey";
            columns: ["operation_id"];
            isOneToOne: false;
            referencedRelation: "ai_operations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_operations: {
        Row: {
          active_version_id: string | null;
          capability: string;
          created_at: string;
          created_by: string | null;
          description: string;
          id: string;
          operation_key: string;
          updated_at: string;
        };
        Insert: {
          active_version_id?: string | null;
          capability: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          operation_key: string;
          updated_at?: string;
        };
        Update: {
          active_version_id?: string | null;
          capability?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          operation_key?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_operations_active_version_fkey";
            columns: ["active_version_id", "id"];
            isOneToOne: false;
            referencedRelation: "ai_operation_versions";
            referencedColumns: ["id", "operation_id"];
          },
          {
            foreignKeyName: "ai_operations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      child_exercise_progress: {
        Row: {
          attempts_count: number;
          best_duration_ms: number | null;
          best_repetitions: number | null;
          child_profile_id: string;
          completed_count: number;
          exercise_id: string;
          family_id: string;
          last_attempted_at: string;
          latest_outcome: Database["public"]["Enums"]["attempt_outcome"];
          state: Database["public"]["Enums"]["progress_state"];
          updated_at: string;
        };
        Insert: {
          attempts_count: number;
          best_duration_ms?: number | null;
          best_repetitions?: number | null;
          child_profile_id: string;
          completed_count: number;
          exercise_id: string;
          family_id: string;
          last_attempted_at: string;
          latest_outcome: Database["public"]["Enums"]["attempt_outcome"];
          state: Database["public"]["Enums"]["progress_state"];
          updated_at?: string;
        };
        Update: {
          attempts_count?: number;
          best_duration_ms?: number | null;
          best_repetitions?: number | null;
          child_profile_id?: string;
          completed_count?: number;
          exercise_id?: string;
          family_id?: string;
          last_attempted_at?: string;
          latest_outcome?: Database["public"]["Enums"]["attempt_outcome"];
          state?: Database["public"]["Enums"]["progress_state"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "child_exercise_progress_child_profile_id_fkey";
            columns: ["child_profile_id"];
            isOneToOne: false;
            referencedRelation: "child_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "child_exercise_progress_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "child_exercise_progress_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      child_goals: {
        Row: {
          child_profile_id: string;
          completed_at: string | null;
          goal_id: string;
          id: string;
          selected_at: string;
          selected_by: string;
          status: Database["public"]["Enums"]["child_goal_status"];
          updated_at: string;
        };
        Insert: {
          child_profile_id: string;
          completed_at?: string | null;
          goal_id: string;
          id?: string;
          selected_at?: string;
          selected_by: string;
          status?: Database["public"]["Enums"]["child_goal_status"];
          updated_at?: string;
        };
        Update: {
          child_profile_id?: string;
          completed_at?: string | null;
          goal_id?: string;
          id?: string;
          selected_at?: string;
          selected_by?: string;
          status?: Database["public"]["Enums"]["child_goal_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "child_goals_child_profile_id_fkey";
            columns: ["child_profile_id"];
            isOneToOne: false;
            referencedRelation: "child_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "child_goals_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "child_goals_selected_by_fkey";
            columns: ["selected_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      child_profiles: {
        Row: {
          avatar_seed: string | null;
          avatar_url: string | null;
          created_at: string;
          created_by: string;
          display_name: string;
          family_id: string;
          id: string;
          is_active: boolean;
          preferences: Json;
          updated_at: string;
        };
        Insert: {
          avatar_seed?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          created_by: string;
          display_name: string;
          family_id: string;
          id?: string;
          is_active?: boolean;
          preferences?: Json;
          updated_at?: string;
        };
        Update: {
          avatar_seed?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          created_by?: string;
          display_name?: string;
          family_id?: string;
          id?: string;
          is_active?: boolean;
          preferences?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "child_profiles_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "child_profiles_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      exercise_attempts: {
        Row: {
          attempt_number: number;
          child_profile_id: string;
          created_at: string;
          duration_ms: number | null;
          exercise_id: string;
          id: string;
          notes: string | null;
          occurred_at: string;
          outcome: Database["public"]["Enums"]["attempt_outcome"];
          perceived_difficulty: number | null;
          recorded_by: string;
          repetitions: number | null;
          session_id: string;
          updated_at: string;
        };
        Insert: {
          attempt_number: number;
          child_profile_id?: string;
          created_at?: string;
          duration_ms?: number | null;
          exercise_id: string;
          id?: string;
          notes?: string | null;
          occurred_at?: string;
          outcome: Database["public"]["Enums"]["attempt_outcome"];
          perceived_difficulty?: number | null;
          recorded_by: string;
          repetitions?: number | null;
          session_id: string;
          updated_at?: string;
        };
        Update: {
          attempt_number?: number;
          child_profile_id?: string;
          created_at?: string;
          duration_ms?: number | null;
          exercise_id?: string;
          id?: string;
          notes?: string | null;
          occurred_at?: string;
          outcome?: Database["public"]["Enums"]["attempt_outcome"];
          perceived_difficulty?: number | null;
          recorded_by?: string;
          repetitions?: number | null;
          session_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exercise_attempts_child_profile_id_fkey";
            columns: ["child_profile_id"];
            isOneToOne: false;
            referencedRelation: "child_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercise_attempts_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercise_attempts_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercise_attempts_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "exercise_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      exercise_sessions: {
        Row: {
          child_goal_id: string;
          created_at: string;
          ended_at: string | null;
          id: string;
          notes: string | null;
          started_at: string;
          started_by: string;
          status: Database["public"]["Enums"]["session_status"];
          updated_at: string;
        };
        Insert: {
          child_goal_id: string;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          notes?: string | null;
          started_at?: string;
          started_by: string;
          status?: Database["public"]["Enums"]["session_status"];
          updated_at?: string;
        };
        Update: {
          child_goal_id?: string;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          notes?: string | null;
          started_at?: string;
          started_by?: string;
          status?: Database["public"]["Enums"]["session_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exercise_sessions_child_goal_id_fkey";
            columns: ["child_goal_id"];
            isOneToOne: false;
            referencedRelation: "child_goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercise_sessions_started_by_fkey";
            columns: ["started_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      exercises: {
        Row: {
          content_version: number;
          created_at: string;
          created_by: string | null;
          equipment: string[];
          estimated_minutes: number | null;
          goal_id: string;
          id: string;
          instructions: string;
          is_published: boolean;
          measurement: Database["public"]["Enums"]["exercise_measurement"];
          published_at: string | null;
          safety_notes: string;
          slug: string;
          sort_order: number;
          target_value: number | null;
          title: string;
          updated_at: string;
          video_url: string | null;
        };
        Insert: {
          content_version?: number;
          created_at?: string;
          created_by?: string | null;
          equipment?: string[];
          estimated_minutes?: number | null;
          goal_id: string;
          id?: string;
          instructions?: string;
          is_published?: boolean;
          measurement?: Database["public"]["Enums"]["exercise_measurement"];
          published_at?: string | null;
          safety_notes?: string;
          slug: string;
          sort_order?: number;
          target_value?: number | null;
          title: string;
          updated_at?: string;
          video_url?: string | null;
        };
        Update: {
          content_version?: number;
          created_at?: string;
          created_by?: string | null;
          equipment?: string[];
          estimated_minutes?: number | null;
          goal_id?: string;
          id?: string;
          instructions?: string;
          is_published?: boolean;
          measurement?: Database["public"]["Enums"]["exercise_measurement"];
          published_at?: string | null;
          safety_notes?: string;
          slug?: string;
          sort_order?: number;
          target_value?: number | null;
          title?: string;
          updated_at?: string;
          video_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "exercises_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercises_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
        ];
      };
      families: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "families_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      family_memberships: {
        Row: {
          added_by: string;
          created_at: string;
          family_id: string;
          role: Database["public"]["Enums"]["family_member_role"];
          user_id: string;
        };
        Insert: {
          added_by: string;
          created_at?: string;
          family_id: string;
          role?: Database["public"]["Enums"]["family_member_role"];
          user_id: string;
        };
        Update: {
          added_by?: string;
          created_at?: string;
          family_id?: string;
          role?: Database["public"]["Enums"]["family_member_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "family_memberships_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "family_memberships_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "family_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      goals: {
        Row: {
          content_version: number;
          created_at: string;
          created_by: string | null;
          difficulty: Database["public"]["Enums"]["exercise_difficulty"];
          equipment: string[];
          estimated_minutes: number | null;
          hero_media_url: string | null;
          id: string;
          is_published: boolean;
          published_at: string | null;
          slug: string;
          sort_order: number;
          summary: string;
          title: string;
          topic_id: string;
          updated_at: string;
        };
        Insert: {
          content_version?: number;
          created_at?: string;
          created_by?: string | null;
          difficulty?: Database["public"]["Enums"]["exercise_difficulty"];
          equipment?: string[];
          estimated_minutes?: number | null;
          hero_media_url?: string | null;
          id?: string;
          is_published?: boolean;
          published_at?: string | null;
          slug: string;
          sort_order?: number;
          summary?: string;
          title: string;
          topic_id: string;
          updated_at?: string;
        };
        Update: {
          content_version?: number;
          created_at?: string;
          created_by?: string | null;
          difficulty?: Database["public"]["Enums"]["exercise_difficulty"];
          equipment?: string[];
          estimated_minutes?: number | null;
          hero_media_url?: string | null;
          id?: string;
          is_published?: boolean;
          published_at?: string | null;
          slug?: string;
          sort_order?: number;
          summary?: string;
          title?: string;
          topic_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goals_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goals_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      media_assets: {
        Row: {
          asset_role: Database["public"]["Enums"]["media_asset_role"];
          byte_size: number | null;
          child_profile_id: string | null;
          created_at: string;
          created_by: string;
          delete_after: string | null;
          deleted_at: string | null;
          family_id: string;
          id: string;
          metadata: Json;
          mime_type: string;
          sha256_hex: string | null;
          status: Database["public"]["Enums"]["media_asset_status"];
          storage_bucket: string;
          storage_object_path: string;
          subject_kind: Database["public"]["Enums"]["media_subject_kind"];
          updated_at: string;
        };
        Insert: {
          asset_role: Database["public"]["Enums"]["media_asset_role"];
          byte_size?: number | null;
          child_profile_id?: string | null;
          created_at?: string;
          created_by: string;
          delete_after?: string | null;
          deleted_at?: string | null;
          family_id: string;
          id?: string;
          metadata?: Json;
          mime_type: string;
          sha256_hex?: string | null;
          status?: Database["public"]["Enums"]["media_asset_status"];
          storage_bucket?: string;
          storage_object_path: string;
          subject_kind: Database["public"]["Enums"]["media_subject_kind"];
          updated_at?: string;
        };
        Update: {
          asset_role?: Database["public"]["Enums"]["media_asset_role"];
          byte_size?: number | null;
          child_profile_id?: string | null;
          created_at?: string;
          created_by?: string;
          delete_after?: string | null;
          deleted_at?: string | null;
          family_id?: string;
          id?: string;
          metadata?: Json;
          mime_type?: string;
          sha256_hex?: string | null;
          status?: Database["public"]["Enums"]["media_asset_status"];
          storage_bucket?: string;
          storage_object_path?: string;
          subject_kind?: Database["public"]["Enums"]["media_subject_kind"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "media_assets_child_family_fkey";
            columns: ["child_profile_id", "family_id"];
            isOneToOne: false;
            referencedRelation: "child_profiles";
            referencedColumns: ["id", "family_id"];
          },
          {
            foreignKeyName: "media_assets_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_assets_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          id: string;
          is_admin: boolean;
          locale: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          is_admin?: boolean;
          locale?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          is_admin?: boolean;
          locale?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      topics: {
        Row: {
          accent_color: string | null;
          content_version: number;
          created_at: string;
          created_by: string | null;
          description: string;
          icon: string | null;
          id: string;
          is_published: boolean;
          published_at: string | null;
          slug: string;
          sort_order: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          accent_color?: string | null;
          content_version?: number;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          icon?: string | null;
          id?: string;
          is_published?: boolean;
          published_at?: string | null;
          slug: string;
          sort_order?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          accent_color?: string | null;
          content_version?: number;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          icon?: string | null;
          id?: string;
          is_published?: boolean;
          published_at?: string | null;
          slug?: string;
          sort_order?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "topics_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_admin_ai_job_for_worker: {
        Args: { p_job_id: string };
        Returns: {
          attempt_number: number;
          gateway: string;
          input_contract: Json;
          input_data: Json;
          job_id: string;
          max_cost_microusd: number;
          model: string;
          operation_key: string;
          output_contract: Json;
          prompt_template: string;
          provider: string;
          request_options: Json;
          timeout_ms: number;
        }[];
      };
      claim_ai_media_job_for_worker: {
        Args: { p_job_id: string };
        Returns: {
          attempt_number: number;
          gateway: string;
          input_contract: Json;
          input_mime_type: string;
          input_object_path: string;
          job_id: string;
          max_cost_microusd: number;
          model: string;
          output_asset_id: string;
          output_contract: Json;
          output_object_path: string;
          prompt_template: string;
          provider: string;
          request_options: Json;
          storage_bucket: string;
          timeout_ms: number;
        }[];
      };
      complete_admin_ai_job_for_worker: {
        Args: {
          p_attempt_number: number;
          p_cost_microusd: number;
          p_job_id: string;
          p_output_data: Json;
          p_provider_request_id: string;
          p_usage: Json;
        };
        Returns: undefined;
      };
      complete_ai_media_job_for_worker: {
        Args: {
          p_attempt_number: number;
          p_cost_microusd: number;
          p_job_id: string;
          p_output_asset_id: string;
          p_output_byte_size: number;
          p_output_sha256_hex: string;
          p_provider_request_id: string;
          p_usage: Json;
        };
        Returns: undefined;
      };
      complete_parent_onboarding: {
        Args: { p_display_name: string; p_family_name: string };
        Returns: {
          created: boolean;
          display_name: string;
          family_id: string;
          family_name: string;
          profile_id: string;
          role: Database["public"]["Enums"]["family_member_role"];
        }[];
      };
      create_child_profile: {
        Args: {
          p_avatar_seed: string;
          p_consent_granted: boolean;
          p_consent_version: string;
          p_creation_request_id: string;
          p_display_name: string;
          p_expected_user_id: string;
          p_family_id: string;
        };
        Returns: {
          avatar_seed: string;
          child_profile_id: string;
          consent_version: string;
          consented_at: string;
          created: boolean;
          display_name: string;
          family_id: string;
          is_active: boolean;
        }[];
      };
      fail_admin_ai_job_for_worker: {
        Args: {
          p_attempt_error_code: string;
          p_attempt_number: number;
          p_cost_microusd?: number;
          p_job_id: string;
          p_provider_request_id?: string;
          p_public_error_code: string;
          p_usage?: Json;
        };
        Returns: undefined;
      };
      fail_ai_media_job_for_worker: {
        Args: {
          p_attempt_error_code: string;
          p_attempt_number: number;
          p_cost_microusd?: number;
          p_job_id: string;
          p_provider_request_id?: string;
          p_public_error_code: string;
          p_usage?: Json;
        };
        Returns: undefined;
      };
      prepare_admin_ai_job: {
        Args: {
          p_client_request_id: string;
          p_input_data: Json;
          p_operation_key: string;
        };
        Returns: {
          job_id: string;
          job_status: Database["public"]["Enums"]["ai_job_status"];
        }[];
      };
      prepare_ai_media_job: {
        Args: {
          p_child_profile_id?: string;
          p_client_request_id: string;
          p_expected_user_id: string;
          p_family_id: string;
          p_input_mime_type: string;
          p_operation_key: string;
          p_subject_kind: Database["public"]["Enums"]["media_subject_kind"];
        };
        Returns: {
          created: boolean;
          input_asset_id: string;
          input_object_path: string;
          job_id: string;
          job_status: Database["public"]["Enums"]["ai_job_status"];
          output_asset_id: string;
          storage_bucket: string;
        }[];
      };
      publish_ai_operation_version: {
        Args: {
          p_expected_active_version_id: string;
          p_operation_key: string;
          p_prompt_template: string;
        };
        Returns: {
          operation_id: string;
          operation_version_id: string;
          version: number;
        }[];
      };
    };
    Enums: {
      ai_job_scope_kind: "family" | "admin";
      ai_job_status:
        "awaiting_upload" | "processing" | "succeeded" | "failed" | "cancelled";
      attempt_outcome: "completed" | "partial" | "skipped";
      child_goal_status: "active" | "completed" | "archived";
      exercise_difficulty: "beginner" | "intermediate" | "advanced";
      exercise_measurement: "completion" | "repetitions" | "duration";
      family_member_role: "owner" | "caregiver";
      media_asset_role: "reference_input" | "generated_output";
      media_asset_status: "pending" | "ready" | "failed" | "deleted";
      media_subject_kind: "synthetic" | "adult_test" | "child";
      progress_state: "in_progress" | "completed";
      session_status: "in_progress" | "completed" | "abandoned";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_job_scope_kind: ["family", "admin"],
      ai_job_status: [
        "awaiting_upload",
        "processing",
        "succeeded",
        "failed",
        "cancelled",
      ],
      attempt_outcome: ["completed", "partial", "skipped"],
      child_goal_status: ["active", "completed", "archived"],
      exercise_difficulty: ["beginner", "intermediate", "advanced"],
      exercise_measurement: ["completion", "repetitions", "duration"],
      family_member_role: ["owner", "caregiver"],
      media_asset_role: ["reference_input", "generated_output"],
      media_asset_status: ["pending", "ready", "failed", "deleted"],
      media_subject_kind: ["synthetic", "adult_test", "child"],
      progress_state: ["in_progress", "completed"],
      session_status: ["in_progress", "completed", "abandoned"],
    },
  },
} as const;
