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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      attendance_events: {
        Row: {
          approval_status: Database["public"]["Enums"]["attendance_approval_status"]
          created_at: string
          distance_m: number | null
          event_type: Database["public"]["Enums"]["attendance_event_type"]
          id: string
          is_backfill: boolean
          is_within_geofence: boolean | null
          lat: number
          lng: number
          member_id: string
          occurred_at: string
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          approval_status?: Database["public"]["Enums"]["attendance_approval_status"]
          created_at?: string
          distance_m?: number | null
          event_type: Database["public"]["Enums"]["attendance_event_type"]
          id?: string
          is_backfill?: boolean
          is_within_geofence?: boolean | null
          lat: number
          lng: number
          member_id: string
          occurred_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          approval_status?: Database["public"]["Enums"]["attendance_approval_status"]
          created_at?: string
          distance_m?: number | null
          event_type?: Database["public"]["Enums"]["attendance_event_type"]
          id?: string
          is_backfill?: boolean
          is_within_geofence?: boolean | null
          lat?: number
          lng?: number
          member_id?: string
          occurred_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          override_date: string
          type: Database["public"]["Enums"]["calendar_override_type"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          override_date: string
          type: Database["public"]["Enums"]["calendar_override_type"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          override_date?: string
          type?: Database["public"]["Enums"]["calendar_override_type"]
        }
        Relationships: [
          {
            foreignKeyName: "calendar_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          duration_type: Database["public"]["Enums"]["leave_duration_type"]
          hours: number | null
          id: string
          is_manager_override: boolean
          leave_date: string
          leave_type_id: string | null
          member_id: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["leave_status"]
        }
        Insert: {
          created_at?: string
          duration_type?: Database["public"]["Enums"]["leave_duration_type"]
          hours?: number | null
          id?: string
          is_manager_override?: boolean
          leave_date: string
          leave_type_id?: string | null
          member_id: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["leave_status"]
        }
        Update: {
          created_at?: string
          duration_type?: Database["public"]["Enums"]["leave_duration_type"]
          hours?: number | null
          id?: string
          is_manager_override?: boolean
          leave_date?: string
          leave_type_id?: string | null
          member_id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["leave_status"]
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_week_start_overrides: {
        Row: {
          id: string
          member_id: string
          updated_at: string
          updated_by: string | null
          week_start_weekday: number
          year_month: string
        }
        Insert: {
          id?: string
          member_id: string
          updated_at?: string
          updated_by?: string | null
          week_start_weekday: number
          year_month: string
        }
        Update: {
          id?: string
          member_id?: string
          updated_at?: string
          updated_by?: string | null
          week_start_weekday?: number
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_week_start_overrides_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_week_start_overrides_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_settings: {
        Row: {
          allow_delete_records: boolean
          block_past_scheduling: boolean
          company_lat: number | null
          company_lng: number | null
          dinner_end: string | null
          dinner_start: string | null
          enable_week_start_adjust: boolean
          geofence_disabled: boolean
          geofence_radius_m: number
          id: number
          lunch_end: string | null
          lunch_start: string | null
          protect_review_records: boolean
          remind_month_end_publish: boolean
          show_color_legend: boolean
          updated_at: string
        }
        Insert: {
          allow_delete_records?: boolean
          block_past_scheduling?: boolean
          company_lat?: number | null
          company_lng?: number | null
          dinner_end?: string | null
          dinner_start?: string | null
          enable_week_start_adjust?: boolean
          geofence_disabled?: boolean
          geofence_radius_m?: number
          id?: number
          lunch_end?: string | null
          lunch_start?: string | null
          protect_review_records?: boolean
          remind_month_end_publish?: boolean
          show_color_legend?: boolean
          updated_at?: string
        }
        Update: {
          allow_delete_records?: boolean
          block_past_scheduling?: boolean
          company_lat?: number | null
          company_lng?: number | null
          dinner_end?: string | null
          dinner_start?: string | null
          enable_week_start_adjust?: boolean
          geofence_disabled?: boolean
          geofence_radius_m?: number
          id?: number
          lunch_end?: string | null
          lunch_start?: string | null
          protect_review_records?: boolean
          remind_month_end_publish?: boolean
          show_color_legend?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          created_at: string
          id: string
          product_id: string
          r2_key: string
          r2_url: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          r2_key: string
          r2_url: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          r2_key?: string
          r2_url?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          pose: string | null
          process_steps: string | null
          series: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          pose?: string | null
          process_steps?: string | null
          series?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          pose?: string | null
          process_steps?: string | null
          series?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_daily_hours: number
          display_name: string
          email: string
          hire_date: string | null
          id: string
          must_calculate_settlement: boolean
          must_publish_schedule: boolean
          role: Database["public"]["Enums"]["member_role"]
          updated_at: string
          weekly_rest_check_enabled: boolean
        }
        Insert: {
          created_at?: string
          default_daily_hours?: number
          display_name?: string
          email: string
          hire_date?: string | null
          id: string
          must_calculate_settlement?: boolean
          must_publish_schedule?: boolean
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          weekly_rest_check_enabled?: boolean
        }
        Update: {
          created_at?: string
          default_daily_hours?: number
          display_name?: string
          email?: string
          hire_date?: string | null
          id?: string
          must_calculate_settlement?: boolean
          must_publish_schedule?: boolean
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          weekly_rest_check_enabled?: boolean
        }
        Relationships: []
      }
      schedule_confirmations: {
        Row: {
          confirmed_at: string
          id: string
          member_id: string
          publication_id: string
        }
        Insert: {
          confirmed_at?: string
          id?: string
          member_id: string
          publication_id: string
        }
        Update: {
          confirmed_at?: string
          id?: string
          member_id?: string
          publication_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_confirmations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_confirmations_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: true
            referencedRelation: "schedule_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_publications: {
        Row: {
          id: string
          member_id: string
          published_at: string
          published_by: string | null
          snapshot: Json
          year_month: string
        }
        Insert: {
          id?: string
          member_id: string
          published_at?: string
          published_by?: string | null
          snapshot: Json
          year_month: string
        }
        Update: {
          id?: string
          member_id?: string
          published_at?: string
          published_by?: string | null
          snapshot?: Json
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_publications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_publications_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_by: string | null
          id: string
          member_id: string
          note: string | null
          status: Database["public"]["Enums"]["shift_status"]
          updated_at: string
          updated_by: string | null
          work_date: string
        }
        Insert: {
          created_by?: string | null
          id?: string
          member_id: string
          note?: string | null
          status?: Database["public"]["Enums"]["shift_status"]
          updated_at?: string
          updated_by?: string | null
          work_date: string
        }
        Update: {
          created_by?: string | null
          id?: string
          member_id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["shift_status"]
          updated_at?: string
          updated_by?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_snapshots: {
        Row: {
          created_at: string
          created_by: string
          id: string
          member_id: string
          snapshot: Json
          year_month: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          member_id: string
          snapshot: Json
          year_month: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          member_id?: string
          snapshot?: Json
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_snapshots_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_logs: {
        Row: {
          content: string
          created_at: string
          id: string
          log_date: string
          log_type: Database["public"]["Enums"]["work_log_type"]
          member_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          log_date: string
          log_type: Database["public"]["Enums"]["work_log_type"]
          member_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          log_date?: string
          log_type?: Database["public"]["Enums"]["work_log_type"]
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      attendance_daily: {
        Row: {
          clock_in_at: string | null
          clock_out_at: string | null
          member_id: string | null
          work_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_summary: {
        Row: {
          attendance_status: string | null
          clock_in_at: string | null
          clock_out_at: string | null
          default_daily_hours: number | null
          member_id: string | null
          work_date: string | null
          worked_hours: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      current_role_name: {
        Args: never
        Returns: Database["public"]["Enums"]["member_role"]
      }
      has_any_owner: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
    }
    Enums: {
      attendance_approval_status: "pending" | "approved" | "rejected"
      attendance_event_type: "clock_in" | "clock_out"
      calendar_override_type:
        | "national_holiday"
        | "disaster_leave"
        | "election_leave"
        | "other"
      leave_duration_type: "full_day" | "partial"
      leave_status: "pending" | "approved" | "rejected"
      member_role: "owner" | "staff" | "apprentice" | "guest"
      shift_status: "normal" | "unscheduled" | "regular_off" | "special_off"
      work_log_type: "production" | "learning"
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
      attendance_approval_status: ["pending", "approved", "rejected"],
      attendance_event_type: ["clock_in", "clock_out"],
      calendar_override_type: [
        "national_holiday",
        "disaster_leave",
        "election_leave",
        "other",
      ],
      leave_duration_type: ["full_day", "partial"],
      leave_status: ["pending", "approved", "rejected"],
      member_role: ["owner", "staff", "apprentice", "guest"],
      shift_status: ["normal", "unscheduled", "regular_off", "special_off"],
      work_log_type: ["production", "learning"],
    },
  },
} as const
