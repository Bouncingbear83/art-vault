import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/art/app-shell";
import { Chip, EmptyState } from "@/components/art/primitives";
import { fetchBook, gbp, type BookRow } from "@/lib/art360";

export const Route = createFileRoute("/_authenticated/book/")({
  head: () => ({
    meta: [
      { title: "The Book — Art360" },
      {
        name: "description",
        content:
          "The whole roster on one screen: median UK hammer, the exit/regional spread with its trust state, sell-through, and open flags.",
      },
      { property: "og:title", content: "The Book — Art360" },
      { property: "og:description", content: "Roster-wide comps rollup with the gate shown honestly." },
    ],
  }),
  component: BookScreen,
});

/* ---------- formatting ---------- */

const x = (n: number | null | undefined) => (n == null ? "—" : `${Number(n).toFixed(2)}x`);
const pctInt = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(Number(n))}%`);

/* ---------- gate ---------- */

// The spread only earns trust once there are enough UK auto oil comps behind it.
const MIN_N = 8;

function spreadTrusted(r: BookRow): boolean {
  return r.n_uk_auto_oil != null && Number(r.n_uk_auto_oil) >= MIN_N;
}

function spreadState(r: BookRow): { label: string; tone: Tone } {
  if (r.exit_vs_regional_spread == null) return { label: "no data", tone: "off" };
  return spreadTrusted(r)
    ? { label: "trusted", tone: "ok" }
    : { label: "thin", tone: "warn" };
}

type Tone = "ok" | "warn" | "off" | "none";

const TONE: Record<Tone, string> = {
  ok: "border-harbour text-harbour",
  warn: "border-primary text-primary",
  off: "border-border text-muted-foreground",
  none: "border-border text-muted-foreground",
};

function Badge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={`label-caps inline-flex items-center rounded-sm border px-2 py-0.5 leading-5 ${TONE[tone]}`}
    >
      {label}
    </span>
  );
}

const PLAY_ORDER: Record<string, number> = {
  Arbitrage: 0,
  Quality_hold: 1,
  Pending: 2,
  NA: 3,
};

type SortKey = "play" | "median" | "spread" | "flags";

/* ---------- screen ---------- */

function BookScreen() {
  const { data, isLoading, error } = useQuery({ queryKey: ["book"], queryFn: fetchBook });
  const [sort, setSort] = useState<SortKey>("play");
  const rows = data ?? [];

  const sorted = useMemo(() => {
    const by = [...rows];
    by.sort((a, b) => {
      switch (sort) {
        case "median":
          return (b.median_uk_hammer_gbp ?? -1) - (a.median_uk_hammer_gbp ?? -1);
        case "spread":
          return (b.exit_vs_regional_spread ?? -1) - (a.exit_vs_regional_spread ?? -1);
        case "flags":
          return (b.open_flags ?? 0) - (a.open_flags ?? 0);
        default:
          return (
            (PLAY_ORDER[a.play_type ?? "NA"] ?? 3) - (PLAY_ORDER[b.play_type ?? "NA"] ?? 3) ||
            (b.median_uk_hammer_gbp ?? -1) - (a.median_uk_hammer_gbp ?? -1)
          );
      }
    });
    return by;
  }, [rows, sort]);

  const Th = ({ k, label, className = "" }: { k: SortKey; label: string; className?: string }) => (
    <th
      className={`label-caps cursor-pointer select-none py-2 ${className}`}
      onClick={() => setSort(k)}
    >
      {label}
      {sort === k ? " ↓" : ""}
    </th>
  );

  return (
    <AppShell
      eyebrow="Analysis"
      title="The Book"
      lede="Every name on one screen. The spread is greyed until there are enough UK auto oil comps behind it, so a thin read never reads as a verdict."
    >
      {isLoading && <p className="label-caps">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {!isLoading && !error && rows.length === 0 && (
        <EmptyState
          title="No rollup rows yet"
          hint="Once the nightly export runs, all 19 names appear here."
        />
      )}

      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <Th k="play" label="Artist" className="pl-1" />
                  <th className="label-caps py-2">Play</th>
                  <Th k="median" label="Median UK" />
                  <Th k="spread" label="Exit/Reg" />
                  <th className="label-caps py-2">Gate</th>
                  <th className="label-caps py-2">Sell-thru</th>
                  <th className="label-caps py-2">In-zone</th>
                  <th className="label-caps py-2">Confidence</th>
                  <Th k="flags" label="Flags" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const gate = spreadState(r);
                  const trusted = spreadTrusted(r);
                  const flags = r.open_flags ?? 0;
                  return (
                    <tr key={r.artist_id} className="border-b border-border/60 hover:bg-secondary/40">
                      <td className="py-3 pl-1">
                        <span className="font-medium text-foreground">{r.display_name}</span>
                        <span className="num ml-2 text-xs text-muted-foreground">
                          n={r.n_uk_auto_oil ?? 0}
                        </span>
                      </td>
                      <td className="py-3">{r.play_type && <Chip>{r.play_type}</Chip>}</td>
                      <td className="num py-3 text-foreground">{gbp(r.median_uk_hammer_gbp)}</td>
                      <td
                        className={`num py-3 ${trusted ? "text-foreground" : "text-muted-foreground/60"}`}
                        title={trusted ? undefined : `Fewer than ${MIN_N} UK auto oil comps — untrusted`}
                      >
                        {x(r.exit_vs_regional_spread)}
                      </td>
                      <td className="py-3">
                        <Badge label={gate.label} tone={gate.tone} />
                      </td>
                      <td className="num py-3 text-foreground">{pctInt(r.sell_through_pct)}</td>
                      <td className="num py-3 text-foreground">{x(r.in_zone_realisation)}</td>
                      <td className="py-3">
                        {r.data_confidence ? <Chip>{r.data_confidence}</Chip> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="num py-3">
                        {flags > 0 ? (
                          <span className="text-primary">{flags}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            A greyed spread means fewer than {MIN_N} UK auto oil comps stand behind it. Rows with no
            spread at all stay listed, marked “no data”.
          </p>
        </>
      )}
    </AppShell>
  );
}
