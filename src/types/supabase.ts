export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          email: string
          id: string
          invite_expires_at: string | null
          invite_token: string | null
          last_login_at: string | null
          member_id: string | null
          name: string
          password_hash: string | null
          role: Database["public"]["Enums"]["admin_role"]
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          last_login_at?: string | null
          member_id?: string | null
          name: string
          password_hash?: string | null
          role: Database["public"]["Enums"]["admin_role"]
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          last_login_at?: string | null
          member_id?: string | null
          name?: string
          password_hash?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      applicants: {
        Row: {
          address: string | null
          annual_sub_amount: number | null
          application_date: string
          club_rules_ok: boolean
          created_at: string
          email: string
          experience_level: string | null
          facebook_invite: boolean
          first_name: string
          hear_about_us: string | null
          id: string
          image_use_ok: boolean
          known_members: boolean
          landline: string | null
          last_name: string
          notes: string | null
          pay_by_date: string | null
          payment_method: string | null
          phone: string | null
          photographic_interests: string | null
          privacy_act_ok: boolean
          software: string | null
          status: Database["public"]["Enums"]["applicant_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          annual_sub_amount?: number | null
          application_date?: string
          club_rules_ok?: boolean
          created_at?: string
          email: string
          experience_level?: string | null
          facebook_invite?: boolean
          first_name: string
          hear_about_us?: string | null
          id?: string
          image_use_ok?: boolean
          known_members?: boolean
          landline?: string | null
          last_name: string
          notes?: string | null
          pay_by_date?: string | null
          payment_method?: string | null
          phone?: string | null
          photographic_interests?: string | null
          privacy_act_ok?: boolean
          software?: string | null
          status?: Database["public"]["Enums"]["applicant_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          annual_sub_amount?: number | null
          application_date?: string
          club_rules_ok?: boolean
          created_at?: string
          email?: string
          experience_level?: string | null
          facebook_invite?: boolean
          first_name?: string
          hear_about_us?: string | null
          id?: string
          image_use_ok?: boolean
          known_members?: boolean
          landline?: string | null
          last_name?: string
          notes?: string | null
          pay_by_date?: string | null
          payment_method?: string | null
          phone?: string | null
          photographic_interests?: string | null
          privacy_act_ok?: boolean
          software?: string | null
          status?: Database["public"]["Enums"]["applicant_status"]
          updated_at?: string
        }
        Relationships: []
      }
      committee_members: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          member_id: string | null
          notes: string | null
          role_id: string
          starts_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          member_id?: string | null
          notes?: string | null
          role_id: string
          starts_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          member_id?: string | null
          notes?: string | null
          role_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_members_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "committee_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_roles: {
        Row: {
          created_at: string
          id: string
          is_officer: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_officer?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_officer?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      competition_judges: {
        Row: {
          competition_id: string
          id: string
          judge_id: string
        }
        Insert: {
          competition_id: string
          id?: string
          judge_id: string
        }
        Update: {
          competition_id?: string
          id?: string
          judge_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_judges_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_judges_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "judges"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          closes_at: string | null
          created_at: string
          description: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          judging_closes_at: string | null
          judging_opens_at: string | null
          max_printim_entries: number
          max_projim_entries: number
          name: string
          opens_at: string | null
          points_accepted: number
          points_commended: number
          points_highly_commended: number
          points_honours: number
          season_id: string
          status: string
          updated_at: string
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          description?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          judging_closes_at?: string | null
          judging_opens_at?: string | null
          max_printim_entries?: number
          max_projim_entries?: number
          name: string
          opens_at?: string | null
          points_accepted?: number
          points_commended?: number
          points_highly_commended?: number
          points_honours?: number
          season_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          description?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          judging_closes_at?: string | null
          judging_opens_at?: string | null
          max_printim_entries?: number
          max_projim_entries?: number
          name?: string
          opens_at?: string | null
          points_accepted?: number
          points_commended?: number
          points_highly_commended?: number
          points_honours?: number
          season_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      email_automation_log: {
        Row: {
          automation_id: string
          competition_id: string
          fired_at: string
          id: string
          result: Json | null
        }
        Insert: {
          automation_id: string
          competition_id: string
          fired_at?: string
          id?: string
          result?: Json | null
        }
        Update: {
          automation_id?: string
          competition_id?: string
          fired_at?: string
          id?: string
          result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_automation_log_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "email_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_log_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      email_automations: {
        Row: {
          action: string
          created_at: string
          days_before: number | null
          enabled: boolean
          id: string
          label: string | null
          trigger: string
        }
        Insert: {
          action: string
          created_at?: string
          days_before?: number | null
          enabled?: boolean
          id?: string
          label?: string | null
          trigger: string
        }
        Update: {
          action?: string
          created_at?: string
          days_before?: number | null
          enabled?: boolean
          id?: string
          label?: string | null
          trigger?: string
        }
        Relationships: []
      }
      email_log: {
        Row: {
          body: string | null
          competition_id: string | null
          error: string | null
          id: string
          judge_id: string | null
          member_id: string | null
          recipient_email: string
          recipient_name: string | null
          sent_at: string
          subject: string
          token_id: string | null
          type: Database["public"]["Enums"]["email_type"]
        }
        Insert: {
          body?: string | null
          competition_id?: string | null
          error?: string | null
          id?: string
          judge_id?: string | null
          member_id?: string | null
          recipient_email: string
          recipient_name?: string | null
          sent_at?: string
          subject: string
          token_id?: string | null
          type: Database["public"]["Enums"]["email_type"]
        }
        Update: {
          body?: string | null
          competition_id?: string | null
          error?: string | null
          id?: string
          judge_id?: string | null
          member_id?: string | null
          recipient_email?: string
          recipient_name?: string | null
          sent_at?: string
          subject?: string
          token_id?: string | null
          type?: Database["public"]["Enums"]["email_type"]
        }
        Relationships: [
          {
            foreignKeyName: "email_log_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "judges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          description: string | null
          key: string
          name: string
          subject_template: string
          updated_at: string
          updated_by_id: string | null
        }
        Insert: {
          body_html: string
          description?: string | null
          key: string
          name: string
          subject_template: string
          updated_at?: string
          updated_by_id?: string | null
        }
        Update: {
          body_html?: string
          description?: string | null
          key?: string
          name?: string
          subject_template?: string
          updated_at?: string
          updated_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      entries: {
        Row: {
          award: Database["public"]["Enums"]["award_level"] | null
          competition_id: string
          drive_file_id: string | null
          drive_file_url: string | null
          drive_thumbnail_url: string | null
          id: string
          judge_comment: string | null
          judged_at: string | null
          judged_by: string | null
          member_id: string
          points_awarded: number | null
          sort_order: number | null
          submitted_at: string
          title: string
          type: Database["public"]["Enums"]["entry_type"]
          updated_at: string
        }
        Insert: {
          award?: Database["public"]["Enums"]["award_level"] | null
          competition_id: string
          drive_file_id?: string | null
          drive_file_url?: string | null
          drive_thumbnail_url?: string | null
          id?: string
          judge_comment?: string | null
          judged_at?: string | null
          judged_by?: string | null
          member_id: string
          points_awarded?: number | null
          sort_order?: number | null
          submitted_at?: string
          title: string
          type: Database["public"]["Enums"]["entry_type"]
          updated_at?: string
        }
        Update: {
          award?: Database["public"]["Enums"]["award_level"] | null
          competition_id?: string
          drive_file_id?: string | null
          drive_file_url?: string | null
          drive_thumbnail_url?: string | null
          id?: string
          judge_comment?: string | null
          judged_at?: string | null
          judged_by?: string | null
          member_id?: string
          points_awarded?: number | null
          sort_order?: number | null
          submitted_at?: string
          title?: string
          type?: Database["public"]["Enums"]["entry_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entries_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_judged_by_fkey"
            columns: ["judged_by"]
            isOneToOne: false
            referencedRelation: "judges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      google_oauth_tokens: {
        Row: {
          email: string | null
          id: number
          refresh_token: string
          updated_at: string
        }
        Insert: {
          email?: string | null
          id?: number
          refresh_token: string
          updated_at?: string
        }
        Update: {
          email?: string | null
          id?: number
          refresh_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      judges: {
        Row: {
          address: string | null
          bio: string | null
          created_at: string
          email: string
          facebook: string | null
          id: string
          instagram: string | null
          is_available: boolean
          name: string
          photo_drive_url: string | null
          rating: number | null
          website: string | null
        }
        Insert: {
          address?: string | null
          bio?: string | null
          created_at?: string
          email: string
          facebook?: string | null
          id?: string
          instagram?: string | null
          is_available?: boolean
          name: string
          photo_drive_url?: string | null
          rating?: number | null
          website?: string | null
        }
        Update: {
          address?: string | null
          bio?: string | null
          created_at?: string
          email?: string
          facebook?: string | null
          id?: string
          instagram?: string | null
          is_available?: boolean
          name?: string
          photo_drive_url?: string | null
          rating?: number | null
          website?: string | null
        }
        Relationships: []
      }
      member_points: {
        Row: {
          awarded_at: string
          competition_id: string
          entry_id: string
          entry_type: Database["public"]["Enums"]["entry_type"]
          id: string
          member_id: string
          points: number
          season_id: string
        }
        Insert: {
          awarded_at?: string
          competition_id: string
          entry_id: string
          entry_type: Database["public"]["Enums"]["entry_type"]
          id?: string
          member_id: string
          points?: number
          season_id: string
        }
        Update: {
          awarded_at?: string
          competition_id?: string
          entry_id?: string
          entry_type?: Database["public"]["Enums"]["entry_type"]
          id?: string
          member_id?: string
          points?: number
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_points_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_points_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_points_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_points_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          address: string | null
          annual_sub_amount: number | null
          club_rules_ok: boolean
          created_at: string
          email: string
          experience_level:
            | Database["public"]["Enums"]["experience_level"]
            | null
          first_name: string
          id: string
          image_use_ok: boolean
          joined_date: string | null
          last_name: string
          membership_number: string | null
          membership_type: Database["public"]["Enums"]["membership_type"]
          notes: string | null
          payment_method: string | null
          phone: string | null
          privacy_act_ok: boolean
          status: string
          sub_status: string
          subs_due_date: string | null
          subs_paid: boolean
          subs_paid_amount: number | null
          subs_paid_date: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          annual_sub_amount?: number | null
          club_rules_ok?: boolean
          created_at?: string
          email: string
          experience_level?:
            | Database["public"]["Enums"]["experience_level"]
            | null
          first_name: string
          id?: string
          image_use_ok?: boolean
          joined_date?: string | null
          last_name: string
          membership_number?: string | null
          membership_type?: Database["public"]["Enums"]["membership_type"]
          notes?: string | null
          payment_method?: string | null
          phone?: string | null
          privacy_act_ok?: boolean
          status?: string
          sub_status?: string
          subs_due_date?: string | null
          subs_paid?: boolean
          subs_paid_amount?: number | null
          subs_paid_date?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          annual_sub_amount?: number | null
          club_rules_ok?: boolean
          created_at?: string
          email?: string
          experience_level?:
            | Database["public"]["Enums"]["experience_level"]
            | null
          first_name?: string
          id?: string
          image_use_ok?: boolean
          joined_date?: string | null
          last_name?: string
          membership_number?: string | null
          membership_type?: Database["public"]["Enums"]["membership_type"]
          notes?: string | null
          payment_method?: string | null
          phone?: string | null
          privacy_act_ok?: boolean
          status?: string
          sub_status?: string
          subs_due_date?: string | null
          subs_paid?: boolean
          subs_paid_amount?: number | null
          subs_paid_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number | null
          created_at: string
          id: string
          member_id: string
          notes: string | null
          payment_date: string
          recorded_by: string | null
          year: number
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: string
          member_id: string
          notes?: string | null
          payment_date?: string
          recorded_by?: string | null
          year: number
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: string
          member_id?: string
          notes?: string | null
          payment_date?: string
          recorded_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          is_current_event_year: boolean
          is_current_membership_year: boolean
          starts_at: string
          year: number
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          is_current_event_year?: boolean
          is_current_membership_year?: boolean
          starts_at: string
          year: number
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          is_current_event_year?: boolean
          is_current_membership_year?: boolean
          starts_at?: string
          year?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          default_value: string | null
          description: string | null
          key: string
          label: string
          section: string
          updated_at: string
          value: string | null
        }
        Insert: {
          default_value?: string | null
          description?: string | null
          key: string
          label: string
          section: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          default_value?: string | null
          description?: string | null
          key?: string
          label?: string
          section?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      tokens: {
        Row: {
          competition_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          judge_id: string | null
          member_id: string | null
          revoked_at: string | null
          token: string
          type: Database["public"]["Enums"]["token_type"]
          used_at: string | null
        }
        Insert: {
          competition_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          judge_id?: string | null
          member_id?: string | null
          revoked_at?: string | null
          token?: string
          type: Database["public"]["Enums"]["token_type"]
          used_at?: string | null
        }
        Update: {
          competition_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          judge_id?: string | null
          member_id?: string | null
          revoked_at?: string | null
          token?: string
          type?: Database["public"]["Enums"]["token_type"]
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tokens_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokens_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "judges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tokens_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
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
      admin_role:
        | "president"
        | "competition_secretary"
        | "treasurer"
        | "committee"
        | "super_admin"
      applicant_status: "pending" | "approved" | "rejected"
      award_level:
        | "honours"
        | "highly_commended"
        | "commended"
        | "accepted"
        | "winner"
        | "shortlisted"
      email_type:
        | "submission_invite"
        | "submission_reminder"
        | "submission_confirmation"
        | "judging_invite"
        | "results_notification"
        | "member_history_link"
        | "subs_reminder"
        | "one_off"
        | "deadline_reminder"
      entry_type: "projim" | "printim"
      event_type: "competition" | "award" | "other"
      experience_level: "beginner" | "intermediate" | "advanced"
      membership_type: "full" | "life" | "complimentary"
      token_type: "submission" | "judging" | "member_history"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      admin_role: [
        "president",
        "competition_secretary",
        "treasurer",
        "committee",
        "super_admin",
      ],
      applicant_status: ["pending", "approved", "rejected"],
      award_level: [
        "honours",
        "highly_commended",
        "commended",
        "accepted",
        "winner",
        "shortlisted",
      ],
      email_type: [
        "submission_invite",
        "submission_reminder",
        "submission_confirmation",
        "judging_invite",
        "results_notification",
        "member_history_link",
        "subs_reminder",
        "one_off",
        "deadline_reminder",
      ],
      entry_type: ["projim", "printim"],
      event_type: ["competition", "award", "other"],
      experience_level: ["beginner", "intermediate", "advanced"],
      membership_type: ["full", "life", "complimentary"],
      token_type: ["submission", "judging", "member_history"],
    },
  },
} as const

