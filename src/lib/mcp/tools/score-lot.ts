import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { errorResult, textResult } from "../shared";
import { loadScoreInputs, resolveArtist } from "../../desk/slices";
import { scoreLot, type LotInput, type ScoreBundle } from "../../desk/score";
import { lotRowFromDecision } from "../../desk/persist";

export default defineTool({
  name: "score_lot",
  title: "Score a lot (Lot Desk v0.6)",
  description:
    "Score a single auction lot against the collector fair-value discipline: rung-ladder anchor on home-market comps, bounded quality delta, per-name K_buy, hard taste + budget gates, and a walk-away ladder. Returns the full decision object (Buy / Skip / Monitor with the binding constraint). By default it also writes the lot to the candidate ledger (public.lots), keyed on sale_key, so it surfaces on the Lot Desk beside its grain; pass persist:false for a dry-run that writes nothing.",
  inputSchema: {
    artist: z.string().optional().describe("Artist name or slug; resolved to artist_id. Omit if passing artist_id."),
    artist_id: z.string().optional().describe("Canonical slug; skips name resolution."),
    title: z.string(),
    authorship: z.string().describe("Autograph / Attributed / After / etc. Only Autograph passes the mandate gate."),
    medium_raw: z.string().describe("Verbatim catalogue medium."),
    medium_class: z.string().optional().describe("Oil / Watercolour / ...; inferred from medium_raw if omitted."),
    longest_cm: z.number(),
    subject: z.string().describe("Controlled subject vocab; used for the taste-zone gate."),
    palette: z.string().describe("Sunlit / Grey / Neutral / Moonlit."),
    palette_keyword_only: z.boolean().optional().describe("Flag a palette call made from the title alone."),
    in_zone: z.enum(["In", "Skip"]).optional().describe("Human override; else computed from subject + per-artist overrides."),
    est_low: z.number().optional(),
    est_high: z.number().optional(),
    currency: z.string(),
    venue: z.string(),
    sale_date: z.string().describe("ISO yyyy-mm-dd."),
    bp_pct: z.number().optional().describe("Per-house buyer's premium as a fraction; else the desk default."),
    strong_venue_candidate: z.boolean().describe("Y only if this is a good example that genuinely trades at strong venues; escalates the anchor tier."),
    quality_delta: z.number().optional().describe("Where this lot sits vs the median comp; bounded to observed dispersion. Omit => 1.0, stamped median-quality-assumed."),
    quality_delta_basis: z.string().optional(),
    quality_override_reason: z.string().optional().describe("Required to assert a delta outside the observed comp range."),
    condition: z.string().optional(),
    sheet_grade: z.string().optional().describe("Paper sleeve: 'Finished' required."),
    condition_checked: z.boolean().optional().describe("True if a report / verso / UV image has been seen."),
    provenance_note: z.string().optional(),
    sale_context: z.string().optional().describe("Multiples-in-sale / pair / budget conflict prose."),
    taste_ok: z.boolean().describe("Glad to own at a fair price if it never re-rates? Hard gate."),
    period_year: z.number().optional().describe("Budget period; defaults to the sale year."),
    persist: z.boolean().optional().describe("Write the scored lot to the candidate ledger (default true). false = dry-run, writes nothing."),
    source_ref: z.string().optional().describe("Listing URL or MutualArt dump ref, stored on the lot for provenance."),
  },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (a, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    try {
      const sb = supabaseForUser(ctx);

      let artist_id = a.artist_id;
      if (!artist_id) {
        if (!a.artist) throw new ToolError("provide artist or artist_id");
        const hits = await resolveArtist(sb, a.artist);
        if (hits.length === 0) throw new ToolError(`no roster artist matches "${a.artist}"`);
        if (hits.length > 1) return textResult({ needs_disambiguation: hits });
        artist_id = hits[0]!.artist_id;
      }

      const period_year = a.period_year ?? Number(a.sale_date.slice(0, 4));
      const { comps, bands, config, params, budget } = await loadScoreInputs(sb, artist_id, period_year);
      if (!config) throw new ToolError(`no artist_desk_config for "${artist_id}" (run the Phase 0 seed)`);

      const lot: LotInput = {
        artist_id,
        title: a.title,
        authorship: a.authorship,
        medium_raw: a.medium_raw,
        medium_class: a.medium_class ?? null,
        longest_cm: a.longest_cm,
        subject: a.subject,
        palette: a.palette,
        palette_keyword_only: a.palette_keyword_only ?? false,
        est_low: a.est_low ?? null,
        est_high: a.est_high ?? null,
        currency: a.currency,
        venue: a.venue,
        sale_date: a.sale_date,
        bp_pct: a.bp_pct ?? null,
        strong_venue_candidate: a.strong_venue_candidate,
        quality_delta: a.quality_delta ?? null,
        quality_delta_basis: a.quality_delta_basis ?? null,
        quality_override_reason: a.quality_override_reason ?? null,
        condition: a.condition ?? null,
        sheet_grade: a.sheet_grade ?? null,
        condition_checked: a.condition_checked ?? false,
        provenance_note: a.provenance_note ?? null,
        sale_context: a.sale_context ?? null,
        taste_ok: a.taste_ok,
        ...(a.in_zone ? { in_zone: a.in_zone } : {}),
      };

      const bundle: ScoreBundle = { lot, comps, config, params, budget, bands: bands ?? [] };
      const d = scoreLot(bundle);

      // Dry-run: score only, write nothing.
      if (a.persist === false) return textResult({ ...d, persisted: false });

      // Persist to the candidate ledger (upsert keyed on sale_key).
      const row = lotRowFromDecision(d, lot, { captured_by: "claude", source_ref: a.source_ref ?? null });
      const { data: saved, error: upErr } = await sb
        .from("lots")
        .upsert(row, { onConflict: "sale_key" })
        .select("lot_id")
        .single();
      if (upErr) throw new ToolError(`lots upsert failed: ${upErr.message}`);

      return textResult({ ...d, persisted: true, lot_id: saved.lot_id });
    } catch (err) {
      return errorResult(`score_lot error: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
});
