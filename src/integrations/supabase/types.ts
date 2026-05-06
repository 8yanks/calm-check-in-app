export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          created_at: string
          fn: string
          id: string
          success: boolean
          tokens_in: number
          tokens_out: number
          user_id: string
        }
        Insert: {
          created_at?: string
          fn: string
          id?: string
          success?: boolean
          tokens_in?: number
          tokens_out?: number
          user_id: string
        }
        Update: {
          created_at?: string
          fn?: string
          id?: string
          success?: boolean
          tokens_in?: number
          tokens_out?: number
          user_id?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          event: string
          id: string
          payload: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          payload?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          payload?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      assessment_answers: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          question_key: string
          value: number
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          question_key: string
          value: number
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          question_key?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_answers_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          ai_synthesis: Json | null
          completed_at: string | null
          created_at: string
          id: string
          score_summary: Json
          started_at: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_synthesis?: Json | null
          completed_at?: string | null
          created_at?: string
          id?: string
          score_summary?: Json
          started_at?: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_synthesis?: Json | null
          completed_at?: string | null
          created_at?: string
          id?: string
          score_summary?: Json
          started_at?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      checkins: {
        Row: {
          blocker: string
          calm_level: string
          created_at: string
          explanation: string
          id: string
          immediate_need: string
          load_score: number
          mental_load: string
          micro_action: string
          state_label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blocker: string
          calm_level: string
          created_at?: string
          explanation: string
          id?: string
          immediate_need: string
          load_score?: number
          mental_load: string
          micro_action: string
          state_label: string
          updated_at?: string
          user_id: string
        }
        Update: {
          blocker?: string
          calm_level?: string
          created_at?: string
          explanation?: string
          id?: string
          immediate_need?: string
          load_score?: number
          mental_load?: string
          micro_action?: string
          state_label?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      content_interactions: {
        Row: {
          action: string
          content_slug: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          content_slug: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          content_slug?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      content_items: {
        Row: {
          body: string
          category: string
          created_at: string
          duration_min: number
          id: string
          intensity: string
          published: boolean
          refs: Json
          slug: string
          state_match: string[]
          status: string
          summary: string
          tier: string
          title: string
          updated_at: string
          why_helps: string
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          duration_min: number
          id?: string
          intensity?: string
          published?: boolean
          refs?: Json
          slug: string
          state_match?: string[]
          status?: string
          summary: string
          tier?: string
          title: string
          updated_at?: string
          why_helps: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          duration_min?: number
          id?: string
          intensity?: string
          published?: boolean
          refs?: Json
          slug?: string
          state_match?: string[]
          status?: string
          summary?: string
          tier?: string
          title?: string
          updated_at?: string
          why_helps?: string
        }
        Relationships: []
      }
      onboarding_preferences: {
        Row: {
          best_moments: string[]
          completed_at: string
          id: string
          main_goal: string | null
          notifications_enabled: boolean
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          best_moments?: string[]
          completed_at?: string
          id?: string
          main_goal?: string | null
          notifications_enabled?: boolean
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          best_moments?: string[]
          completed_at?: string
          id?: string
          main_goal?: string | null
          notifications_enabled?: boolean
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_progress: {
        Row: {
          percentage: number
          signals_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          percentage?: number
          signals_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          percentage?: number
          signals_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      risk_events: {
        Row: {
          action_taken: string
          context: Json
          created_at: string
          id: string
          level: string
          source: string
          trigger_phrase: string | null
          user_id: string | null
        }
        Insert: {
          action_taken: string
          context?: Json
          created_at?: string
          id?: string
          level: string
          source: string
          trigger_phrase?: string | null
          user_id?: string | null
        }
        Update: {
          action_taken?: string
          context?: Json
          created_at?: string
          id?: string
          level?: string
          source?: string
          trigger_phrase?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          id: string
          payload: Json | null
          processed_at: string
          type: string
        }
        Insert: {
          id: string
          payload?: Json | null
          processed_at?: string
          type: string
        }
        Update: {
          id?: string
          payload?: Json | null
          processed_at?: string
          type?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          features_excluded: Json
          plan: string
          purchased_at: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          features_excluded?: Json
          plan?: string
          purchased_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          features_excluded?: Json
          plan?: string
          purchased_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profile_traits: {
        Row: {
          computed_at: string
          fragility_estimate: string | null
          intensity_avg: number | null
          last_diagnostic_at: string | null
          last_weekly_review_at: string | null
          most_common_blocker: string | null
          most_common_need: string | null
          preferred_format: string | null
          signals: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          computed_at?: string
          fragility_estimate?: string | null
          intensity_avg?: number | null
          last_diagnostic_at?: string | null
          last_weekly_review_at?: string | null
          most_common_blocker?: string | null
          most_common_need?: string | null
          preferred_format?: string | null
          signals?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          computed_at?: string
          fragility_estimate?: string | null
          intensity_avg?: number | null
          last_diagnostic_at?: string | null
          last_weekly_review_at?: string | null
          most_common_blocker?: string | null
          most_common_need?: string | null
          preferred_format?: string | null
          signals?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_summaries: {
        Row: {
          aggravating_factors: Json
          average_load: number | null
          created_at: string
          helpful_factors: Json
          id: string
          insights: Json
          narrative: string | null
          next_week_plan: Json
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          aggravating_factors?: Json
          average_load?: number | null
          created_at?: string
          helpful_factors?: Json
          id?: string
          insights?: Json
          narrative?: string | null
          next_week_plan?: Json
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          aggravating_factors?: Json
          average_load?: number | null
          created_at?: string
          helpful_factors?: Json
          id?: string
          insights?: Json
          narrative?: string | null
          next_week_plan?: Json
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
