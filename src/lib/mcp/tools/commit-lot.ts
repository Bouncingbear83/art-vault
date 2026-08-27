import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { errorResult, textResult, today } from "../shared";
import { loadScoreInputs, resolveArtist } from "../../desk/slices";
import { scoreLot, type LotInput, type ScoreBundle } from "../../desk/score";
import { lotRowFromDecision } from "../../desk/persist";

// Re-scores server-side to snapshot the anchor + params, records the ACTUAL hammer paid,
// writes a Lot note and a positions row. budget.committed_gbp is maintained by the
// positions trigger (Phase 2 migration), so no budget write happens here.
export default defineTool({
  name: "commit_lot",
  title: "Commit a won lot to the ledger (Lot Desk v0.6)",
  description:
    "On a win: re-score the lot, then record it. Writes a Lot note (I.5 body grammar) and a positions row with the actual hammer paid and all-in cost. Flags if the hammer paid exceeded the walk-away, or if any gate had failed. Does not write the budget directly; the positions trigger keeps committed_gbp in sync.",
  inputSchema: {
    artist: z.string().optional(),
    artist_id: z.string().optional(),
    title: z.string(),
    authorship: z.string(),
    medium_raw: z.string(),
    medium_class: z.string().optional(),
    longest_cm: z.number(),
    subject: z.string(),
    palette: z.string(),
    in_zone: z.enum(["In", "Skip"]).optional(),
    currency: z.string(),
    venue: z.string(),
    sale_date: z.string(),
    bp_pct: z.number().optional(),
    strong_venue_candidate: z.boolean(),
    quality_delta: z.number().optional(),
    quality_override_reason: z.string().optional(),
    condition: z.string().optional(),
    sheet_grade: z.string().optional(),
    condition_checked: z.boolean().optional(),
    taste_ok: z.boolean(),
    // actuals of the win:
    hammer_paid_gbp: z.number().describe("The winning hammer actually paid (GBP)."),
    house: z.string().optional().describe("Saleroom; defaults to venue."),
    condition_status: z.string().optional().describe("Condition as bought, for the ledger."),
    buy_date: z.string().optional().describe("ISO; defaults to today."),
    rationale: z.string().optional().describe("The glad-to-own line; else the scorer's."),
    commit_override_reason: z.string().optional()
      .describe("Required to commit outside the scored ladder. Recorded on the position."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
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

    const period_year = Number(a.sale_date.slice(0, 4));
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
      currency: a.currency,
      venue: a.venue,
      sale_date: a.sale_date,
      bp_pct: a.bp_pct ?? null,
      strong_venue_candidate: a.strong_venue_candidate,
      quality_delta: a.quality_delta ?? null,
      quality_override_reason: a.quality_override_reason ?? null,
      condition: a.condition ?? null,
      sheet_grade: a.sheet_grade ?? null,
      condition_checked: a.condition_checked ?? false,
      taste_ok: a.taste_ok,
      ...(a.in_zone ? { in_zone: a.in_zone } : {}),
    };

    const bundle: ScoreBundle = { lot, comps, config, params, budget, bands: bands ?? [] };
    const d = scoreLot(bundle);

    // Discipline flags on the actual price paid.
    const K = d.K_buy;
    const all_in = Math.round(a.hammer_paid_gbp * K);
    const flags = [...d.flags];
    const firm = d.ladder.firm;
    const stretch = d.ladder.stretch;

    // Refusal gate: a wrong hammer propagates to positions, all_in_gbp and, via the
    // positions trigger, to budget.committed_gbp, where it silently constrains every
    // later bid. Refuse rather than guess.
    const ceiling = stretch ?? firm;
    const tooHigh = ceiling != null && a.hammer_paid_gbp > ceiling;
    const tooLow = firm != null && a.hammer_paid_gbp < firm * 0.25;
    if ((tooHigh || tooLow) && !a.commit_override_reason) {
      throw new ToolError(
        tooHigh
          ? `hammer £${a.hammer_paid_gbp} exceeds the scored ${stretch != null ? "stretch" : "firm"} bid of £${ceiling}; supply commit_override_reason to record it anyway`
          : `hammer £${a.hammer_paid_gbp} is under a quarter of the firm bid of £${firm}; this reads as a stale or mistyped figure. Supply commit_override_reason if it is real`,
      );
    }
    if (a.commit_override_reason && (tooHigh || tooLow)) {
      flags.push(`commit-outside-ladder:${a.hammer_paid_gbp}-vs-firm-${firm}`);
    }

    if (firm != null && a.hammer_paid_gbp > firm) flags.push(`paid-above-firm:${a.hammer_paid_gbp}>${firm}`);
    if (stretch != null && a.hammer_paid_gbp > stretch) flags.push(`paid-above-stretch:${a.hammer_paid_gbp}>${stretch}`);
    if (d.decision !== "Buy") flags.push(`committed-despite:${d.binding_constraint ?? d.decision}`);

    const sale_key = d.lot.sale_key;
    const buy_date = a.buy_date ?? today();
    const rationale = a.rationale ?? d.rationale;

    // Lot note (I.5 body grammar), reusing the scorer's body but stamping the actuals.
    const body =
      (d.vault?.note_body ?? `GRAIN: ${d.lane} lane.\n\nFINDING: fair £${d.anchor.fair_value ?? "-"}.`) +
      `\n\nACTUALS: hammer £${a.hammer_paid_gbp}, all-in £${all_in}, K_buy ${K}, house ${a.house ?? a.venue}.`;
    const valid_to = d.vault?.valid_to ?? null;

    const { data: note, error: nErr } = await sb
      .from("notes")
      .insert({
        note_type: "Lot",
        scope: "Lot",
        artist_id,
        entity_key: sale_key,
        decision: "Buy",
        action_status: "Open",
        play_type: "NA",
        confidence: "Med",
        valid_from: buy_date,
        valid_to,
        source_ref: sale_key,
        body,
        created_by: "claude",
      })
      .select("note_id")
      .single();
    if (nErr) throw new ToolError(`Lot note insert failed: ${nErr.message}`);

    const { data: pos, error: pErr } = await sb
      .from("positions")
      .insert({
        artist_id,
        title: a.title,
        sale_key,
        house: a.house ?? a.venue,
        hammer_gbp: a.hammer_paid_gbp,
        all_in_gbp: all_in,
        buy_date,
        condition_status: a.condition_status ?? a.condition ?? null,
        subject: a.subject,
        palette: a.palette,
        longest_cm: a.longest_cm,
        rationale,
        params_id: params.params_id,
        lot_note_id: note.note_id,
      })
      .select("position_id")
      .single();
    if (pErr) throw new ToolError(`Lot note ${note.note_id} written, but positions insert failed: ${pErr.message}`);

        // graduate the candidate row (won + links); upsert so a never-scored lot still lands
    const lotRow = lotRowFromDecision(d, lot, { captured_by: "claude", source_ref: sale_key });
    const { error: lErr } = await sb.from("lots").upsert(
      { ...lotRow, status: "won", position_id: pos.position_id, lot_note_id: note.note_id },
      { onConflict: "sale_key" },
    );
    if (lErr) flags.push(`lots-upsert-failed:${lErr.message}`);

    return textResult({
      committed: true,
      position_id: pos.position_id,
      lot_note_id: note.note_id,
      hammer_paid_gbp: a.hammer_paid_gbp,
      all_in_gbp: all_in,
      walkaway: { firm, stretch },
      scored_decision: d.decision,
      binding_constraint: d.binding_constraint,
      flags,
    });
    } catch (err) {
      return errorResult(`commit_lot error: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
});
