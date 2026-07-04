export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      biometrics: {
        Row: {
          id: string
          ingested_at: string
          kind: string
          recorded_at: string
          user_id: string
          value: Json
        }
        Insert: {
          id?: string
          ingested_at?: string
          kind: string
          recorded_at?: string
          user_id: string
          value: Json
        }
        Update: {
          id?: string
          ingested_at?: string
          kind?: string
          recorded_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: []
      }
      chat_debug_payloads: {
        Row: {
          created_at: string
          events_block: string | null
          events_count: number
          events_newest: string | null
          events_oldest: string | null
          id: string
          retried: boolean
          stale_events_count: number
          system_prompt: string
          thread_id: string
          user_id: string
          validator_status: string | null
        }
        Insert: {
          created_at?: string
          events_block?: string | null
          events_count?: number
          events_newest?: string | null
          events_oldest?: string | null
          id?: string
          retried?: boolean
          stale_events_count?: number
          system_prompt: string
          thread_id: string
          user_id: string
          validator_status?: string | null
        }
        Update: {
          created_at?: string
          events_block?: string | null
          events_count?: number
          events_newest?: string | null
          events_oldest?: string | null
          id?: string
          retried?: boolean
          stale_events_count?: number
          system_prompt?: string
          thread_id?: string
          user_id?: string
          validator_status?: string | null
        }
        Relationships: []
      }
      chat_jobs: {
        Row: {
          assistant_message_id: string | null
          attempts: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          locked_at: string | null
          provider_snapshot: Json | null
          request_payload: Json
          started_at: string | null
          status: string
          system_snapshot: string | null
          thread_id: string
          updated_at: string
          user_id: string
          worker_lock: string | null
        }
        Insert: {
          assistant_message_id?: string | null
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          locked_at?: string | null
          provider_snapshot?: Json | null
          request_payload: Json
          started_at?: string | null
          status?: string
          system_snapshot?: string | null
          thread_id: string
          updated_at?: string
          user_id: string
          worker_lock?: string | null
        }
        Update: {
          assistant_message_id?: string | null
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          locked_at?: string | null
          provider_snapshot?: Json | null
          request_payload?: Json
          started_at?: string | null
          status?: string
          system_snapshot?: string | null
          thread_id?: string
          updated_at?: string
          user_id?: string
          worker_lock?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          all_day: boolean
          created_at: string
          id: string
          notes: string | null
          occurred_at: string
          title: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          occurred_at: string
          title: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          occurred_at?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      memories: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json
          source: string
          thread_id: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          source?: string
          thread_id?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          source?: string
          thread_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memories_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          parts: Json | null
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          parts?: Json | null
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          parts?: Json | null
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_followups: {
        Row: {
          created_at: string
          cue: string | null
          due_at: string
          id: string
          keywords: string[]
          raised_at: string | null
          resolved_at: string | null
          resolved_source: string | null
          status: string
          thread_id: string | null
          topic: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cue?: string | null
          due_at: string
          id?: string
          keywords?: string[]
          raised_at?: string | null
          resolved_at?: string | null
          resolved_source?: string | null
          status?: string
          thread_id?: string | null
          topic: string
          user_id: string
        }
        Update: {
          created_at?: string
          cue?: string | null
          due_at?: string
          id?: string
          keywords?: string[]
          raised_at?: string | null
          resolved_at?: string | null
          resolved_source?: string | null
          status?: string
          thread_id?: string | null
          topic?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_followups_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      personality_portrait: {
        Row: {
          communication: string
          energy: string
          explicit_preferences: string[]
          freeform_notes: string
          interests_ideas: string
          last_synthesized_at: string | null
          mood: string
          turns_since_synthesis: number
          updated_at: string
          user_id: string
          values_worldview: string
        }
        Insert: {
          communication?: string
          energy?: string
          explicit_preferences?: string[]
          freeform_notes?: string
          interests_ideas?: string
          last_synthesized_at?: string | null
          mood?: string
          turns_since_synthesis?: number
          updated_at?: string
          user_id: string
          values_worldview?: string
        }
        Update: {
          communication?: string
          energy?: string
          explicit_preferences?: string[]
          freeform_notes?: string
          interests_ideas?: string
          last_synthesized_at?: string | null
          mood?: string
          turns_since_synthesis?: number
          updated_at?: string
          user_id?: string
          values_worldview?: string
        }
        Relationships: []
      }
      personality_portrait_history: {
        Row: {
          change_source: string
          communication: string
          energy: string
          explicit_preferences: string[]
          freeform_notes: string
          id: string
          interests_ideas: string
          mood: string
          snapshot_at: string
          user_id: string
          values_worldview: string
        }
        Insert: {
          change_source?: string
          communication?: string
          energy?: string
          explicit_preferences?: string[]
          freeform_notes?: string
          id?: string
          interests_ideas?: string
          mood?: string
          snapshot_at?: string
          user_id: string
          values_worldview?: string
        }
        Update: {
          change_source?: string
          communication?: string
          energy?: string
          explicit_preferences?: string[]
          freeform_notes?: string
          id?: string
          interests_ideas?: string
          mood?: string
          snapshot_at?: string
          user_id?: string
          values_worldview?: string
        }
        Relationships: []
      }
      personality_rules: {
        Row: {
          created_at: string
          directive: string
          emotion_score: number
          id: string
          polarity: string
          reason: string | null
          recalibrate_after: string | null
          source_message: string | null
          status: string
          thread_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          directive: string
          emotion_score?: number
          id?: string
          polarity: string
          reason?: string | null
          recalibrate_after?: string | null
          source_message?: string | null
          status?: string
          thread_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          directive?: string
          emotion_score?: number
          id?: string
          polarity?: string
          reason?: string | null
          recalibrate_after?: string | null
          source_message?: string | null
          status?: string
          thread_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personality_rules_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      personality_style: {
        Row: {
          avg_message_length: number
          caps_rate: number
          contraction_rate: number
          created_at: string
          emoji_rate: number
          exclamation_rate: number
          profanity_rate: number
          question_rate: number
          sample_count: number
          traits: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_message_length?: number
          caps_rate?: number
          contraction_rate?: number
          created_at?: string
          emoji_rate?: number
          exclamation_rate?: number
          profanity_rate?: number
          question_rate?: number
          sample_count?: number
          traits?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_message_length?: number
          caps_rate?: number
          contraction_rate?: number
          created_at?: string
          emoji_rate?: number
          exclamation_rate?: number
          profanity_rate?: number
          question_rate?: number
          sample_count?: number
          traits?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          dob: string | null
          persona_brief: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          dob?: string | null
          persona_brief?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          dob?: string | null
          persona_brief?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staged_tasks: {
        Row: {
          created_at: string
          decided_at: string | null
          description: string | null
          due_at: string | null
          id: string
          payload: Json
          status: string
          thread_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          payload?: Json
          status?: string
          thread_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          payload?: Json
          status?: string
          thread_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staged_tasks_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          carried_from_thread_id: string | null
          continuity_note: string | null
          continuity_status: string
          created_at: string
          day_key: string | null
          id: string
          is_daily_root: boolean
          last_message_at: string
          parent_thread_id: string | null
          timezone: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          carried_from_thread_id?: string | null
          continuity_note?: string | null
          continuity_status?: string
          created_at?: string
          day_key?: string | null
          id?: string
          is_daily_root?: boolean
          last_message_at?: string
          parent_thread_id?: string | null
          timezone?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          carried_from_thread_id?: string | null
          continuity_note?: string | null
          continuity_status?: string
          created_at?: string
          day_key?: string | null
          id?: string
          is_daily_root?: boolean
          last_message_at?: string
          parent_thread_id?: string | null
          timezone?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "threads_carried_from_thread_id_fkey"
            columns: ["carried_from_thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_parent_thread_id_fkey"
            columns: ["parent_thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_model_usage: {
        Row: {
          count: number
          hour_bucket: string
          tier: string
          user_id: string
        }
        Insert: {
          count?: number
          hour_bucket: string
          tier: string
          user_id: string
        }
        Update: {
          count?: number
          hour_bucket?: string
          tier?: string
          user_id?: string
        }
        Relationships: []
      }
      user_providers: {
        Row: {
          api_key: string | null
          base_url: string | null
          catalog_id: string
          created_at: string
          default_model: string | null
          id: string
          label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key?: string | null
          base_url?: string | null
          catalog_id: string
          created_at?: string
          default_model?: string | null
          id?: string
          label: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string | null
          base_url?: string | null
          catalog_id?: string
          created_at?: string
          default_model?: string | null
          id?: string
          label?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          active_provider_id: string | null
          biometrics_secret: string
          created_at: string
          custom_api_key: string | null
          custom_base_url: string | null
          custom_model_id: string | null
          fallback_provider_id: string | null
          fallback_provider_kind: string | null
          hotl_auto_execute: boolean
          is_paid: boolean
          model: string
          provider: string
          system_prompt_override: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_provider_id?: string | null
          biometrics_secret?: string
          created_at?: string
          custom_api_key?: string | null
          custom_base_url?: string | null
          custom_model_id?: string | null
          fallback_provider_id?: string | null
          fallback_provider_kind?: string | null
          hotl_auto_execute?: boolean
          is_paid?: boolean
          model?: string
          provider?: string
          system_prompt_override?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_provider_id?: string | null
          biometrics_secret?: string
          created_at?: string
          custom_api_key?: string | null
          custom_base_url?: string | null
          custom_model_id?: string | null
          fallback_provider_id?: string | null
          fallback_provider_kind?: string | null
          hotl_auto_execute?: boolean
          is_paid?: boolean
          model?: string
          provider?: string
          system_prompt_override?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_active_provider_id_fkey"
            columns: ["active_provider_id"]
            isOneToOne: false
            referencedRelation: "user_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_settings_fallback_provider_id_fkey"
            columns: ["fallback_provider_id"]
            isOneToOne: false
            referencedRelation: "user_providers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_yesterdays_open_threads: { Args: never; Returns: undefined }
      bump_model_usage: {
        Args: { _limit: number; _tier: string }
        Returns: {
          allowed: boolean
          current_count: number
        }[]
      }
      claim_chat_jobs: {
        Args: { _limit?: number }
        Returns: {
          assistant_message_id: string | null
          attempts: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          locked_at: string | null
          provider_snapshot: Json | null
          request_payload: Json
          started_at: string | null
          status: string
          system_snapshot: string | null
          thread_id: string
          updated_at: string
          user_id: string
          worker_lock: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "chat_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      match_memories: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          content: string
          created_at: string
          id: string
          metadata: Json
          similarity: number
          source: string
        }[]
      }
      recall_archive: {
        Args: {
          after_ts?: string
          before_ts?: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          content: string
          created_at: string
          memory_id: string
          role: string
          similarity: number
          thread_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
