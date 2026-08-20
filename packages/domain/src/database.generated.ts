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
          goal_id: string;
          id: string;
          instructions: string;
          is_published: boolean;
          measurement: Database["public"]["Enums"]["exercise_measurement"];
          published_at: string | null;
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
          goal_id: string;
          id?: string;
          instructions?: string;
          is_published?: boolean;
          measurement?: Database["public"]["Enums"]["exercise_measurement"];
          published_at?: string | null;
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
          goal_id?: string;
          id?: string;
          instructions?: string;
          is_published?: boolean;
          measurement?: Database["public"]["Enums"]["exercise_measurement"];
          published_at?: string | null;
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
      [_ in never]: never;
    };
    Enums: {
      attempt_outcome: "completed" | "partial" | "skipped";
      child_goal_status: "active" | "completed" | "archived";
      exercise_difficulty: "beginner" | "intermediate" | "advanced";
      exercise_measurement: "completion" | "repetitions" | "duration";
      family_member_role: "owner" | "caregiver";
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
      attempt_outcome: ["completed", "partial", "skipped"],
      child_goal_status: ["active", "completed", "archived"],
      exercise_difficulty: ["beginner", "intermediate", "advanced"],
      exercise_measurement: ["completion", "repetitions", "duration"],
      family_member_role: ["owner", "caregiver"],
      progress_state: ["in_progress", "completed"],
      session_status: ["in_progress", "completed", "abandoned"],
    },
  },
} as const;
