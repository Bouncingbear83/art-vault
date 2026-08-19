import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/art/app-shell";
import { EmptyState, Stat } from "@/components/art/primitives";
import { formatDate, gbp } from "@/lib/art360";
import { fetchBudget, fetchPositions } from "@/lib/desk-ui";

export const Route = createFileRoute("/_authenticated/positions/")({
  head: () => ({
    meta: [
      { title: "Positions — Art360" },
      { name: "description", content: "The collection ledger: what is owned, at what all-in cost." },
    ],
  }),
  component: Positions,
});

function Positions() {
  const year = new Date().getFullYear();
  const { data: positions, isLoading, error } = useQuery({ queryKey: ["positions"], queryFn: fetchPositions });
  const { data: budget } = useQuery({ queryKey: ["desk-budget", year], queryFn: () => fetchBudget(year) });

  const rows = positions ?? [];
  const committed = budget?.committed_gbp ?? rows.reduce((s, r) => s + (r.all_in_gbp ?? 0), 0);
  const envelope = budget?.envelope_gbp ?? 0;

  return (
    <AppShell
      eyebrow="Collection ledger"
      title="Positions"
      lede="A record of what is owned and its all-in cost. Not a returns dashboard: this is the collection, not a P&L."
    >
      <div className="wall-card mb-8 grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <Stat label={`Envelope ${year}`} value={gbp(envelope)} />
        <Stat label="Committed" value={gbp(committed)} tone="ochre" />
        <Stat label="Remaining" value={gbp(envelope - committed)} tone="harbour" />
        <Stat label="Positions" value={String(rows.length)} />
      </div>

      {isLoading && <p className="label-caps">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {!isLoading && rows.length === 0 && (
        <EmptyState title="No positions yet" hint="Won lots recorded from the Lot Desk appear here." />
      )}

      {rows.length > 0 && (
        <div className="wall-card overflow-hidden">
          <div className="hidden grid-cols-[1fr_10rem_7rem_7rem_7rem] gap-4 border-b border-border px-5 py-3 md:grid">
            {["Work", "House", "Hammer", "All-in", "Bought"].map((h) => <span key={h} className="label-caps">{h}</span>)}
          </div>
          <ul>
            {rows.map((r) => (
              <li key={r.position_id} className="grid grid-cols-1 gap-x-4 gap-y-1 border-b border-border px-5 py-4 last:border-b-0 hover:bg-secondary/40 md:grid-cols-[1fr_10rem_7rem_7rem_7rem] md:items-baseline">
                <div className="min-w-0">
                  <p className="font-display text-base leading-snug text-foreground">{r.artist_name}</p>
                  <p className="text-sm text-muted-foreground">{r.title}</p>
                  {r.rationale && <p className="mt-1 text-xs text-muted-foreground">{r.rationale}</p>}
                </div>
                <span className="num text-xs text-muted-foreground">{r.house ?? "—"}</span>
                <span className="num text-sm">{gbp(r.hammer_gbp)}</span>
                <span className="num text-sm text-foreground">{gbp(r.all_in_gbp)}</span>
                <span className="num text-xs text-muted-foreground">{formatDate(r.buy_date)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppShell>
  );
}
