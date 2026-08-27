import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/art/app-shell";
import { Chip, EmptyState, Stat } from "@/components/art/primitives";
import { formatDate, gbp } from "@/lib/art360";
import { fetchDealLog, recordLotResult, summariseDealLog, type DealLogRow } from "@/lib/desk-ui";

export const Route = createFileRoute("/_authenticated/desk/log")({
  head: () => ({
    meta: [
      { title: "Deal log — Art360" },
      { name: "description", content: "Every lot called, against what it actually made." },
    ],
  }),
  component: DealLog,
});

function decisionTone(d: string | null): "harbour" | "ochre" | "muted" | "default" {
  return d === "Buy" ? "harbour" : d === "Monitor" ? "ochre" : d === "Skip" ? "muted" : "default";
}

/**
 * vs-firm cell. One sign convention across every row (see fetchDealLog):
 * positive = cleared below the walk-away. On a pass that is opportunity cost;
 * on a buy it is headroom. Negative = went above the walk-away, pass was right.
 */
function VsFirm({ row }: { row: DealLogRow }) {
  if (row.result_hammer_gbp == null) {
    return <span className="text-xs text-muted-foreground">awaiting result</span>;
  }
  if (row.missed_by_gbp == null) {
    return <span className="text-xs text-muted-foreground">no firm bid</span>;
  }
  const v = row.missed_by_gbp;
  const tone = row.status === "won"
    ? "text-foreground"
    : v > 0
      ? "text-destructive"   // cleared under the walk-away and we let it go
      : "text-muted-foreground";
  return <span className={`num text-sm ${tone}`}>{v < 0 ? "−" : "+"}{gbp(Math.abs(v))}</span>;
}

/**
 * Result capture. Without this the calibration figures are permanently zero:
 * missed_by needs the realised hammer of lots we did NOT buy, and nothing else
 * in the app writes it. Only offered on a lot whose sale has passed, is not
 * already bought, and has no result in; everything else renders read-only.
 */
function CaptureResult({ row }: { row: DealLogRow }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const save = useMutation({
    mutationFn: (hammer: number | null) =>
      recordLotResult({ sale_key: row.sale_key, result_hammer_gbp: hammer }),
    onSuccess: () => { setOpen(false); void qc.invalidateQueries({ queryKey: ["deal-log"] }); },
  });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="label-caps text-harbour hover:underline">
        record result
      </button>
    );
  }
  const n = Number(value.replace(/[^0-9.]/g, ""));
  const valid = value.trim() !== "" && Number.isFinite(n) && n > 0;
  return (
    <div className="flex flex-col items-end gap-2">
      <input
        autoFocus
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="hammer £"
        aria-label="Realised hammer in GBP"
        className="num w-28 rounded-sm border border-border bg-transparent px-2 py-1 text-right text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          type="button" disabled={!valid || save.isPending}
          onClick={() => save.mutate(Math.round(n))}
          className="label-caps text-harbour disabled:opacity-40 hover:underline"
        >
          save
        </button>
        <button
          type="button" disabled={save.isPending}
          onClick={() => save.mutate(null)}
          title="Bought in or withdrawn: recorded as no result, excluded from calibration."
          className="label-caps text-muted-foreground hover:underline"
        >
          unsold
        </button>
        <button type="button" onClick={() => { setOpen(false); setValue(""); }} className="label-caps text-muted-foreground hover:underline">
          cancel
        </button>
      </div>
      {save.error && <span className="text-xs text-destructive">{(save.error as Error).message}</span>}
    </div>
  );
}

const salePassed = (d: string | null): boolean =>
  !!d && d < new Date().toISOString().slice(0, 10);

function DealLog() {
  const { data, isLoading, error } = useQuery({ queryKey: ["deal-log"], queryFn: fetchDealLog });
  const rows = data ?? [];
  const s = summariseDealLog(rows);

  return (
    <AppShell
      eyebrow="Considered and called"
      title="Deal log"
      lede="Every lot called, buys and passes alike, against what it actually made. The desk is the forward surface; this is the backward one. One entry per lot: re-scoring overwrites rather than stacking."
    >
      {isLoading && <p className="label-caps">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {!isLoading && rows.length === 0 && (
        <EmptyState title="No lots called yet" hint="Scoring a lot on the Lot Desk records it here." />
      )}

      {rows.length > 0 && (
        <>
          {/* calibration strip: the question the log exists to answer */}
          <div className="mb-8 grid grid-cols-2 gap-4 border-y border-border py-5 sm:grid-cols-4">
            <Stat label="Lots called" value={String(s.called)} />
            <Stat label="Bought" value={String(s.bought)} tone="harbour" />
            <Stat label="Passes resolved" value={`${s.correctPasses}/${s.passesWithResult} above walk-away`} />
            <Stat
              label="Opportunity cost"
              value={s.passesWithResult === 0 ? "—" : gbp(s.opportunityCostGbp)}
              tone="ochre"
            />
          </div>
          {s.awaitingResult > 0 && (
            <p className="mb-6 text-xs text-muted-foreground">
              {s.awaitingResult} past-sale {s.awaitingResult === 1 ? "lot has" : "lots have"} no result captured
              yet, so {s.awaitingResult === 1 ? "it is" : "they are"} excluded from the figures above rather
              than assumed. Record them below to close the loop.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="label-caps py-2 pr-4 font-normal text-muted-foreground">Sale</th>
                  <th className="label-caps py-2 pr-4 font-normal text-muted-foreground">Lot</th>
                  <th className="label-caps py-2 pr-4 font-normal text-muted-foreground">Called</th>
                  <th className="label-caps py-2 pr-4 text-right font-normal text-muted-foreground">Fair</th>
                  <th className="label-caps py-2 pr-4 text-right font-normal text-muted-foreground">Firm</th>
                  <th className="label-caps py-2 pr-4 text-right font-normal text-muted-foreground">Made</th>
                  <th className="label-caps py-2 text-right font-normal text-muted-foreground">vs firm</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.lot_id} className="border-b border-border/60 align-top">
                    <td className="whitespace-nowrap py-3 pr-4">
                      <span className="num text-xs text-muted-foreground">{formatDate(r.sale_date)}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <Link
                        to="/grain/$artist"
                        params={{ artist: r.artist_id }}
                        className="font-display text-base text-foreground transition-colors hover:text-harbour"
                      >
                        {r.artist_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {[r.title, r.venue].filter(Boolean).join(" · ")}
                      </p>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip tone={decisionTone(r.decision)}>{r.decision ?? "—"}</Chip>
                        {r.status === "won" && <Chip tone="harbour">bought</Chip>}
                      </div>
                      {r.binding_constraint && (
                        <p className="mt-1 text-xs text-muted-foreground">{r.binding_constraint}</p>
                      )}
                    </td>
                    <td className="num py-3 pr-4 text-right text-muted-foreground">{gbp(r.fair_value_gbp)}</td>
                    <td className="num py-3 pr-4 text-right text-foreground">{gbp(r.ladder_firm_gbp)}</td>
                    <td className="num py-3 pr-4 text-right text-foreground">{gbp(r.result_hammer_gbp)}</td>
                    <td className="py-3 text-right">
                      {r.result_hammer_gbp == null && r.status !== "won" && salePassed(r.sale_date)
                        ? <CaptureResult row={r} />
                        : <VsFirm row={r} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppShell>
  );
}
