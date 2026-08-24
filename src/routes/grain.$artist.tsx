// /grain/$artist : per-name grain distortion diagnostics.
// Render-only. Reads the comps grain directly (RLS-permissive per the desk
// table pattern); Foreign and Print rows are dropped inside computeGrainStats.
//
// VERIFY BEFORE COMMIT (two assumptions, both one-line fixes if wrong):
// 1. supabase client import path: Lovable default is
//    "@/integrations/supabase/client"; match whatever /desk uses.
// 2. comps grain artist key column is `artist_id` (slug, per the nightly
//    rollup slugify + {Forbes, Brangwyn} override). If the grain still keys
//    on raw `artist` name, swap the .eq() accordingly.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GrainPanels, type GrainRow } from "@/components/grain/grain-panels";

export const Route = createFileRoute("/grain/$artist")({
  component: GrainPage,
});

function GrainPage() {
  const { artist } = Route.useParams();
  const [rows, setRows] = useState<GrainRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("comps")
        .select(
          "artist_id, medium_class, vtype_resolved, hammer_equiv_gbp, longest_cm, status, in_zone, sale_date, title"
        )
        .eq("artist_id", artist)
        .limit(2000);
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as GrainRow[]);
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
          UK sold rows only; Foreign and Print excluded. Ratios below n=8 on
          Exit_Strong carry THIN and must not inform a bid.
        </p>
      </header>

      {error && (
        <div className="text-sm text-red-700 border border-red-200 rounded p-4 mb-6">
          Grain read failed: {error}. If this is a zero-row RLS symptom, check
          the comps table policy matches the permissive desk pattern.
        </div>
      )}

      {rows == null && !error ? (
        <div className="text-sm text-stone-400 font-mono">loading grain…</div>
      ) : rows != null ? (
        <GrainPanels rows={rows} />
      ) : null}
    </div>
  );
}
