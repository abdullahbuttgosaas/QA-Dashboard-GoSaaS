export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          created_at: string
          display_name: string
          email: string
          id: string
          is_public: boolean
          public_slug: string
          reporting_period_anchor: string | null
          reporting_period_days: number
          reporting_period_weeks: number
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email: string
          id: string
          is_public?: boolean
          public_slug: string
          reporting_period_anchor?: string | null
          reporting_period_days?: number
          reporting_period_weeks?: number
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          is_public?: boolean
          public_slug?: string
          reporting_period_anchor?: string | null
          reporting_period_days?: number
          reporting_period_weeks?: number
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      qa_documents: {
        Row: {
          confirmed_at: string | null
          created_at: string
          extracted_at: string | null
          extraction: Json | null
          extraction_error: string | null
          extraction_model: string | null
          extraction_status: Database["public"]["Enums"]["extraction_status"]
          file_name: string
          id: string
          mime_type: string
          owner_id: string
          record_id: string | null
          replaces_record_id: string | null
          size_bytes: number
          storage_path: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          extracted_at?: string | null
          extraction?: Json | null
          extraction_error?: string | null
          extraction_model?: string | null
          extraction_status?: Database["public"]["Enums"]["extraction_status"]
          file_name: string
          id?: string
          mime_type: string
          owner_id: string
          record_id?: string | null
          replaces_record_id?: string | null
          size_bytes: number
          storage_path: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          extracted_at?: string | null
          extraction?: Json | null
          extraction_error?: string | null
          extraction_model?: string | null
          extraction_status?: Database["public"]["Enums"]["extraction_status"]
          file_name?: string
          id?: string
          mime_type?: string
          owner_id?: string
          record_id?: string | null
          replaces_record_id?: string | null
          size_bytes?: number
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_documents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_documents_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "qa_record_metrics"
            referencedColumns: ["record_id"]
          },
          {
            foreignKeyName: "qa_documents_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "qa_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_documents_replaces_record_id_fkey"
            columns: ["replaces_record_id"]
            isOneToOne: false
            referencedRelation: "qa_record_metrics"
            referencedColumns: ["record_id"]
          },
          {
            foreignKeyName: "qa_documents_replaces_record_id_fkey"
            columns: ["replaces_record_id"]
            isOneToOne: false
            referencedRelation: "qa_records"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_records: {
        Row: {
          assigned_on: string | null
          created_at: string
          data: Json
          functional_area: string | null
          id: string
          owner_id: string
          qa_completed_on: string | null
          qa_status: Database["public"]["Enums"]["qa_status"]
          source_document_id: string | null
          ticket_number: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_on?: string | null
          created_at?: string
          data?: Json
          functional_area?: string | null
          id?: string
          owner_id: string
          qa_completed_on?: string | null
          qa_status?: Database["public"]["Enums"]["qa_status"]
          source_document_id?: string | null
          ticket_number: string
          title?: string
          updated_at?: string
        }
        Update: {
          assigned_on?: string | null
          created_at?: string
          data?: Json
          functional_area?: string | null
          id?: string
          owner_id?: string
          qa_completed_on?: string | null
          qa_status?: Database["public"]["Enums"]["qa_status"]
          source_document_id?: string | null
          ticket_number?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_records_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_records_source_document_fk"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "qa_documents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      qa_record_metrics: {
        Row: {
          assigned_on: string | null
          bugs_critical: number | null
          bugs_high: number | null
          bugs_low: number | null
          bugs_medium: number | null
          bugs_total: number | null
          owner_id: string | null
          qa_completed_on: string | null
          qa_status: Database["public"]["Enums"]["qa_status"] | null
          record_id: string | null
          retests_failed: number | null
          retests_passed: number | null
          retests_pending: number | null
          retests_total: number | null
          test_cases_blocked: number | null
          test_cases_failed: number | null
          test_cases_not_run: number | null
          test_cases_passed: number | null
          test_cases_total: number | null
          ticket_number: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_records_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      confirm_extraction: {
        Args: { p_document_id: string; p_record: Json }
        Returns: string
      }
      hook_before_user_created: { Args: { event: Json }; Returns: Json }
      is_qa_user: { Args: never; Returns: boolean }
      qa_metrics_by_period: {
        Args: { p_count?: number; p_owner: string; p_today?: string }
        Returns: {
          bugs_critical: number
          bugs_high: number
          bugs_low: number
          bugs_medium: number
          bugs_total: number
          period_end: string
          period_index: number
          period_start: string
          retests_failed: number
          retests_passed: number
          retests_pending: number
          retests_total: number
          test_cases_blocked: number
          test_cases_executed: number
          test_cases_failed: number
          test_cases_passed: number
          tickets_assigned: number
          tickets_completed: number
        }[]
      }
      qa_metrics_by_week: {
        Args: { p_count?: number; p_owner: string; p_today?: string }
        Returns: {
          bugs_critical: number
          bugs_high: number
          bugs_low: number
          bugs_medium: number
          bugs_total: number
          retests_failed: number
          retests_passed: number
          retests_pending: number
          retests_total: number
          test_cases_blocked: number
          test_cases_executed: number
          test_cases_failed: number
          test_cases_passed: number
          tickets_assigned: number
          tickets_completed: number
          week_end: string
          week_index: number
          week_start: string
        }[]
      }
      qa_metrics_for_range: {
        Args: { p_end: string; p_owner: string; p_start: string }
        Returns: {
          bugs_critical: number
          bugs_high: number
          bugs_low: number
          bugs_medium: number
          bugs_total: number
          retests_failed: number
          retests_passed: number
          retests_pending: number
          retests_total: number
          test_cases_blocked: number
          test_cases_executed: number
          test_cases_failed: number
          test_cases_passed: number
          tickets_assigned: number
          tickets_completed: number
        }[]
      }
      qa_metrics_lifetime: {
        Args: { p_owner: string }
        Returns: {
          bugs_critical: number
          bugs_high: number
          bugs_low: number
          bugs_medium: number
          bugs_total: number
          retests_failed: number
          retests_passed: number
          retests_pending: number
          retests_total: number
          test_cases_blocked: number
          test_cases_executed: number
          test_cases_failed: number
          test_cases_passed: number
          tickets_assigned: number
          tickets_completed: number
        }[]
      }
      qa_metrics_lifetime_weeks: {
        Args: { p_owner: string; p_today?: string }
        Returns: {
          bugs_critical: number
          bugs_high: number
          bugs_low: number
          bugs_medium: number
          bugs_total: number
          retests_failed: number
          retests_passed: number
          retests_pending: number
          retests_total: number
          test_cases_blocked: number
          test_cases_executed: number
          test_cases_failed: number
          test_cases_passed: number
          tickets_assigned: number
          tickets_completed: number
          week_end: string
          week_index: number
          week_start: string
        }[]
      }
      replace_record_from_extraction: {
        Args: { p_document_id: string; p_record: Json }
        Returns: string
      }
      reporting_periods: {
        Args: { p_count?: number; p_owner: string; p_today?: string }
        Returns: {
          period_end: string
          period_index: number
          period_start: string
        }[]
      }
    }
    Enums: {
      extraction_status:
        | "pending"
        | "processing"
        | "ready_for_review"
        | "confirmed"
        | "failed"
        | "discarded"
      qa_status: "assigned" | "in_progress" | "qa_completed"
      user_role: "qa" | "manager" | "admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      extraction_status: [
        "pending",
        "processing",
        "ready_for_review",
        "confirmed",
        "failed",
        "discarded",
      ],
      qa_status: ["assigned", "in_progress", "qa_completed"],
      user_role: ["qa", "manager", "admin"],
    },
  },
} as const

