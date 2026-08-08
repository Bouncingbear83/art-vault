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
          arr_status: Database["public"]["Enums"]["arr_status"]
          birth_year: number | null
          created_at: string
          dates_text: string | null
          death_year: number | null
          id: string
          name: string
          nationality: string | null
          palette_pref: Database["public"]["Enums"]["palette_pref"] | null
          play_type: Database["public"]["Enums"]["play_type"] | null
          tier: Database["public"]["Enums"]["artist_tier"]
        }
        Insert: {
          arr_status?: Database["public"]["Enums"]["arr_status"]
          birth_year?: number | null
          created_at?: string
          dates_text?: string | null
          death_year?: number | null
          id?: string
          name: string
          nationality?: string | null
          palette_pref?: Database["public"]["Enums"]["palette_pref"] | null
          play_type?: Database["public"]["Enums"]["play_type"] | null
          tier?: Database["public"]["Enums"]["artist_tier"]
        }
        Update: {
          arr_status?: Database["public"]["Enums"]["arr_status"]
          birth_year?: number | null
          created_at?: string
          dates_text?: string | null
          death_year?: number | null
          id?: string
          name?: string
          nationality?: string | null
          palette_pref?: Database["public"]["Enums"]["palette_pref"] | null
          play_type?: Database["public"]["Enums"]["play_type"] | null
          tier?: Database["public"]["Enums"]["artist_tier"]
        }
        Relationships: []
      }
      comps_rollup: {
        Row: {
          artist_id: string
          data_confidence: Database["public"]["Enums"]["data_confidence"]
          high_gbp: number | null
          last_sale_date: string | null
          low_gbp: number | null
          mean_uk_hammer_gbp: number | null
          median_uk_hammer_gbp: number | null
          n_lots_total: number | null
          n_uk_auto_oil: number | null
          sell_through_pct: number | null
          updated_at: string
        }
        Insert: {
          artist_id: string
          data_confidence?: Database["public"]["Enums"]["data_confidence"]
          high_gbp?: number | null
          last_sale_date?: string | null
          low_gbp?: number | null
          mean_uk_hammer_gbp?: number | null
          median_uk_hammer_gbp?: number | null
          n_lots_total?: number | null
          n_uk_auto_oil?: number | null
          sell_through_pct?: number | null
          updated_at?: string
        }
        Update: {
          artist_id?: string
          data_confidence?: Database["public"]["Enums"]["data_confidence"]
          high_gbp?: number | null
          last_sale_date?: string | null
          low_gbp?: number | null
          mean_uk_hammer_gbp?: number | null
          median_uk_hammer_gbp?: number | null
          n_lots_total?: number | null
          n_uk_auto_oil?: number | null
          sell_through_pct?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comps_rollup_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: true
            referencedRelation: "artist_360"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "comps_rollup_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: true
            referencedRelation: "artists"
            referencedColumns: ["id"]
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
            referencedColumns: ["id"]
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
          action_status: Database["public"]["Enums"]["action_status"]
          artist_id: string | null
          body: string
          confidence: Database["public"]["Enums"]["confidence_level"] | null
          created_at: string
          decision: Database["public"]["Enums"]["decision_kind"] | null
          entity_key: string | null
          id: string
          note_type: Database["public"]["Enums"]["note_type"]
          play_type: Database["public"]["Enums"]["play_type"] | null
          priority: Database["public"]["Enums"]["priority_level"] | null
          scope: Database["public"]["Enums"]["note_scope"]
          source_ref: string | null
          supersedes: string | null
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          action_status?: Database["public"]["Enums"]["action_status"]
          artist_id?: string | null
          body: string
          confidence?: Database["public"]["Enums"]["confidence_level"] | null
          created_at?: string
          decision?: Database["public"]["Enums"]["decision_kind"] | null
          entity_key?: string | null
          id?: string
          note_type: Database["public"]["Enums"]["note_type"]
          play_type?: Database["public"]["Enums"]["play_type"] | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          scope: Database["public"]["Enums"]["note_scope"]
          source_ref?: string | null
          supersedes?: string | null
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          action_status?: Database["public"]["Enums"]["action_status"]
          artist_id?: string | null
          body?: string
          confidence?: Database["public"]["Enums"]["confidence_level"] | null
          created_at?: string
          decision?: Database["public"]["Enums"]["decision_kind"] | null
          entity_key?: string | null
          id?: string
          note_type?: Database["public"]["Enums"]["note_type"]
          play_type?: Database["public"]["Enums"]["play_type"] | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          scope?: Database["public"]["Enums"]["note_scope"]
          source_ref?: string | null
          supersedes?: string | null
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist_360"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "notes_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      vocab_note_tag: {
        Row: {
          description: string | null
          label: string
          sort_order: number
          tag: string
        }
        Insert: {
          description?: string | null
          label: string
          sort_order?: number
          tag: string
        }
        Update: {
          description?: string | null
          label?: string
          sort_order?: number
          tag?: string
        }
        Relationships: []
      }
    }
    Views: {
      artist_360: {
        Row: {
          arr_status: Database["public"]["Enums"]["arr_status"] | null
          artist_id: string | null
          birth_year: number | null
          comps_updated_at: string | null
          data_confidence: Database["public"]["Enums"]["data_confidence"] | null
          dates_text: string | null
          death_year: number | null
          high_gbp: number | null
          last_sale_date: string | null
          low_gbp: number | null
          mean_uk_hammer_gbp: number | null
          median_uk_hammer_gbp: number | null
          n_lots_total: number | null
          n_uk_auto_oil: number | null
          name: string | null
          nationality: string | null
          open_flags: number | null
          palette_pref: Database["public"]["Enums"]["palette_pref"] | null
          play_type: Database["public"]["Enums"]["play_type"] | null
          sell_through_pct: number | null
          tier: Database["public"]["Enums"]["artist_tier"] | null
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
      arr_status: "In ARR" | "ARR Expired" | "Unknown"
      artist_tier: "Core" | "Satellite" | "Speculative" | "Retired"
      confidence_level: "Low" | "Medium" | "High"
      data_confidence: "Thin" | "Adequate" | "Strong"
      decision_kind: "Buy" | "Watch" | "Avoid" | "Undecided"
      note_scope: "Artist" | "Venue" | "System"
      note_type: "Verdict" | "Trigger" | "Flag" | "Observation"
      palette_pref: "Sunlit" | "Silvered" | "Tonal" | "High Key" | "Dark"
      play_type:
        | "Sunlit Coastal"
        | "Marine"
        | "Continental Oil"
        | "British Impressionist"
        | "Landscape"
        | "Portrait"
        | "Other"
      priority_level: "P1" | "P2" | "P3"
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
      arr_status: ["In ARR", "ARR Expired", "Unknown"],
      artist_tier: ["Core", "Satellite", "Speculative", "Retired"],
      confidence_level: ["Low", "Medium", "High"],
      data_confidence: ["Thin", "Adequate", "Strong"],
      decision_kind: ["Buy", "Watch", "Avoid", "Undecided"],
      note_scope: ["Artist", "Venue", "System"],
      note_type: ["Verdict", "Trigger", "Flag", "Observation"],
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
      priority_level: ["P1", "P2", "P3"],
    },
  },
} as const
