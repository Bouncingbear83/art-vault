import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/art/app-shell";
import { Chip, EmptyState, Stat } from "@/components/art/primitives";
import { gbp } from "@/lib/art360";
import { fetchScoredLots, fetchGrain360, type ScoredLotRow, type Grain360 } from "@/lib/desk-ui";

export const Route = createFileRoute("/_authenticated/desk/")({
  head: () => ({
    meta: [
      { title: "Lot Desk — Art360" },
      { name: "description", content: "Scored buy candidates beside their grain." },
    ],
  }),
  component: LotDeskList,
});

function decisionTone(d: string | null): "harbour" | "ochre" | "muted" {
  return d === "Buy" ? "harbour" : d === "Monitor" ? "ochre" : "muted";
}
const fmtX = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}x`);
const fmtPct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);

function LotDeskList() {
  const [showSkips, setShowSkips] = useState(false);
  const { data: lots, isLoading } = useQuery({
    queryKey: ["scored-lots", showSkips],
    queryFn: () => fetchScoredLots({ includeSkipped: showSkips }),
  });
  const { data: grain } = useQuery({ queryKey: ["grain-360"], queryFn: fetchGrain360 });

  return (
    <AppShell
      eyebrow="Bid discipline"
      title="Lot Desk"
      lede="Scored candidates, each beside the name's grain. Hand a lot to Claude to score it, or score one manually. Buy and Monitor lead; Skips are hidden."
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <label className="label-caps flex items-center gap-2">
          <input type="checkbox" checked={showSkips} onChange={(e) => setShowSkips(e.target.checked)} />
          Show skips
        </label>
        <Link
          to="/desk/score"
          className="label-caps rounded-sm border border-harbour px-4 py-2 text-harbour transition-colors hover:bg-harbour hover:text-background"
        >
          Score a lot manually
        </Link>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading candidates…</p>}
      {!isLoading && (!lots || lots.length === 0) && (
        <EmptyState
          title="No candidates yet"
          hint="Hand a lot to Claude, or score one manually. Scored lots land here beside their grain."
        />
      )}

      <div className="space-y-4">
        {(lots ?? []).map((lot) => (
          <LotCard key={lot.lot_id} lot={lot} grain={grain?.[lot.artist_id]} />
        ))}
      </div>
    </AppShell>
  );
}

function LotCard({ lot, grain }: { lot: ScoredLotRow; grain?: Grain360 }) {
  return (
    <div className="wall-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Chip tone={decisionTone(lot.decision)}>{lot.decision ?? "—"}</Chip>
            {lot.binding_constraint && (
              <span className="label-caps text-muted-foreground">{lot.binding_constraint}</span>
            )}
            {lot.captured_by === "radar" && <Chip tone="muted">radar</Chip>}
          </div>
          <h3 className="mt-2 font-display text-xl text-foreground">{lot.artist_name}</h3>
          <p className="text-sm text-muted-foreground">
            {lot.title}
            {lot.subject ? ` · ${lot.subject}` : ""}
            {lot.palette ? ` · ${lot.palette}` : ""}
            {lot.longest_cm ? ` · ${lot.longest_cm}cm` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {[lot.venue, lot.sale_date].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Link
          to="/grain/$artist"
          params={{ artist: lot.artist_id }}
          className="label-caps text-harbour transition-colors hover:underline"
        >
          Grain →
        </Link>
      </div>

      {/* walk-away ladder */}
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
        <Stat label="Firm" value={gbp(lot.ladder_firm_gbp)} tone="harbour" />
        <Stat label="Stretch" value={gbp(lot.ladder_stretch_gbp)} />
        <Stat label="All-in @ firm" value={gbp(lot.all_in_at_firm_gbp)} />
        <Stat label="Fair value" value={gbp(lot.fair_value_gbp)} tone="ochre" />
      </div>

      {/* grain strip: the name's live analytics beside the lot */}
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
        <Stat label="Med UK oil" value={gbp(grain?.median_uk_hammer_gbp ?? null)} />
        <Stat label="Room (in-zone)" value={fmtX(grain?.in_zone_realisation ?? null)} />
        <Stat label="Sell-thru" value={fmtPct(grain?.sell_through_pct ?? null)} />
        <Stat label="Anchor" value={lot.anchor_tier ? `${lot.anchor_tier} n=${lot.anchor_n ?? 0}` : "—"} />
      </div>

      {lot.flags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          {lot.flags.map((fl) => (
            <Chip key={fl} tone="muted">{fl}</Chip>
          ))}
        </div>
      )}
    </div>
  );
}
