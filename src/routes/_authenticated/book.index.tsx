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

const x = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(2)}x`);
const pctInt = (n: number | null | undefined) =>
  n == null ? "—" : `${Math.round(n)}%`;

/* ---------- gate + structural reads ---------- */

// spread_trusted is only meaningful when BOTH legs are evaluable:
// n_exit_strong >= 8 AND buy_regional_realisation < 1. If the buy-side leg is
// null (the current defect), the spread rests on the n-leg alone: say so.
function spreadState(r: BookRow): { label: string; tone: Tone } {
  if (r.exit_vs_regional_spread == null) return { label: "no data", tone: "off" };
  if (r.buy_regional_realisation == null) return { label: "unverified", tone: "warn" };
  if (r.spread_trusted === true) return { label: "trusted", tone: "ok" };
  return { label: "not trusted", tone: "off" };
}

// level x trend -> one structural badge. Empty until the timeseries feed lands.
function structural(r: BookRow): { label: string; tone: Tone } {
  const lvl = r.level_read;
  const trd = r.trend_read;
  if (!lvl || !trd || lvl === "Unknown" || trd === "Unknown")
    return { label: "—", tone: "none" };
  const key = `${lvl}+${trd}`;
  if (lvl === "Cheap" && trd === "Up") return { label: key, tone: "buy" };
  if (trd === "Down") return { label: key, tone: "avoid" };
  return { label: key, tone: "hold" };
}

type Tone = "ok" | "warn" | "off" | "buy" | "hold" | "avoid" | "none";

const TONE: Record<Tone, string> = {
  ok: "border-harbour text-harbour",
  warn: "border-primary text-primary",
  off: "border-border text-muted-foreground",
  buy: "border-harbour text-harbour",
  hold: "border-primary text-primary",
  avoid: "border-destructive text-destructive",
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
          return b.open_flags - a.open_flags;
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
      lede="Every name on one screen. The spread is shown with its trust state, so the half-wired gate stays visible until the buy-side leg is fed from the Sheet."
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
                  <th className="label-caps py-2">Structural</th>
                  <Th k="flags" label="Flags" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const gate = spreadState(r);
                  const str = structural(r);
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
                      <td className="num py-3 text-foreground">{x(r.exit_vs_regional_spread)}</td>
                      <td className="py-3">
                        <Badge label={gate.label} tone={gate.tone} />
                      </td>
                      <td className="num py-3 text-foreground">{pctInt(r.sell_through_pct)}</td>
                      <td className="num py-3 text-foreground">{x(r.in_zone_realisation)}</td>
                      <td className="py-3">
                        <Badge label={str.label} tone={str.tone} />
                      </td>
                      <td className="num py-3">
                        {r.open_flags > 0 ? (
                          <span className="text-primary">{r.open_flags}</span>
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
            Gate reads the spread trust: <span className="text-primary">unverified</span> means
            buy_regional_realisation is not yet populated, so the spread rests on the n-leg alone.
            Structural fills in once the timeseries feed lands.
          </p>
        </>
      )}
    </AppShell>
  );
}
