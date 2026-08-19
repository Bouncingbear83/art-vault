import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/art/app-shell";
import { Chip, EmptyState } from "@/components/art/primitives";
import { formatDate } from "@/lib/art360";
import { fetchDealLog, type DealLogRow } from "@/lib/desk-ui";

export const Route = createFileRoute("/_authenticated/desk/log")({
  head: () => ({
    meta: [
      { title: "Deal log — Art360" },
      { name: "description", content: "Every lot scored, buys and passes, newest first." },
    ],
  }),
  component: DealLog,
});

function tone(decision: string | null): "harbour" | "ochre" | "muted" | "default" {
  return decision === "Buy" ? "harbour" : decision === "Monitor" ? "ochre" : decision === "Skip" ? "muted" : "default";
}

function DealLog() {
  const { data, isLoading, error } = useQuery({ queryKey: ["deal-log"], queryFn: fetchDealLog });
  const rows = data ?? [];

  return (
    <AppShell
      eyebrow="Considered and called"
      title="Deal log"
      lede="Every lot scored, buys and passes alike, one entry per lot. Re-scoring a lot overwrites its entry rather than stacking."
    >
      {isLoading && <p className="label-caps">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {!isLoading && rows.length === 0 && (
        <EmptyState title="No lots scored yet" hint="Scoring a lot on the Lot Desk records the verdict here." />
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((r) => <LogRow key={r.note_id} row={r} />)}
        </div>
      )}
    </AppShell>
  );
}

function LogRow({ row }: { row: DealLogRow }) {
  return (
    <div className="wall-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Chip tone={tone(row.decision)}>{row.decision ?? "—"}</Chip>
          <span className="font-display text-base text-foreground">{row.artist_name ?? "—"}</span>
        </div>
        <span className="num text-xs text-muted-foreground">{formatDate(row.valid_from)}</span>
      </div>
      <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">{row.body}</pre>
    </div>
  );
}
