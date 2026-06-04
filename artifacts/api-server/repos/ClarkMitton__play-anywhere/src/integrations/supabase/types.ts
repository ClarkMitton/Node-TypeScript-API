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
      lessons: {
        Row: {
          created_at: string
          description: string | null
          estimated_duration_mins: number
          featured: boolean
          id: string
          ms_form_url: string | null
          resource_bucket: Json
          slots: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_duration_mins?: number
          featured?: boolean
          id?: string
          ms_form_url?: string | null
          resource_bucket?: Json
          slots?: Json
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_duration_mins?: number
          featured?: boolean
          id?: string
          ms_form_url?: string | null
          resource_bucket?: Json
          slots?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      responses: {
        Row: {
          created_at: string
          id: string
          response_data: Json
          response_type: string
          screen_role: string
          session_id: string | null
          slot_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          response_data?: Json
          response_type: string
          screen_role: string
          session_id?: string | null
          slot_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          response_data?: Json
          response_type?: string
          screen_role?: string
          session_id?: string | null
          slot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "responses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "slots"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          current_slot_index: number
          ended_at: string | null
          host_code: string
          id: string
          lesson_id: string | null
          one_screen_mode: boolean
          screen1_code: string
          screen1_connected: boolean
          screen2_code: string
          screen2_connected: boolean
          state: Json
          status: string
        }
        Insert: {
          created_at?: string
          current_slot_index?: number
          ended_at?: string | null
          host_code: string
          id?: string
          lesson_id?: string | null
          one_screen_mode?: boolean
          screen1_code: string
          screen1_connected?: boolean
          screen2_code: string
          screen2_connected?: boolean
          state?: Json
          status?: string
        }
        Update: {
          created_at?: string
          current_slot_index?: number
          ended_at?: string | null
          host_code?: string
          id?: string
          lesson_id?: string | null
          one_screen_mode?: boolean
          screen1_code?: string
          screen1_connected?: boolean
          screen2_code?: string
          screen2_connected?: boolean
          state?: Json
          status?: string
        }
        Relationships: []
      }
      slots: {
        Row: {
          created_at: string
          duration_mins: number
          end_behaviour: string
          host_content: Json
          id: string
          lead_phase: string | null
          lesson_id: string | null
          name: string | null
          order_index: number
          pause_before_advance: boolean
          screen_delay_secs: number
          screen1_content: Json
          screen2_content: Json
          session_id: string | null
        }
        Insert: {
          created_at?: string
          duration_mins?: number
          end_behaviour?: string
          host_content?: Json
          id?: string
          lead_phase?: string | null
          lesson_id?: string | null
          name?: string | null
          order_index: number
          pause_before_advance?: boolean
          screen_delay_secs?: number
          screen1_content?: Json
          screen2_content?: Json
          session_id?: string | null
        }
        Update: {
          created_at?: string
          duration_mins?: number
          end_behaviour?: string
          host_content?: Json
          id?: string
          lead_phase?: string | null
          lesson_id?: string | null
          name?: string | null
          order_index?: number
          pause_before_advance?: boolean
          screen_delay_secs?: number
          screen1_content?: Json
          screen2_content?: Json
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slots_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
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
