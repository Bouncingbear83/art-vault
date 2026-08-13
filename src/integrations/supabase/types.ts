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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      artists: {
        Row: {
          arr_status: string | null
          artist_id: string
          dates: string | null
          display_name: string
          palette_pref: string | null
          paper_sleeve: boolean | null
          play_type: Database["public"]["Enums"]["play_type_t"] | null
          tier: string | null
          updated_at: string | null
        }
        Insert: {
          arr_status?: string | null
          artist_id: string
          dates?: string | null
          display_name: string
          palette_pref?: string | null
          paper_sleeve?: boolean | null
          play_type?: Database["public"]["Enums"]["play_type_t"] | null
          tier?: string | null
          updated_at?: string | null
        }
        Update: {
          arr_status?: string | null
          artist_id?: string
          dates?: string | null
          display_name?: string
          palette_pref?: string | null
          paper_sleeve?: boolean | null
          play_type?: Database["public"]["Enums"]["play_type_t"] | null
          tier?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      comps: {
        Row: {
          artist: string | null
          artist_id: string | null
          authorship: string | null
          auto_ref: string | null
          buy_candidate: string | null
          condition_checked: string | null
          confirmed_ref: string | null
          currency: string | null
          dup_flag: string | null
          est_high: number | null
          est_low: number | null
          est_mid_gbp: number | null
          fx: number | null
          geo_resolved: string | null
          h_cm: number | null
          hammer_equiv_gbp: number | null
          in_zone: string | null
          include_in_stats: string | null
          loaded_at: string
          longest_cm: number | null
          medium_class: string | null
          medium_pref: string | null
          medium_raw: string | null
          palette: string | null
          palette_pref_hit: string | null
          realisation: number | null
          realized_basis: string | null
          realized_gbp: number | null
          realized_native: number | null
          ref: string | null
          remote_haircut_pct: number | null
          repeat_flag: string | null
          sale_date: string | null
          sale_key: string
          sheet_grade: string | null
          status: string | null
          subject: string | null
          times_seen: number | null
          title: string | null
          trigger_gbp: number | null
          venue: string | null
          venue_canonical: string | null
          vtype_resolved: string | null
          w_cm: number | null
          wall_presence: string | null
        }
        Insert: {
          artist?: string | null
          artist_id?: string | null
          authorship?: string | null
          auto_ref?: string | null
          buy_candidate?: string | null
          condition_checked?: string | null
          confirmed_ref?: string | null
          currency?: string | null
          dup_flag?: string | null
          est_high?: number | null
          est_low?: number | null
          est_mid_gbp?: number | null
          fx?: number | null
          geo_resolved?: string | null
          h_cm?: number | null
          hammer_equiv_gbp?: number | null
          in_zone?: string | null
          include_in_stats?: string | null
          loaded_at?: string
          longest_cm?: number | null
          medium_class?: string | null
          medium_pref?: string | null
          medium_raw?: string | null
          palette?: string | null
          palette_pref_hit?: string | null
          realisation?: number | null
          realized_basis?: string | null
          realized_gbp?: number | null
          realized_native?: number | null
          ref?: string | null
          remote_haircut_pct?: number | null
          repeat_flag?: string | null
          sale_date?: string | null
          sale_key: string
          sheet_grade?: string | null
          status?: string | null
          subject?: string | null
          times_seen?: number | null
          title?: string | null
          trigger_gbp?: number | null
          venue?: string | null
          venue_canonical?: string | null
          vtype_resolved?: string | null
          w_cm?: number | null
          wall_presence?: string | null
        }
        Update: {
          artist?: string | null
          artist_id?: string | null
          authorship?: string | null
          auto_ref?: string | null
          buy_candidate?: string | null
          condition_checked?: string | null
          confirmed_ref?: string | null
          currency?: string | null
          dup_flag?: string | null
          est_high?: number | null
          est_low?: number | null
          est_mid_gbp?: number | null
          fx?: number | null
          geo_resolved?: string | null
          h_cm?: number | null
          hammer_equiv_gbp?: number | null
          in_zone?: string | null
          include_in_stats?: string | null
          loaded_at?: string
          longest_cm?: number | null
          medium_class?: string | null
          medium_pref?: string | null
          medium_raw?: string | null
          palette?: string | null
          palette_pref_hit?: string | null
          realisation?: number | null
          realized_basis?: string | null
          realized_gbp?: number | null
          realized_native?: number | null
          ref?: string | null
          remote_haircut_pct?: number | null
          repeat_flag?: string | null
          sale_date?: string | null
          sale_key?: string
          sheet_grade?: string | null
          status?: string | null
          subject?: string | null
          times_seen?: number | null
          title?: string | null
          trigger_gbp?: number | null
          venue?: string | null
          venue_canonical?: string | null
          vtype_resolved?: string | null
          w_cm?: number | null
          wall_presence?: string | null
        }
        Relationships: []
      }
      comps_raw: {
        Row: {
          artist_id: string | null
          authorship: string | null
          est_mid_gbp: number | null
          geo_resolved: string | null
          hammer_equiv_gbp: number | null
          in_zone: boolean | null
          loaded_at: string | null
          longest_cm: number | null
          medium_class: string | null
          realisation: number | null
          sale_date: string | null
          sale_key: string
          status: string | null
          subject: string | null
          title: string | null
          vtype_resolved: string | null
        }
        Insert: {
          artist_id?: string | null
          authorship?: string | null
          est_mid_gbp?: number | null
          geo_resolved?: string | null
          hammer_equiv_gbp?: number | null
          in_zone?: boolean | null
          loaded_at?: string | null
          longest_cm?: number | null
          medium_class?: string | null
          realisation?: number | null
          sale_date?: string | null
          sale_key: string
          status?: string | null
          subject?: string | null
          title?: string | null
          vtype_resolved?: string | null
        }
        Update: {
          artist_id?: string | null
          authorship?: string | null
          est_mid_gbp?: number | null
          geo_resolved?: string | null
          hammer_equiv_gbp?: number | null
          in_zone?: boolean | null
          loaded_at?: string | null
          longest_cm?: number | null
          medium_class?: string | null
          realisation?: number | null
          sale_date?: string | null
          sale_key?: string
          status?: string | null
          subject?: string | null
          title?: string | null
          vtype_resolved?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comps_raw_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["artist_id"]
          },
        ]
      }
      note_tags: {
        Row: {
          note_id: string
          tag: string
        }
        Insert: {
          note_id: string
          tag: string
        }
        Update: {
          note_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_tags_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["note_id"]
          },
          {
            foreignKeyName: "note_tags_tag_fkey"
            columns: ["tag"]
            isOneToOne: false
            referencedRelation: "vocab_note_tag"
            referencedColumns: ["tag"]
          },
        ]
      }
      notes: {
        Row: {
          action_status: Database["public"]["Enums"]["action_status_t"] | null
          artist_id: string | null
          body: string
          confidence: Database["public"]["Enums"]["confidence_t"] | null
          created_at: string | null
          created_by: string | null
          decision: Database["public"]["Enums"]["decision_t"] | null
          entity_key: string | null
          note_id: string
          note_type: Database["public"]["Enums"]["note_type_t"]
          play_type: Database["public"]["Enums"]["play_type_t"] | null
          priority: Database["public"]["Enums"]["priority_t"] | null
          scope: Database["public"]["Enums"]["note_scope_t"]
          slug: string | null
          source_ref: string | null
          supersedes: string | null
          updated_at: string | null
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          action_status?: Database["public"]["Enums"]["action_status_t"] | null
          artist_id?: string | null
          body: string
          confidence?: Database["public"]["Enums"]["confidence_t"] | null
          created_at?: string | null
          created_by?: string | null
          decision?: Database["public"]["Enums"]["decision_t"] | null
          entity_key?: string | null
          note_id?: string
          note_type: Database["public"]["Enums"]["note_type_t"]
          play_type?: Database["public"]["Enums"]["play_type_t"] | null
          priority?: Database["public"]["Enums"]["priority_t"] | null
          scope: Database["public"]["Enums"]["note_scope_t"]
          slug?: string | null
          source_ref?: string | null
          supersedes?: string | null
          updated_at?: string | null
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          action_status?: Database["public"]["Enums"]["action_status_t"] | null
          artist_id?: string | null
          body?: string
          confidence?: Database["public"]["Enums"]["confidence_t"] | null
          created_at?: string | null
          created_by?: string | null
          decision?: Database["public"]["Enums"]["decision_t"] | null
          entity_key?: string | null
          note_id?: string
          note_type?: Database["public"]["Enums"]["note_type_t"]
          play_type?: Database["public"]["Enums"]["play_type_t"] | null
          priority?: Database["public"]["Enums"]["priority_t"] | null
          scope?: Database["public"]["Enums"]["note_scope_t"]
          slug?: string | null
          source_ref?: string | null
          supersedes?: string | null
          updated_at?: string | null
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "notes_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["note_id"]
          },
        ]
      }
      triggers: {
        Row: {
          artist_id: string
          basis: string | null
          medium_class: string | null
          min_longest_cm: number | null
          note: string | null
          tier_label: string
          updated_at: string | null
          walkaway_gbp: number | null
        }
        Insert: {
          artist_id: string
          basis?: string | null
          medium_class?: string | null
          min_longest_cm?: number | null
          note?: string | null
          tier_label: string
          updated_at?: string | null
          walkaway_gbp?: number | null
        }
        Update: {
          artist_id?: string
          basis?: string | null
          medium_class?: string | null
          min_longest_cm?: number | null
          note?: string | null
          tier_label?: string
          updated_at?: string | null
          walkaway_gbp?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "triggers_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["artist_id"]
          },
        ]
      }
      vocab_note_tag: {
        Row: {
          description: string | null
          tag: string
        }
        Insert: {
          description?: string | null
          tag: string
        }
        Update: {
          description?: string | null
          tag?: string
        }
        Relationships: []
      }
    }
    Views: {
      comps_rollup: {
        Row: {
          anchor_id: string | null
          arb_edge_raw: number | null
          arb_read: string | null
          artist_id: string | null
          buy_edge_flag: string | null
          buy_regional_realisation: number | null
          data_confidence: Database["public"]["Enums"]["confidence_t"] | null
          exit_strong_n: number | null
          exit_vs_regional_spread: number | null
          in_zone_realisation: number | null
          level_read: Database["public"]["Enums"]["level_t"] | null
          matched_n: number | null
          matched_spread: number | null
          median_realisation: number | null
          median_uk_hammer_gbp: number | null
          n_buy_regional: number | null
          n_exit_strong: number | null
          n_uk_auto_oil: number | null
          price_cagr_5y: number | null
          price_cagr_full: number | null
          sell_through_pct: number | null
          sell_through_trend: string | null
          spread_trusted: boolean | null
          thin_exit_flag: boolean | null
          trend_read: Database["public"]["Enums"]["trend_t"] | null
          updated_at: string | null
          vs_anchor_ratio: number | null
        }
        Relationships: []
      }
      comps_timeseries: {
        Row: {
          artist_id: string | null
          mean_hammer_gbp: number | null
          median_hammer_gbp: number | null
          median_realisation: number | null
          medium_class: string | null
          n: number | null
          period_year: number | null
          sell_through_pct: number | null
          venue_type: string | null
        }
        Relationships: []
      }
      vocab_enum: {
        Row: {
          enum_name: string | null
          sort_order: number | null
          value: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      is_owner: { Args: never; Returns: boolean }
    }
    Enums: {
      action_status: "Open" | "Actioned" | "Dismissed"
      action_status_t:
        | "Open"
        | "Actioned"
        | "Superseded"
        | "Wontfix"
        | "Archived"
      arr_status: "In ARR" | "ARR Expired" | "Unknown"
      artist_tier: "Core" | "Satellite" | "Speculative" | "Retired"
      confidence_level: "Low" | "Medium" | "High"
      confidence_t: "High" | "Med" | "Low"
      data_confidence: "Thin" | "Adequate" | "Strong"
      decision_kind: "Buy" | "Watch" | "Avoid" | "Undecided"
      decision_t:
        | "Reclassify"
        | "Set_Trigger"
        | "Add_Vocab"
        | "Patch_Taxonomy"
        | "Buy"
        | "Skip"
        | "Monitor"
        | "No_Action"
      level_t: "Cheap" | "Fair" | "Rich" | "Unknown"
      note_scope: "Artist" | "Venue" | "System"
      note_scope_t:
        | "Artist"
        | "Venue"
        | "Subject"
        | "Medium"
        | "System"
        | "Portfolio"
        | "Lot"
      note_type: "Verdict" | "Trigger" | "Flag" | "Observation"
      note_type_t:
        | "Verdict"
        | "Classification"
        | "Trigger"
        | "Flag"
        | "Learning"
        | "Playbook"
        | "Lot"
      palette_pref: "Sunlit" | "Silvered" | "Tonal" | "High Key" | "Dark"
      play_type:
        | "Sunlit Coastal"
        | "Marine"
        | "Continental Oil"
        | "British Impressionist"
        | "Landscape"
        | "Portrait"
        | "Other"
      play_type_t: "Arbitrage" | "Quality_hold" | "Pending" | "NA"
      priority_level: "P1" | "P2" | "P3"
      priority_t: "P1" | "P2" | "P3"
      trend_t: "Up" | "Flat" | "Down" | "Unknown"
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
      action_status: ["Open", "Actioned", "Dismissed"],
      action_status_t: [
        "Open",
        "Actioned",
        "Superseded",
        "Wontfix",
        "Archived",
      ],
      arr_status: ["In ARR", "ARR Expired", "Unknown"],
      artist_tier: ["Core", "Satellite", "Speculative", "Retired"],
      confidence_level: ["Low", "Medium", "High"],
      confidence_t: ["High", "Med", "Low"],
      data_confidence: ["Thin", "Adequate", "Strong"],
      decision_kind: ["Buy", "Watch", "Avoid", "Undecided"],
      decision_t: [
        "Reclassify",
        "Set_Trigger",
        "Add_Vocab",
        "Patch_Taxonomy",
        "Buy",
        "Skip",
        "Monitor",
        "No_Action",
      ],
      level_t: ["Cheap", "Fair", "Rich", "Unknown"],
      note_scope: ["Artist", "Venue", "System"],
      note_scope_t: [
        "Artist",
        "Venue",
        "Subject",
        "Medium",
        "System",
        "Portfolio",
        "Lot",
      ],
      note_type: ["Verdict", "Trigger", "Flag", "Observation"],
      note_type_t: [
        "Verdict",
        "Classification",
        "Trigger",
        "Flag",
        "Learning",
        "Playbook",
        "Lot",
      ],
      palette_pref: ["Sunlit", "Silvered", "Tonal", "High Key", "Dark"],
      play_type: [
        "Sunlit Coastal",
        "Marine",
        "Continental Oil",
        "British Impressionist",
        "Landscape",
        "Portrait",
        "Other",
      ],
      play_type_t: ["Arbitrage", "Quality_hold", "Pending", "NA"],
      priority_level: ["P1", "P2", "P3"],
      priority_t: ["P1", "P2", "P3"],
      trend_t: ["Up", "Flat", "Down", "Unknown"],
    },
  },
} as const
