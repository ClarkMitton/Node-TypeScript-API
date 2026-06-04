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
      category_settings: {
        Row: {
          bg_image_url: string | null
          category_key: string
          display_name: string
          display_order: number
          id: string
          is_active: boolean
        }
        Insert: {
          bg_image_url?: string | null
          category_key: string
          display_name: string
          display_order?: number
          id?: string
          is_active?: boolean
        }
        Update: {
          bg_image_url?: string | null
          category_key?: string
          display_name?: string
          display_order?: number
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      groups: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      question_attempts: {
        Row: {
          attempt_number: number
          created_at: string
          given_answer: string
          grade: number
          id: string
          is_correct: boolean
          seconds_taken: number | null
          session_id: string
          sub_topic_key: string
          sub_topic_result_id: string
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          given_answer: string
          grade: number
          id?: string
          is_correct: boolean
          seconds_taken?: number | null
          session_id: string
          sub_topic_key: string
          sub_topic_result_id: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          given_answer?: string
          grade?: number
          id?: string
          is_correct?: boolean
          seconds_taken?: number | null
          session_id?: string
          sub_topic_key?: string
          sub_topic_result_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "scan_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_attempts_sub_topic_result_id_fkey"
            columns: ["sub_topic_result_id"]
            isOneToOne: false
            referencedRelation: "sub_topic_results"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          accepted_answers: string[]
          category_key: string
          created_at: string
          custom_image_url: string | null
          grade: number
          id: string
          image_search_term: string | null
          question_text: string
          sub_topic_key: string
          updated_at: string
        }
        Insert: {
          accepted_answers?: string[]
          category_key?: string
          created_at?: string
          custom_image_url?: string | null
          grade: number
          id?: string
          image_search_term?: string | null
          question_text: string
          sub_topic_key: string
          updated_at?: string
        }
        Update: {
          accepted_answers?: string[]
          category_key?: string
          created_at?: string
          custom_image_url?: string | null
          grade?: number
          id?: string
          image_search_term?: string | null
          question_text?: string
          sub_topic_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      scan_sessions: {
        Row: {
          accessibility_settings: Json | null
          completed: boolean
          completed_at: string | null
          id: string
          music_track: string | null
          music_used: boolean
          restored_at: string | null
          started_at: string
          student_id: string
          theme: string
        }
        Insert: {
          accessibility_settings?: Json | null
          completed?: boolean
          completed_at?: string | null
          id?: string
          music_track?: string | null
          music_used?: boolean
          restored_at?: string | null
          started_at?: string
          student_id: string
          theme?: string
        }
        Update: {
          accessibility_settings?: Json | null
          completed?: boolean
          completed_at?: string | null
          id?: string
          music_track?: string | null
          music_used?: boolean
          restored_at?: string | null
          started_at?: string
          student_id?: string
          theme?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          name: string
          unique_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          name: string
          unique_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          name?: string
          unique_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_topic_results: {
        Row: {
          completed: boolean
          created_at: string
          current_grade: number
          g2_attempts: number
          g3_attempts: number
          g4_attempts: number
          grade_ceiling: number | null
          id: string
          needed_g2_retry: boolean
          selection_order: number
          session_id: string
          sub_topic_key: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          current_grade?: number
          g2_attempts?: number
          g3_attempts?: number
          g4_attempts?: number
          grade_ceiling?: number | null
          id?: string
          needed_g2_retry?: boolean
          selection_order: number
          session_id: string
          sub_topic_key: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          current_grade?: number
          g2_attempts?: number
          g3_attempts?: number
          g4_attempts?: number
          grade_ceiling?: number | null
          id?: string
          needed_g2_retry?: boolean
          selection_order?: number
          session_id?: string
          sub_topic_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_topic_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "scan_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_topics: {
        Row: {
          category_key: string
          created_at: string
          display_name: string
          display_order: number
          id: string
          sub_topic_key: string
        }
        Insert: {
          category_key: string
          created_at?: string
          display_name: string
          display_order?: number
          id?: string
          sub_topic_key: string
        }
        Update: {
          category_key?: string
          created_at?: string
          display_name?: string
          display_order?: number
          id?: string
          sub_topic_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_topics_category_key_fkey"
            columns: ["category_key"]
            isOneToOne: false
            referencedRelation: "category_settings"
            referencedColumns: ["category_key"]
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
