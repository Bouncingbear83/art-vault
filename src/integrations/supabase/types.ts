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
      artist_desk_config: {
        Row: {
          arr_active_until: string | null
          artist_id: string
          band_set: string
          commission_floor_gbp: number | null
          discount_class: string
          discount_override_firm: number | null
          discount_override_stretch: number | null
          floor_reviewed: string | null
          inzone_finished_wc_median_gbp: number | null
          min_longest_cm: number | null
          note: string | null
          palette_avoid: string[] | null
          paper_ceiling_gbp: number | null
          paper_primary: boolean
          strong_venue_default: boolean
          updated_at: string
        }
        Insert: {
          arr_active_until?: string | null
          artist_id: string
          band_set?: string
          commission_floor_gbp?: number | null
          discount_class?: string
          discount_override_firm?: number | null
          discount_override_stretch?: number | null
          floor_reviewed?: string | null
          inzone_finished_wc_median_gbp?: number | null
          min_longest_cm?: number | null
          note?: string | null
          palette_avoid?: string[] | null
          paper_ceiling_gbp?: number | null
          paper_primary?: boolean
          strong_venue_default?: boolean
          updated_at?: string
        }
        Update: {
          arr_active_until?: string | null
          artist_id?: string
          band_set?: string
          commission_floor_gbp?: number | null
          discount_class?: string
          discount_override_firm?: number | null
          discount_override_stretch?: number | null
          floor_reviewed?: string | null
          inzone_finished_wc_median_gbp?: number | null
          min_longest_cm?: number | null
          note?: string | null
          palette_avoid?: string[] | null
          paper_ceiling_gbp?: number | null
          paper_primary?: boolean
          strong_venue_default?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_desk_config_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: true
            referencedRelation: "artist_360"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "artist_desk_config_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: true
            referencedRelation: "artists"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "artist_desk_config_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: true
            referencedRelation: "book_screen"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "artist_desk_config_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: true
            referencedRelation: "play_type_audit"
            referencedColumns: ["artist_id"]
          },
        ]
      }
      artists: {
        Row: {
          arr_status: string | null
          artist_id: string
          birth_year: number | null
          dates: string | null
          death_year: number | null
          display_name: string
          mutualart_url: string | null
          palette_pref: string | null
          paper_sleeve: boolean | null
          play_type: Database["public"]["Enums"]["play_type_t"] | null
          register: string
          tier: string | null
          tracked: boolean
          updated_at: string | null
        }
        Insert: {
          arr_status?: string | null
          artist_id: string
          birth_year?: number | null
          dates?: string | null
          death_year?: number | null
          display_name: string
          mutualart_url?: string | null
          palette_pref?: string | null
          paper_sleeve?: boolean | null
          play_type?: Database["public"]["Enums"]["play_type_t"] | null
          register: string
          tier?: string | null
          tracked?: boolean
          updated_at?: string | null
        }
        Update: {
          arr_status?: string | null
          artist_id?: string
          birth_year?: number | null
          dates?: string | null
          death_year?: number | null
          display_name?: string
          mutualart_url?: string | null
          palette_pref?: string | null
          paper_sleeve?: boolean | null
          play_type?: Database["public"]["Enums"]["play_type_t"] | null
          register?: string
          tier?: string | null
          tracked?: boolean
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artists_register_fkey"
            columns: ["register"]
            isOneToOne: false
            referencedRelation: "register_defs"
            referencedColumns: ["register_code"]
          },
        ]
      }
      budget: {
        Row: {
          committed_gbp: number
          envelope_gbp: number
          period_year: number
          target_works: number | null
          updated_at: string
        }
        Insert: {
          committed_gbp?: number
          envelope_gbp?: number
          period_year: number
          target_works?: number | null
          updated_at?: string
        }
        Update: {
          committed_gbp?: number
          envelope_gbp?: number
          period_year?: number
          target_works?: number | null
          updated_at?: string
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
            referencedRelation: "artist_360"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "comps_raw_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "comps_raw_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "book_screen"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "comps_raw_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "play_type_audit"
            referencedColumns: ["artist_id"]
          },
        ]
      }
      comps_stage: {
        Row: {
          artist: string
          authorship: string | null
          currency: string | null
          est_high: number | null
          est_low: number | null
          h_cm: number | null
          id: number
          ingested_at: string
          load_batch: string
          medium_class: string | null
          medium_raw: string | null
          palette: string | null
          realized_basis: string | null
          realized_native: number | null
          sale_date: string | null
          status: string | null
          subject: string | null
          title: string | null
          venue: string | null
          w_cm: number | null
        }
        Insert: {
          artist: string
          authorship?: string | null
          currency?: string | null
          est_high?: number | null
          est_low?: number | null
          h_cm?: number | null
          id?: never
          ingested_at?: string
          load_batch?: string
          medium_class?: string | null
          medium_raw?: string | null
          palette?: string | null
          realized_basis?: string | null
          realized_native?: number | null
          sale_date?: string | null
          status?: string | null
          subject?: string | null
          title?: string | null
          venue?: string | null
          w_cm?: number | null
        }
        Update: {
          artist?: string
          authorship?: string | null
          currency?: string | null
          est_high?: number | null
          est_low?: number | null
          h_cm?: number | null
          id?: never
          ingested_at?: string
          load_batch?: string
          medium_class?: string | null
          medium_raw?: string | null
          palette?: string | null
          realized_basis?: string | null
          realized_native?: number | null
          sale_date?: string | null
          status?: string | null
          subject?: string | null
          title?: string | null
          venue?: string | null
          w_cm?: number | null
        }
        Relationships: []
      }
      desk_params: {
        Row: {
          arr_rate: number
          band_factor_cap: number
          band_floor_gbp: number | null
          band_n_gate: number
          bp_pct_default: number
          collector_discount_firm: number
          collector_discount_stretch: number
          created_at: string
          effective_from: string
          homogeneity_threshold: number
          max_work_gbp: number
          n_gate: number
          note: string | null
          params_id: string
          recency_cutoff: number
          remote_haircut: number
          sleeve_ceiling_multiple: number
          stale_haircut: number
          vat_premium: number
        }
        Insert: {
          arr_rate?: number
          band_factor_cap?: number
          band_floor_gbp?: number | null
          band_n_gate?: number
          bp_pct_default?: number
          collector_discount_firm: number
          collector_discount_stretch: number
          created_at?: string
          effective_from?: string
          homogeneity_threshold?: number
          max_work_gbp?: number
          n_gate?: number
          note?: string | null
          params_id?: string
          recency_cutoff?: number
          remote_haircut?: number
          sleeve_ceiling_multiple?: number
          stale_haircut?: number
          vat_premium?: number
        }
        Update: {
          arr_rate?: number
          band_factor_cap?: number
          band_floor_gbp?: number | null
          band_n_gate?: number
          bp_pct_default?: number
          collector_discount_firm?: number
          collector_discount_stretch?: number
          created_at?: string
          effective_from?: string
          homogeneity_threshold?: number
          max_work_gbp?: number
          n_gate?: number
          note?: string | null
          params_id?: string
          recency_cutoff?: number
          remote_haircut?: number
          sleeve_ceiling_multiple?: number
          stale_haircut?: number
          vat_premium?: number
        }
        Relationships: []
      }
      desk_params_write_audit: {
        Row: {
          audit_id: number
          db_role: string
          logged_at: string
          note: string | null
          params_id: string | null
          source: string
        }
        Insert: {
          audit_id?: never
          db_role?: string
          logged_at?: string
          note?: string | null
          params_id?: string | null
          source?: string
        }
        Update: {
          audit_id?: never
          db_role?: string
          logged_at?: string
          note?: string | null
          params_id?: string | null
          source?: string
        }
        Relationships: []
      }
      lots: {
        Row: {
          all_in_at_firm_gbp: number | null
          anchor_confidence: string | null
          anchor_n: number | null
          anchor_rung: number | null
          anchor_tier: string | null
          artist_id: string
          authorship: string
          binding_constraint: string | null
          budget_ok: boolean | null
          captured_by: string
          classification_confidence: number | null
          condition_checked: boolean
          condition_note: string | null
          created_at: string
          currency: string | null
          decision: string | null
          decision_json: Json | null
          est_high: number | null
          est_low: number | null
          fair_value_gbp: number | null
          flags: string[]
          in_zone: string | null
          k_buy: number | null
          ladder_commission_gbp: number | null
          ladder_firm_gbp: number | null
          ladder_stretch_gbp: number | null
          ladder_tightened_gbp: number | null
          lane: string | null
          longest_cm: number | null
          lot_id: string
          lot_note_id: string | null
          medium_class: string | null
          medium_raw: string | null
          palette: string | null
          palette_kw_only: boolean
          params_id: string | null
          position_id: string | null
          provenance_note: string | null
          quality_delta_input: number | null
          quality_delta_value: number | null
          quality_override_reason: string | null
          result_captured_at: string | null
          result_hammer_gbp: number | null
          sale_context: string | null
          sale_date: string | null
          sale_key: string
          scored_at: string | null
          sheet_grade: string | null
          source_ref: string | null
          status: string
          strong_venue_candidate: boolean
          subject: string | null
          taste_ok: boolean | null
          title: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          all_in_at_firm_gbp?: number | null
          anchor_confidence?: string | null
          anchor_n?: number | null
          anchor_rung?: number | null
          anchor_tier?: string | null
          artist_id: string
          authorship?: string
          binding_constraint?: string | null
          budget_ok?: boolean | null
          captured_by?: string
          classification_confidence?: number | null
          condition_checked?: boolean
          condition_note?: string | null
          created_at?: string
          currency?: string | null
          decision?: string | null
          decision_json?: Json | null
          est_high?: number | null
          est_low?: number | null
          fair_value_gbp?: number | null
          flags?: string[]
          in_zone?: string | null
          k_buy?: number | null
          ladder_commission_gbp?: number | null
          ladder_firm_gbp?: number | null
          ladder_stretch_gbp?: number | null
          ladder_tightened_gbp?: number | null
          lane?: string | null
          longest_cm?: number | null
          lot_id?: string
          lot_note_id?: string | null
          medium_class?: string | null
          medium_raw?: string | null
          palette?: string | null
          palette_kw_only?: boolean
          params_id?: string | null
          position_id?: string | null
          provenance_note?: string | null
          quality_delta_input?: number | null
          quality_delta_value?: number | null
          quality_override_reason?: string | null
          result_captured_at?: string | null
          result_hammer_gbp?: number | null
          sale_context?: string | null
          sale_date?: string | null
          sale_key: string
          scored_at?: string | null
          sheet_grade?: string | null
          source_ref?: string | null
          status?: string
          strong_venue_candidate?: boolean
          subject?: string | null
          taste_ok?: boolean | null
          title: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          all_in_at_firm_gbp?: number | null
          anchor_confidence?: string | null
          anchor_n?: number | null
          anchor_rung?: number | null
          anchor_tier?: string | null
          artist_id?: string
          authorship?: string
          binding_constraint?: string | null
          budget_ok?: boolean | null
          captured_by?: string
          classification_confidence?: number | null
          condition_checked?: boolean
          condition_note?: string | null
          created_at?: string
          currency?: string | null
          decision?: string | null
          decision_json?: Json | null
          est_high?: number | null
          est_low?: number | null
          fair_value_gbp?: number | null
          flags?: string[]
          in_zone?: string | null
          k_buy?: number | null
          ladder_commission_gbp?: number | null
          ladder_firm_gbp?: number | null
          ladder_stretch_gbp?: number | null
          ladder_tightened_gbp?: number | null
          lane?: string | null
          longest_cm?: number | null
          lot_id?: string
          lot_note_id?: string | null
          medium_class?: string | null
          medium_raw?: string | null
          palette?: string | null
          palette_kw_only?: boolean
          params_id?: string | null
          position_id?: string | null
          provenance_note?: string | null
          quality_delta_input?: number | null
          quality_delta_value?: number | null
          quality_override_reason?: string | null
          result_captured_at?: string | null
          result_hammer_gbp?: number | null
          sale_context?: string | null
          sale_date?: string | null
          sale_key?: string
          scored_at?: string | null
          sheet_grade?: string | null
          source_ref?: string | null
          status?: string
          strong_venue_candidate?: boolean
          subject?: string | null
          taste_ok?: boolean | null
          title?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lots_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist_360"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "lots_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "lots_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "book_screen"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "lots_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "play_type_audit"
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
            referencedRelation: "artist_360"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "notes_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "notes_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "book_screen"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "notes_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "play_type_audit"
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
      positions: {
        Row: {
          all_in_gbp: number | null
          artist_id: string | null
          buy_date: string | null
          condition_status: string | null
          created_at: string
          hammer_gbp: number | null
          house: string | null
          longest_cm: number | null
          lot_note_id: string | null
          palette: string | null
          params_id: string | null
          position_id: string
          rationale: string | null
          sale_key: string | null
          subject: string | null
          title: string | null
        }
        Insert: {
          all_in_gbp?: number | null
          artist_id?: string | null
          buy_date?: string | null
          condition_status?: string | null
          created_at?: string
          hammer_gbp?: number | null
          house?: string | null
          longest_cm?: number | null
          lot_note_id?: string | null
          palette?: string | null
          params_id?: string | null
          position_id?: string
          rationale?: string | null
          sale_key?: string | null
          subject?: string | null
          title?: string | null
        }
        Update: {
          all_in_gbp?: number | null
          artist_id?: string | null
          buy_date?: string | null
          condition_status?: string | null
          created_at?: string
          hammer_gbp?: number | null
          house?: string | null
          longest_cm?: number | null
          lot_note_id?: string | null
          palette?: string | null
          params_id?: string | null
          position_id?: string
          rationale?: string | null
          sale_key?: string | null
          subject?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist_360"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "positions_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "positions_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "book_screen"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "positions_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "play_type_audit"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "positions_lot_note_id_fkey"
            columns: ["lot_note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["note_id"]
          },
          {
            foreignKeyName: "positions_params_id_fkey"
            columns: ["params_id"]
            isOneToOne: false
            referencedRelation: "desk_params"
            referencedColumns: ["params_id"]
          },
          {
            foreignKeyName: "positions_params_id_fkey"
            columns: ["params_id"]
            isOneToOne: false
            referencedRelation: "desk_params_current"
            referencedColumns: ["params_id"]
          },
        ]
      }
      register_defs: {
        Row: {
          active: boolean
          created_at: string
          description: string
          label: string
          register_code: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description: string
          label: string
          register_code: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          label?: string
          register_code?: string
          sort_order?: number
        }
        Relationships: []
      }
      size_band_defs: {
        Row: {
          band_label: string
          band_set: string
          hi: number | null
          lo: number
          note: string | null
          sort_order: number
        }
        Insert: {
          band_label: string
          band_set?: string
          hi?: number | null
          lo: number
          note?: string | null
          sort_order: number
        }
        Update: {
          band_label?: string
          band_set?: string
          hi?: number | null
          lo?: number
          note?: string | null
          sort_order?: number
        }
        Relationships: []
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
            referencedRelation: "artist_360"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "triggers_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "triggers_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "book_screen"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "triggers_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "play_type_audit"
            referencedColumns: ["artist_id"]
          },
        ]
      }
      upcoming_lots: {
        Row: {
          artist_id: string | null
          artist_raw: string
          authorship: string
          band_firm_hammer_gbp: number | null
          band_label: string | null
          band_verdict: string | null
          classification_json: Json | null
          created_at: string
          currency: string | null
          dismissed_at: string | null
          dismissed_reason: string | null
          est_high: number | null
          est_low: number | null
          first_seen_at: string
          geo_resolved: string | null
          h_cm: number | null
          image_url: string | null
          in_zone: string | null
          last_seen_at: string
          longest_cm: number | null
          lot_url: string | null
          medium_class: string | null
          medium_raw: string | null
          outcome_basis: string | null
          outcome_captured_at: string | null
          outcome_currency: string | null
          outcome_hammer_native: number | null
          outcome_status: string | null
          palette: string | null
          palette_confidence: number | null
          palette_kw_only: boolean
          paper_ceiling_gbp: number | null
          params_id: string | null
          promoted_at: string | null
          promoted_lot_id: string | null
          radar_lane: string
          radar_rank: number | null
          radar_reason: string | null
          sale_date: string | null
          sale_key: string
          scored_at: string | null
          source: string
          source_ref: string | null
          staged_batch: string | null
          subject: string | null
          subject_confidence: number | null
          title: string
          updated_at: string
          venue_canonical: string | null
          venue_raw: string | null
          vtype_resolved: string | null
          w_cm: number | null
        }
        Insert: {
          artist_id?: string | null
          artist_raw: string
          authorship?: string
          band_firm_hammer_gbp?: number | null
          band_label?: string | null
          band_verdict?: string | null
          classification_json?: Json | null
          created_at?: string
          currency?: string | null
          dismissed_at?: string | null
          dismissed_reason?: string | null
          est_high?: number | null
          est_low?: number | null
          first_seen_at?: string
          geo_resolved?: string | null
          h_cm?: number | null
          image_url?: string | null
          in_zone?: string | null
          last_seen_at?: string
          longest_cm?: number | null
          lot_url?: string | null
          medium_class?: string | null
          medium_raw?: string | null
          outcome_basis?: string | null
          outcome_captured_at?: string | null
          outcome_currency?: string | null
          outcome_hammer_native?: number | null
          outcome_status?: string | null
          palette?: string | null
          palette_confidence?: number | null
          palette_kw_only?: boolean
          paper_ceiling_gbp?: number | null
          params_id?: string | null
          promoted_at?: string | null
          promoted_lot_id?: string | null
          radar_lane?: string
          radar_rank?: number | null
          radar_reason?: string | null
          sale_date?: string | null
          sale_key: string
          scored_at?: string | null
          source: string
          source_ref?: string | null
          staged_batch?: string | null
          subject?: string | null
          subject_confidence?: number | null
          title: string
          updated_at?: string
          venue_canonical?: string | null
          venue_raw?: string | null
          vtype_resolved?: string | null
          w_cm?: number | null
        }
        Update: {
          artist_id?: string | null
          artist_raw?: string
          authorship?: string
          band_firm_hammer_gbp?: number | null
          band_label?: string | null
          band_verdict?: string | null
          classification_json?: Json | null
          created_at?: string
          currency?: string | null
          dismissed_at?: string | null
          dismissed_reason?: string | null
          est_high?: number | null
          est_low?: number | null
          first_seen_at?: string
          geo_resolved?: string | null
          h_cm?: number | null
          image_url?: string | null
          in_zone?: string | null
          last_seen_at?: string
          longest_cm?: number | null
          lot_url?: string | null
          medium_class?: string | null
          medium_raw?: string | null
          outcome_basis?: string | null
          outcome_captured_at?: string | null
          outcome_currency?: string | null
          outcome_hammer_native?: number | null
          outcome_status?: string | null
          palette?: string | null
          palette_confidence?: number | null
          palette_kw_only?: boolean
          paper_ceiling_gbp?: number | null
          params_id?: string | null
          promoted_at?: string | null
          promoted_lot_id?: string | null
          radar_lane?: string
          radar_rank?: number | null
          radar_reason?: string | null
          sale_date?: string | null
          sale_key?: string
          scored_at?: string | null
          source?: string
          source_ref?: string | null
          staged_batch?: string | null
          subject?: string | null
          subject_confidence?: number | null
          title?: string
          updated_at?: string
          venue_canonical?: string | null
          venue_raw?: string | null
          vtype_resolved?: string | null
          w_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "upcoming_lots_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artist_360"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "upcoming_lots_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "upcoming_lots_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "book_screen"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "upcoming_lots_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "play_type_audit"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "upcoming_lots_promoted_lot_id_fkey"
            columns: ["promoted_lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["lot_id"]
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
      artist_360: {
        Row: {
          arb_edge_raw: number | null
          arb_read: string | null
          arr_status: string | null
          artist_id: string | null
          buy_edge_flag: string | null
          buy_regional_realisation: number | null
          ceiling_breach: boolean | null
          data_confidence: Database["public"]["Enums"]["confidence_t"] | null
          dates: string | null
          display_name: string | null
          exit_vs_regional_spread: number | null
          in_zone_realisation: number | null
          level_read: Database["public"]["Enums"]["level_t"] | null
          matched_n: number | null
          matched_spread: number | null
          median_realisation: number | null
          median_uk_hammer_gbp: number | null
          mutualart_url: string | null
          n_buy_regional: number | null
          n_exit_strong: number | null
          n_uk_auto_oil: number | null
          open_flags: number | null
          palette_pref: string | null
          play_type: Database["public"]["Enums"]["play_type_t"] | null
          price_cagr_full: number | null
          sell_through_pct: number | null
          sell_through_trend: string | null
          spread_trusted: boolean | null
          thin_exit_flag: boolean | null
          tier: string | null
          zone_conf: string | null
          zone_fitness: string | null
        }
        Relationships: []
      }
      artist_buy_band: {
        Row: {
          all_in_at_firm_gbp: number | null
          arr_live: boolean | null
          artist_id: string | null
          band_ceiling_gbp: number | null
          band_floor_gbp: number | null
          band_hi: number | null
          band_label: string | null
          band_median_gbp: number | null
          band_n_gate: number | null
          band_realisation: number | null
          band_verdict: string | null
          concentration_ratio: number | null
          firm_hammer_gbp: number | null
          k_buy: number | null
          max_work_gbp: number | null
          min_longest_cm: number | null
          n_below_min_excluded: number | null
          n_low_value_excluded: number | null
          n_offered: number | null
          n_palette_excluded: number | null
          n_sold: number | null
          n_sold_recent: number | null
          n_unsold: number | null
          per_work_budget_gbp: number | null
          play_type: Database["public"]["Enums"]["play_type_t"] | null
          recency_cutoff: number | null
          recency_drift: number | null
          recent_median_gbp: number | null
          sell_through_pct: number | null
          sort_order: number | null
        }
        Relationships: []
      }
      artist_size_band_medians: {
        Row: {
          artist_id: string | null
          band_hi: number | null
          band_label: string | null
          band_lo: number | null
          max_gbp: number | null
          median_gbp: number | null
          median_recent_gbp: number | null
          min_gbp: number | null
          n: number | null
          n_recent: number | null
          p25_gbp: number | null
          p75_gbp: number | null
          scope_order: number | null
          sort_order: number | null
          thin: boolean | null
          tier_scope: string | null
        }
        Relationships: []
      }
      artist_zone_fitness: {
        Row: {
          artist_id: string | null
          n_in: number | null
          n_out: number | null
          real_in: number | null
          real_out: number | null
          real_premium: number | null
          st_in: number | null
          st_out: number | null
          st_premium_pp: number | null
          zone_conf: string | null
          zone_fitness: string | null
        }
        Relationships: []
      }
      book_screen: {
        Row: {
          arr_status: string | null
          artist_id: string | null
          buy_edge_flag: string | null
          buy_regional_realisation: number | null
          ceiling_breach: boolean | null
          comps_updated_at: string | null
          data_confidence: Database["public"]["Enums"]["confidence_t"] | null
          dates: string | null
          display_name: string | null
          exit_vs_regional_spread: number | null
          level_read: Database["public"]["Enums"]["level_t"] | null
          matched_spread: number | null
          median_realisation: number | null
          median_uk_hammer_gbp: number | null
          mutualart_url: string | null
          n_buy_regional: number | null
          n_exit_strong: number | null
          open_flags: number | null
          palette_pref: string | null
          paper_sleeve: boolean | null
          play_type: Database["public"]["Enums"]["play_type_t"] | null
          price_cagr_full: number | null
          sell_through_pct: number | null
          sell_through_trend: string | null
          spread_trusted: boolean | null
          thin_exit_flag: boolean | null
          tier: string | null
          zone_conf: string | null
          zone_fitness: string | null
          zone_sellthrough_premium_pp: number | null
        }
        Relationships: []
      }
      comps_rollup: {
        Row: {
          anchor_id: string | null
          arb_edge_raw: number | null
          arb_read: string | null
          artist_id: string | null
          buy_edge_flag: string | null
          buy_regional_realisation: number | null
          ceiling_breach: boolean | null
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
      desk_params_current: {
        Row: {
          arr_rate: number | null
          band_factor_cap: number | null
          band_floor_gbp: number | null
          band_n_gate: number | null
          bp_pct_default: number | null
          collector_discount_firm: number | null
          collector_discount_stretch: number | null
          created_at: string | null
          effective_from: string | null
          homogeneity_threshold: number | null
          max_work_gbp: number | null
          n_gate: number | null
          note: string | null
          params_id: string | null
          recency_cutoff: number | null
          remote_haircut: number | null
          sleeve_ceiling_multiple: number | null
          stale_haircut: number | null
          vat_premium: number | null
        }
        Relationships: []
      }
      play_type_audit: {
        Row: {
          artist_id: string | null
          current_play: Database["public"]["Enums"]["play_type_t"] | null
          display_name: string | null
          level_read: Database["public"]["Enums"]["level_t"] | null
          median_uk_hammer_gbp: number | null
          n_uk_auto_oil: number | null
          paper_sleeve: boolean | null
          suggested_play: string | null
          zone_conf: string | null
          zone_fitness: string | null
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
      _recompute_budget_year: { Args: { yr: number }; Returns: undefined }
      apply_sleeve_multiple: { Args: { p_multiple: number }; Returns: number }
      is_owner: { Args: never; Returns: boolean }
      ratify_desk_params: {
        Args: {
          p_band_factor_cap?: number
          p_band_floor_gbp: number
          p_band_n_gate?: number
          p_discount_firm: number
          p_discount_stretch: number
          p_max_work_gbp?: number
          p_note: string
        }
        Returns: string
      }
      update_note: {
        Args: {
          p_action_status?: Database["public"]["Enums"]["action_status_t"]
          p_clear_valid_to?: boolean
          p_note_id: string
          p_tags?: string[]
          p_valid_to?: string
        }
        Returns: Json
      }
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
