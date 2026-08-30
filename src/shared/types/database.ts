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
      journal_preferences: {
        Row: {
          action_first: boolean
          auto_fill_first_output: boolean
          hide_unavailable_inputs: boolean
          member_id: string
          updated_at: string
        }
        Insert: {
          action_first?: boolean
          auto_fill_first_output?: boolean
          hide_unavailable_inputs?: boolean
          member_id: string
          updated_at?: string
        }
        Update: {
          action_first?: boolean
          auto_fill_first_output?: boolean
          hide_unavailable_inputs?: boolean
          member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_preferences_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          hidden_from_members: boolean
          id: string
          name: string
          pay_coefficient: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          hidden_from_members?: boolean
          id?: string
          name: string
          pay_coefficient?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          hidden_from_members?: boolean
          id?: string
          name?: string
          pay_coefficient?: number
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
      member_wage_rates: {
        Row: {
          created_at: string
          created_by: string | null
          effective_date: string
          hourly_wage: number
          id: string
          member_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_date: string
          hourly_wage: number
          id?: string
          member_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_date?: string
          hourly_wage?: number
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_wage_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_wage_rates_member_id_fkey"
            columns: ["member_id"]
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
          default_last_month_before_5: boolean
          default_next_month_after_25: boolean
          dinner_end: string | null
          dinner_start: string | null
          disable_punch_on_non_workday: boolean
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
          default_last_month_before_5?: boolean
          default_next_month_after_25?: boolean
          dinner_end?: string | null
          dinner_start?: string | null
          disable_punch_on_non_workday?: boolean
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
          default_last_month_before_5?: boolean
          default_next_month_after_25?: boolean
          dinner_end?: string | null
          dinner_start?: string | null
          disable_punch_on_non_workday?: boolean
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
      process_edges: {
        Row: {
          created_at: string
          from_node_id: string
          id: string
          product_id: string | null
          sort_order: number
          template_id: string | null
          to_node_id: string
        }
        Insert: {
          created_at?: string
          from_node_id: string
          id?: string
          product_id?: string | null
          sort_order?: number
          template_id?: string | null
          to_node_id: string
        }
        Update: {
          created_at?: string
          from_node_id?: string
          id?: string
          product_id?: string | null
          sort_order?: number
          template_id?: string | null
          to_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_edges_from_node_id_fkey"
            columns: ["from_node_id"]
            isOneToOne: false
            referencedRelation: "process_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_edges_from_node_id_fkey"
            columns: ["from_node_id"]
            isOneToOne: false
            referencedRelation: "tag_balances"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "process_edges_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_edges_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_edges_to_node_id_fkey"
            columns: ["to_node_id"]
            isOneToOne: false
            referencedRelation: "process_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_edges_to_node_id_fkey"
            columns: ["to_node_id"]
            isOneToOne: false
            referencedRelation: "tag_balances"
            referencedColumns: ["tag_id"]
          },
        ]
      }
      process_nodes: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["process_node_kind"]
          label: string
          pos_x: number
          pos_y: number
          product_id: string | null
          template_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["process_node_kind"]
          label: string
          pos_x?: number
          pos_y?: number
          product_id?: string | null
          template_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["process_node_kind"]
          label?: string
          pos_x?: number
          pos_y?: number
          product_id?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_nodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_nodes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      process_templates: {
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
            foreignKeyName: "process_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_member_id: string
          parent_id: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_member_id: string
          parent_id?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_member_id?: string
          parent_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_folders_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_view_preferences: {
        Row: {
          folder_mode_enabled: boolean
          member_id: string
        }
        Insert: {
          folder_mode_enabled?: boolean
          member_id: string
        }
        Update: {
          folder_mode_enabled?: boolean
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_view_preferences_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      product_template_applications: {
        Row: {
          applied_at: string
          applied_by: string | null
          id: string
          mode: string
          product_id: string
          template_id: string | null
          template_name: string
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          id?: string
          mode: string
          product_id: string
          template_id?: string | null
          template_name: string
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          id?: string
          mode?: string
          product_id?: string
          template_id?: string | null
          template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_template_applications_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_template_applications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_template_applications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      production_log_outputs: {
        Row: {
          id: string
          log_id: string
          output_tag_id: string
          qty: number
        }
        Insert: {
          id?: string
          log_id: string
          output_tag_id: string
          qty: number
        }
        Update: {
          id?: string
          log_id?: string
          output_tag_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_log_outputs_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "production_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_log_outputs_output_tag_id_fkey"
            columns: ["output_tag_id"]
            isOneToOne: false
            referencedRelation: "process_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_log_outputs_output_tag_id_fkey"
            columns: ["output_tag_id"]
            isOneToOne: false
            referencedRelation: "tag_balances"
            referencedColumns: ["tag_id"]
          },
        ]
      }
      production_logs: {
        Row: {
          action_node_id: string
          created_at: string
          edited_at: string | null
          edited_by: string | null
          id: string
          input_tag_id: string
          log_date: string
          member_id: string
          product_id: string
          qty_consumed: number
        }
        Insert: {
          action_node_id: string
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          input_tag_id: string
          log_date: string
          member_id: string
          product_id: string
          qty_consumed: number
        }
        Update: {
          action_node_id?: string
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          input_tag_id?: string
          log_date?: string
          member_id?: string
          product_id?: string
          qty_consumed?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_logs_action_node_id_fkey"
            columns: ["action_node_id"]
            isOneToOne: false
            referencedRelation: "process_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_action_node_id_fkey"
            columns: ["action_node_id"]
            isOneToOne: false
            referencedRelation: "tag_balances"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "production_logs_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_input_tag_id_fkey"
            columns: ["input_tag_id"]
            isOneToOne: false
            referencedRelation: "process_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_input_tag_id_fkey"
            columns: ["input_tag_id"]
            isOneToOne: false
            referencedRelation: "tag_balances"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "production_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          material: string | null
          material_thickness_mm: number | null
          name: string
          size_note: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          material?: string | null
          material_thickness_mm?: number | null
          name: string
          size_note?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          material?: string | null
          material_thickness_mm?: number | null
          name?: string
          size_note?: string | null
          tags?: string[]
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
          preferred_display_name: string | null
          pure_management: boolean
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
          preferred_display_name?: string | null
          pure_management?: boolean
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
          preferred_display_name?: string | null
          pure_management?: boolean
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
      schedule_preferences: {
        Row: {
          created_at: string
          id: string
          member_id: string
          preference: Database["public"]["Enums"]["schedule_preference_type"]
          updated_at: string
          work_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          preference: Database["public"]["Enums"]["schedule_preference_type"]
          updated_at?: string
          work_date: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          preference?: Database["public"]["Enums"]["schedule_preference_type"]
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_preferences_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      stock_adjustments: {
        Row: {
          adjusted_at: string
          adjusted_by: string | null
          id: string
          product_id: string
          qty_delta: number
          reason: string | null
          tag_id: string
        }
        Insert: {
          adjusted_at?: string
          adjusted_by?: string | null
          id?: string
          product_id: string
          qty_delta: number
          reason?: string | null
          tag_id: string
        }
        Update: {
          adjusted_at?: string
          adjusted_by?: string | null
          id?: string
          product_id?: string
          qty_delta?: number
          reason?: string | null
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_adjusted_by_fkey"
            columns: ["adjusted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "process_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_balances"
            referencedColumns: ["tag_id"]
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
      tag_balances: {
        Row: {
          available_qty: number | null
          product_id: string | null
          tag_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_nodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
      edit_latest_production_log: {
        Args: {
          p_action_node_id: string
          p_input_tag_id: string
          p_log_date: string
          p_log_id: string
          p_outputs: Json
          p_qty_consumed: number
        }
        Returns: string
      }
      has_any_owner: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      preference_editable_year_month: { Args: never; Returns: string }
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
      process_node_kind: "action" | "tag"
      schedule_preference_type: "prefer_work" | "prefer_off"
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
      process_node_kind: ["action", "tag"],
      schedule_preference_type: ["prefer_work", "prefer_off"],
      shift_status: ["normal", "unscheduled", "regular_off", "special_off"],
      work_log_type: ["production", "learning"],
    },
  },
} as const
