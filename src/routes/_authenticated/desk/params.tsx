import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/art/app-shell";
import { Chip, EmptyState, Stat } from "@/components/art/primitives";
import { gbp } from "@/lib/art360";
import { fetchBudget, fetchDeskConfigAll, fetchDeskParams } from "@/lib/desk-ui";

export const Route = createFileRoute("/_authenticated/desk/params")({
  head: () => ({
    meta: [
      { title: "Desk params — Art360" },
      { name: "description", content: "The in-force desk parameters and per-name collector config." },
    ],
  }),
  component: DeskParams,
});

const pctv = (n: number) => `${Math.round(n * 100)}%`;

function DeskParams() {
  const year = new Date().getFullYear();
  const { data: params } = useQuery({ queryKey: ["desk-params"], queryFn: fetchDeskParams });
  const { data: budget } = useQuery({ queryKey: ["desk-budget", year], queryFn: () => fetchBudget(year) });
  const { data: config, isLoading } = useQuery({ queryKey: ["desk-config"], queryFn: fetchDeskConfigAll });

  return (
    <AppShell
      eyebrow="Desk configuration"
      title="Params & per-name config"
      lede="The in-force parameters and per-name overrides that drive scoring. Read-only here; changes are made in SQL until the numbers settle."
    >
      {params && (
        <div className="wall-card mb-6 grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <Stat label="Discount firm" value={pctv(params.collector_discount_firm)} tone="ochre" />
          <Stat label="Discount stretch" value={pctv(params.collector_discount_stretch)} />
          <Stat label="Stale haircut" value={pctv(params.stale_haircut)} />
          <Stat label="Remote haircut" value={pctv(params.remote_haircut)} />
          <Stat label="BP default" value={pctv(params.bp_pct_default)} />
          <Stat label="VAT on premium" value={pctv(params.vat_premium)} />
          <Stat label="ARR rate" value={pctv(params.arr_rate)} />
          <Stat label="n-gate" value={String(params.n_gate)} />
          <Stat label="Homogeneity" value={pctv(params.homogeneity_threshold)} />
          <Stat label="Recency cutoff" value={String(params.recency_cutoff)} />
        </div>
      )}

      {budget && (
        <div className="wall-card mb-8 grid grid-cols-3 gap-4 p-5">
          <Stat label={`Envelope ${budget.period_year}`} value={gbp(budget.envelope_gbp)} />
          <Stat label="Committed" value={gbp(budget.committed_gbp)} tone="ochre" />
          <Stat label="Remaining" value={gbp(budget.envelope_gbp - budget.committed_gbp)} tone="harbour" />
        </div>
      )}

      <p className="label-caps mb-3">Per-name config</p>
      {isLoading && <p className="label-caps">Loading…</p>}
      {config && config.length === 0 && <EmptyState title="No config rows" hint="Run the Phase 0 seed." />}
      {config && config.length > 0 && (
        <div className="wall-card overflow-hidden">
          <div className="hidden grid-cols-[1fr_9rem_5rem_5rem_6rem_5rem_7rem] gap-4 border-b border-border px-5 py-3 lg:grid">
            {["Name", "Class", "d firm", "d strch", "Floor", "Min cm", "Paper / ARR"].map((h) => <span key={h} className="label-caps">{h}</span>)}
          </div>
          <ul>
            {config.map((c) => (
              <li key={c.artist_id} className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-border px-5 py-3 last:border-b-0 hover:bg-secondary/40 lg:grid-cols-[1fr_9rem_5rem_5rem_6rem_5rem_7rem] lg:items-baseline">
                <span className="font-display text-sm text-foreground">{c.artist_name}</span>
                <span className="label-caps">{c.discount_class}</span>
                <span className="num text-xs text-muted-foreground">{c.discount_override_firm == null ? "—" : pctv(c.discount_override_firm)}</span>
                <span className="num text-xs text-muted-foreground">{c.discount_override_stretch == null ? "—" : pctv(c.discount_override_stretch)}</span>
                <span className="num text-xs text-muted-foreground">{gbp(c.commission_floor_gbp)}</span>
                <span className="num text-xs text-muted-foreground">{c.min_longest_cm ?? "—"}</span>
                <span className="flex flex-wrap gap-1">
                  {c.paper_primary && <Chip tone="harbour">paper {gbp(c.paper_ceiling_gbp)}</Chip>}
                  {c.arr_active_until && <Chip tone="ochre">ARR {c.arr_active_until}</Chip>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppShell>
  );
}
