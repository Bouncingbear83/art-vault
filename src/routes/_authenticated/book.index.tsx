import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/art/app-shell";
import { Chip, EmptyState, PaletteSwatch } from "@/components/art/primitives";
import { fetchBook, gbp, pct, type BookRow } from "@/lib/art360";
import { BookMedian } from "@/components/art/book-median";
import { GrainLink } from "@/components/art/grain-link";

export const Route = createFileRoute("/_authenticated/book/")({
  head: () => ({
    meta: [
      { title: "The Book — Art360" },
      {
        name: "description",
        content:
          "The whole roster on one screen, read through the three grain tests: a single verdict per name, the room number, and the size-matched spread. The raw cross-tier ratio is greyed as uncontrolled.",
      },
      { property: "og:title", content: "The Book — Art360" },
      {
        property: "og:description",
        content: "Roster-wide comps rollup with the §H discipline applied at scale.",
      },
    ],
  }),
  component: BookScreen,
});

/* ---------- formatting ---------- */

// Ratios (realisation, spreads) render as multiples.
const xr = (n: number | null | undefined) => (n == null ? "—" : `${Number(n).toFixed(2)}x`);
const pctInt = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(Number(n))}%`);

/* ---------- the honest verdict (§H tests 1-3) ---------- */
//
// The chip is the ROLLUP'S verdict, not one the app recomputes. comps_rollup
// already runs the three tests and emits buy_edge_flag (Real / Thin / None) plus
// thin_exit_flag (Exit_Strong depth below the n-gate). The Book only maps those
// two fields to a label; it never re-derives edge from a raw ratio. That keeps
// the gate logic in the rollup and the app rendering only.
//
//   thin_exit_flag        -> WATCH      (test 1 fails: exit anchor untrusted)
//   buy_edge_flag Real     -> BUY        (n-gate + regional < 1.0 + matched spread survive)
//   buy_edge_flag Thin     -> SELECTIVE  (edge not size-confirmed; chase mispriced lots only)
//   buy_edge_flag None     -> —          (efficiently priced; no open-auction room)
//   nothing populated      -> —          (no rollup row yet)

type Verdict = "BUY" | "SELECTIVE" | "WATCH" | "—";

function verdictOf(r: BookRow): { label: Verdict; why: string } {
  const flag = r.buy_edge_flag ?? null;
  const noData = flag == null && r.arb_edge_raw == null && r.exit_vs_regional_spread == null;
  if (noData) return { label: "—", why: "No rollup row for this name yet." };
  if (r.thin_exit_flag === true)
    return {
      label: "WATCH",
      why: "Thin exit: Exit_Strong n below the gate, so the anchor is noise.",
    };
  switch (flag) {
    case "Real":
      return {
        label: "BUY",
        why: "All three tests clear: n-gate, regional realisation below 1.0, size-matched spread survives.",
      };
    case "Thin":
      return {
        label: "SELECTIVE",
        why: "Edge present but not size-confirmed; chase individually mispriced lots, not a blanket buy.",
      };
    case "None":
      return { label: "—", why: "No open-auction edge: the market prices this name efficiently." };
    default:
      return { label: "—", why: "No rollup verdict." };
  }
}

const VERDICT_TONE: Record<Verdict, string> = {
  BUY: "border-harbour bg-harbour/12 text-harbour font-semibold",
  SELECTIVE: "border-primary text-primary",
  WATCH: "border-primary/50 text-primary/80 border-dashed",
  "—": "border-border text-muted-foreground",
};

const VERDICT_ORDER: Record<Verdict, number> = { BUY: 0, SELECTIVE: 1, WATCH: 2, "—": 3 };

function VerdictChip({ r }: { r: BookRow }) {
  const v = verdictOf(r);
  return (
    <span
      title={v.why}
      className={`label-caps inline-flex items-center rounded-sm border px-2 py-0.5 leading-5 ${VERDICT_TONE[v.label]}`}
    >
      {v.label}
    </span>
  );
}

/* ---------- room (§H test 2) ---------- */
// in_zone_realisation is the prominent "is there room" number. Below 1.0 means
// the in-zone work clears under estimate: room. At or above 1.0 the market
// competes it up: no room. buy_regional_realisation (tier-independent) sits in
// the tooltip as the strict test-2 metric behind the BUY gate.

function RoomCell({ r }: { r: BookRow }) {
  const room = r.in_zone_realisation;
  const hasRoom = room != null && Number(room) < 1.0;
  const tone = room == null ? "text-muted-foreground" : hasRoom ? "text-harbour" : "text-primary";
  const reg = r.buy_regional_realisation;
  const title =
    reg == null
      ? "In-zone realisation. Regional (tier-independent) not available."
      : `In-zone realisation. Regional tier-independent: ${xr(reg)} ${Number(reg) < 1 ? "(room)" : "(no room)"}.`;
  return (
    <span className={`num ${tone}`} title={title}>
      {xr(room)}
    </span>
  );
}

/* ---------- spread (§H test 3) ---------- */
// The size-matched spread is the honest one. Where matching lacked enough n it is
// null: show "size check: n/a", not blank. The raw uncontrolled ratio is shown
// only greyed and small, labelled, so it can never masquerade as the verdict.

function SpreadCell({ r }: { r: BookRow }) {
  const matched = r.matched_spread;
  const raw = r.arb_edge_raw ?? r.exit_vs_regional_spread;
  return (
    <span
      className="inline-flex flex-col leading-tight"
      title={`Uncontrolled cross-tier ratio: ${xr(raw)}. Inflated by non-autograph junk, medium-mix, size-mix and fat tails; not a verdict.`}
    >
      {matched != null ? (
        <span className="num text-foreground">
          {xr(matched)}
          <span className="ml-1 text-xs text-muted-foreground">(n={r.matched_n ?? 0})</span>
        </span>
      ) : (
        <span className="label-caps text-muted-foreground">size check: n/a</span>
      )}
      <span className="label-caps text-[10px] text-muted-foreground/60">
        raw {xr(raw)} uncontrolled
      </span>
    </span>
  );
}

/* ---------- card view (Artist 360, absorbed) ---------- */
// The old Artist 360 wall-label, fed from the SAME rollup row (BookRow is a
// superset of Artist360), now carrying the rollup verdict and a Notes drill.
// No separate fetch, no second surface to keep in sync.

function BookCard({ r }: { r: BookRow }) {
  const thin = (r.n_uk_auto_oil ?? 0) < 8;
  return (
    <div className="wall-card flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl leading-tight text-foreground">{r.display_name}</h2>
          <p className="num mt-1 text-xs text-muted-foreground">{r.dates ?? "—"}</p>
        </div>
        {(r.open_flags ?? 0) > 0 && (
          <span className="num inline-flex shrink-0 items-center gap-1.5 text-xs text-primary">
            <span className="inline-block h-2 w-2 rounded-full bg-primary" />
            {r.open_flags}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {r.play_type && <Chip>{r.play_type}</Chip>}
        <PaletteSwatch palette={r.palette_pref} />
        <VerdictChip r={r} />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4">
        <div>
          <p className="label-caps">Med UK</p>
          <p className="num mt-1 text-sm">{gbp(r.median_uk_hammer_gbp)}</p>
        </div>
        <div>
          <p className="label-caps">Sell-thru</p>
          <p className="num mt-1 text-sm text-harbour">{pct(r.sell_through_pct)}</p>
        </div>
        <div>
          <p className="label-caps">n oils</p>
          <p className={`num mt-1 text-sm ${thin ? "text-primary" : ""}`}>{r.n_uk_auto_oil ?? "—"}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 border-t border-border pt-3">
        <GrainLink
          artistId={r.artist_id ?? ""}
          label="Grain →"
          className="label-caps text-muted-foreground hover:text-foreground"
        />
        <Link
          to="/artists/$artistId"
          params={{ artistId: r.artist_id ?? "" }}
          className="label-caps text-harbour hover:underline"
        >
          Notes →
        </Link>
      </div>
    </div>
  );
}

/* ---------- sorting ---------- */

const PLAY_ORDER: Record<string, number> = { Arbitrage: 0, Quality_hold: 1, Pending: 2, NA: 3 };

type SortKey = "play" | "verdict" | "room" | "spread" | "median" | "flags";

// nulls always sort last regardless of direction
const nz = (n: number | null | undefined, dir: 1 | -1) =>
  n == null ? (dir === 1 ? Infinity : -Infinity) : Number(n);

/* ---------- screen ---------- */

function BookScreen() {
  const { data, isLoading, error } = useQuery({ queryKey: ["book"], queryFn: fetchBook });
  const [sort, setSort] = useState<SortKey>("play");
  const [view, setView] = useState<"table" | "cards">("table");
  const rows = data ?? [];

  const sorted = useMemo(() => {
    const by = [...rows];
    by.sort((a, b) => {
      switch (sort) {
        case "verdict":
          return (
            VERDICT_ORDER[verdictOf(a).label] - VERDICT_ORDER[verdictOf(b).label] ||
            nz(b.median_uk_hammer_gbp, -1) - nz(a.median_uk_hammer_gbp, -1)
          );
        case "room": // lower realisation = more room, ascending; nulls last
          return nz(a.in_zone_realisation, 1) - nz(b.in_zone_realisation, 1);
        case "spread": // bigger honest spread first; nulls last
          return nz(b.matched_spread, -1) - nz(a.matched_spread, -1);
        case "median":
          return nz(b.median_uk_hammer_gbp, -1) - nz(a.median_uk_hammer_gbp, -1);
        case "flags":
          return (b.open_flags ?? 0) - (a.open_flags ?? 0);
        default:
          return (
            (PLAY_ORDER[a.play_type ?? "NA"] ?? 3) - (PLAY_ORDER[b.play_type ?? "NA"] ?? 3) ||
            nz(b.median_uk_hammer_gbp, -1) - nz(a.median_uk_hammer_gbp, -1)
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
      lede="Every name on one screen, read through the same three tests as the grain page: n-gate, room, and a size-matched spread. No name reads as a buy off an uncontrolled ratio."
    >
      {isLoading && <p className="label-caps">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {!isLoading && !error && rows.length === 0 && (
        <EmptyState
          title="No rollup rows yet"
          hint="Once the nightly export runs, all 30 names appear here."
        />
      )}

      {rows.length > 0 && (
        <>
          <div className="mb-4 flex justify-end gap-1">
            {(["table", "cards"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`label-caps rounded-sm border px-3 py-1 transition-colors ${
                  view === v
                    ? "border-harbour text-harbour"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {view === "cards" ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map((r) => (
                <BookCard key={r.artist_id} r={r} />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <Th k="play" label="Artist" className="pl-1" />
                    <th className="label-caps py-2">Play</th>
                    <Th k="verdict" label="Verdict" />
                    <Th k="room" label="Room (in-zone)" />
                    <Th k="spread" label="Spread (matched)" />
                    <Th k="median" label="Median UK oil" />
                    <th className="label-caps py-2">Sell-thru</th>
                    <th className="label-caps py-2">Conf.</th>
                    <Th k="flags" label="Flags" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => {
                    const flags = r.open_flags ?? 0;
                    return (
                      <tr
                        key={r.artist_id}
                        className="border-b border-border/60 align-top hover:bg-secondary/40"
                      >
                        <td className="py-3 pl-1">
                          <span className="font-medium text-foreground">{r.display_name}</span>
                          {r.dates && (
                            <span className="ml-2 text-xs text-muted-foreground">{r.dates}</span>
                          )}
                          <div className="num mt-0.5 text-[11px] text-muted-foreground">
                            oil n={r.n_uk_auto_oil ?? 0} · exit={r.n_exit_strong ?? 0} · reg=
                            {r.n_buy_regional ?? 0}
                          </div>
                          <div className="mt-0.5 flex gap-3">
                            <GrainLink
                              artistId={r.artist_id ?? ""}
                              label="Grain"
                              className="label-caps text-muted-foreground hover:text-foreground"
                            />
                            <Link
                              to="/artists/$artistId"
                              params={{ artistId: r.artist_id ?? "" }}
                              className="label-caps text-muted-foreground hover:text-foreground"
                            >
                              Notes
                            </Link>
                          </div>
                        </td>
                        <td className="py-3">{r.play_type && <Chip>{r.play_type}</Chip>}</td>
                        <td className="py-3">
                          <VerdictChip r={r} />
                        </td>
                        <td className="num py-3">
                          <RoomCell r={r} />
                        </td>
                        <td className="py-3">
                          <SpreadCell r={r} />
                        </td>
                        <td className="num py-3 text-foreground">
                          <BookMedian
                            artistId={r.artist_id ?? ""}
                            medianGbp={r.median_uk_hammer_gbp}
                          />
                        </td>
                        <td className="num py-3 text-foreground">{pctInt(r.sell_through_pct)}</td>
                        <td className="py-3">
                          {r.data_confidence ? (
                            <Chip tone="muted">{r.data_confidence}</Chip>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
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
          )}

          <div className="mt-4 space-y-1 text-xs text-muted-foreground">
            <p>
              Basis: all figures autograph-only, UK, oil. Median is the autograph-oil UK
              hammer-equivalent.
            </p>
            <p>
              Verdict applies the three §H tests off the rollup's own flags: exit-strong n-gate
              (test 1), regional realisation below 1.0 (test 2), and a size-matched tier spread
              (test 3). BUY needs all three; SELECTIVE is edge that is not size-confirmed; WATCH is
              a thin exit; a dash is no edge or no data.
            </p>
            <p>
              The spread shown is size-matched. Where matching lacked enough n it reads "size check:
              n/a". The raw cross-tier ratio is greyed and labelled "uncontrolled": it is inflated
              by non-autograph junk, medium-mix, size-mix and fat tails, and is never the verdict.
            </p>
          </div>
        </>
      )}
    </AppShell>
  );
}
