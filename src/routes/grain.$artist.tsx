// /grain/$artist : per-name grain distortion diagnostics.
// Render-only. Reads the comps grain directly (RLS-permissive per the desk
// table pattern); Foreign and Print rows are dropped inside computeGrainStats.
//
// v2: pulls sheet_grade (needed for the paper-sleeve finished-watercolour
// ceiling bar) and passes artistId through so the panel can apply the §F
// paper carve-out.
//
// VERIFY BEFORE COMMIT:
// 1. supabase client import path matches whatever /desk uses
//    (Lovable default "@/integrations/supabase/client").
// 2. comps grain key column is `artist_id` (slug). If the base table still
//    keys on raw `artist`, swap the .eq() accordingly.
// 3. sheet_grade column exists on comps. If not, the query drops it and the
//    ceiling bar auto-falls-back to all-watercolour with a visible flag.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GrainPanels, type GrainRow, type BandRow } from "@/components/grain/grain-panels";

export const Route = createFileRoute("/grain/$artist")({
  component: GrainPage,
});

function GrainPage() {
  const { artist } = Route.useParams();
  const [rows, setRows] = useState<GrainRow[] | null>(null);
  const [bands, setBands] = useState<BandRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data, error }, { data: bandData }] = await Promise.all([
        supabase
          .from("comps")
          .select(
            "artist_id, medium_class, medium_raw, vtype_resolved, hammer_equiv_gbp, longest_cm, status, in_zone, sale_date, sheet_grade, title, authorship, venue, est_mid_gbp, ref, auto_ref, times_seen, repeat_flag, venue_canonical, dup_flag"
          )
          .eq("artist_id", artist)
          .limit(2000),
        supabase
          .from("artist_size_band_medians")
          .select("band_label, band_lo, band_hi, sort_order, n, median_gbp, thin")
          .eq("artist_id", artist)
          .eq("tier_scope", "All_UK")
          .neq("band_label", "ALL")
          .order("sort_order"),
      ]);
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as GrainRow[]);
      setBands((bandData ?? []) as BandRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [artist]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <header className="mb-8">
        <div className="text-xs tracking-widest text-stone-500">GRAIN DIAGNOSTICS</div>
        <h1 className="text-2xl mt-1">{artist.replace(/-/g, " ")}</h1>
        <p className="text-sm text-stone-500 mt-2 max-w-2xl">
          UK sold rows only; Foreign and Print excluded. All numbers are
          autograph only; non-autograph lots appear solely as red crosses on the
          tier strip to catch mis-tags. Ratios below n=8 on Exit_Strong carry
          THIN and must not inform a bid.
        </p>
      </header>

      {error && (
        <div className="text-sm text-red-700 border border-red-200 rounded p-4 mb-6">
          Grain read failed: {error}. If this is a zero-row RLS symptom, check
          the comps table policy matches the permissive desk pattern.
        </div>
      )}

      {rows == null && !error ? (
        <div className="text-sm text-stone-400 font-mono">loading grain\u2026</div>
      ) : rows != null ? (
        <GrainPanels rows={rows} artistId={artist} />
      ) : null}
    </div>
  );
}
