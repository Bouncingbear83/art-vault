import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { AppShell } from "@/components/art/app-shell";
import { ColInfo } from "@/components/art/col-info";
import {
  DUE_FLAGS,
  PLAY_ORDER,
  WARN_FLAGS,
  fetchBookScreen,
  toViewRow,
  type BookViewRow,
  type GateState,
  type Rag,
} from "@/lib/book-screen";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/book/")({
  head: () => ({
    meta: [
      { title: "The Book — roster triage — Art360" },
      {
        name: "description",
        content:
          "One row per name: is the name priceable against its own history, is it liquid, does its zone pay, is the verdict still fresh. Deep diagnostics stay in Grain.",
      },
      { property: "og:title", content: "The Book — roster triage — Art360" },
      {
        property: "og:description",
        content:
          "Sortable, filterable roster surface over book_screen, read in v7.2 collector grammar.",
      },
    ],
  }),
  component: BookScreen,
});

/* ------------------------------ column copy ------------------------------ */

const TIPS = {
  name: "Identity from the artists table. Grain opens the per-name distortion panel (tier plots, size scatter, medium ledger). Notes opens the vault verdict, open flags and supersede history for this name.",
  rag: "Computed roll-up, not hand-set, and never a buy gate. GREEN: priceable (level known) + liquid (sell-through ≥ 60%) + verdict fresh + config seeded. RED: no derivable home-market lane. AMBER: everything else — thin turnover, unpriceable level, stale verdict, ARR live, or config unseeded.",
  level:
    "level_read from comps_rollup: where the recent UK autograph-oil hammer sits against the name's OWN price history, not against other names. Cheap / Fair / Rich / Unknown. This is a level read, not a timing read: a Cheap name may stay cheap. Trend lines are deliberately not fitted (timing-as-signal falsified). EXCLUDES paper, non-autograph, print, foreign.",
  zone: "zone_fitness from artist_zone_fitness: does this name's in-zone subject lane actually pay, tested per name against its own out-of-zone work. Pays = both legs. Liquidity_only = sells more often in zone, no price premium. Price_only = dearer in zone but no liquidity gain (usually size/quality selection, so treat as unpaid). Neutral = no measurable difference. Inverted = in-zone UNDERPERFORMS this name's out-of-zone work (Mann's coastal vs his portraits). Untestable = fewer than 5 sold either side. The badge is confidence: robust or thin. Tooltip carries the sell-through premium in points, which is the only leg that survived the book-wide test.",
  gov: "Autograph-oil hammer-equivalent median, UK sold (inclusive ÷ 1.29). For paper-sleeve names it is struck through: the oil median is not their thesis; the ceiling lives in Grain. EXCLUDES non-autograph, print, foreign. No global sort: bases are not comparable across lanes, so sorting is scoped inside each lane group.",
  verdict:
    "Collector headline derived from the rollup: level against own history, liquidity, zone fitness, ceiling. The governing vault Verdict note, its guards and kill-criteria sit one tap away under Notes.",
  flags:
    "Open Flag notes (action_status = Open) plus standing tags: ceiling-breach (exits above ~£10k), zone-inverted, thin-data (Exit_Strong n<8), unseeded (no desk config row), ARR live, data-fix, stale.",
  fresh:
    "Days to the verdict's valid_to (valid_from + 90d, or next rollup re-sync, whichever is sooner). Past valid_to = stale (sienna). Unseeded = no config row yet. Currently a comps-updated proxy; production joins the vault valid_to.",
  /* legacy diagnostic drawer */
  gate: "RETIRED APPARATUS, shown for continuity only. The old three-gate 'is the edge real?' test. Left dot: Exit_Strong n ≥ 8. Middle: Buy_Regional median realisation < 1.0. Right: leg 3, size-band control — NEVER BUILT. matched_spread is a null placeholder in comps_rollup, so the right dot reads n/a, never fail, and no row here can assert a real edge. Every published 'size-mix confound' ruling is a manual vault judgement, not a machine result.",
  exitN:
    "Count of Exit_Strong sold lots (UK autograph oil, hammer-equiv present). Exit_Strong rooms: Bonhams New Bond St, L&T Edinburgh/London, Woolley & Wallis, Christie's London, Sotheby's London/Edinburgh. Below 8 the exit anchor is noise (shown sienna). Still useful as a depth read; no longer a gate.",
  room: "Buy_Regional median realisation = hammer-equiv ÷ estimate-mid, in-zone UK oil sold, estimate-mid ≥ £200. Below 1.0× = the buy tier clears below estimate. Retained as a liquidity/pricing texture read only: on its own it is not evidence of a capturable spread.",
} as const;

type SortKey = "level" | "zone" | "gov" | "fresh";

const LEVEL_RANK: Record<string, number> = { Cheap: 0, Fair: 1, Rich: 2, Unknown: 3 };
const ZONE_RANK: Record<string, number> = {
  Pays: 0,
  Liquidity_only: 1,
  Price_only: 2,
  Neutral: 3,
  Inverted: 4,
  Untestable: 5,
};

/* -------------------------------- cells --------------------------------- */

function RagDot({ rag }: { rag: Rag }) {
  return (
    <span
      className={cn(
        "mt-[3px] inline-block h-[11px] w-[11px] rounded-full",
        rag === "g" ? "bg-teal" : rag === "a" ? "bg-ochre" : "bg-sienna",
      )}
    />
  );
}

function LevelCell({ level, cagr }: { level: string | null; cagr: number | null }) {
  const v = level ?? "Unknown";
  const tone =
    v === "Cheap"
      ? "text-teal"
      : v === "Rich"
        ? "text-sienna"
        : v === "Fair"
          ? "text-foreground"
          : "text-faint";
  return (
    <div>
      <span className={cn("num text-[12px]", tone)}>{v}</span>
      <span className="block text-[9.5px] normal-case tracking-normal text-muted-foreground">
        {cagr == null ? "vs own history" : `${(Number(cagr) * 100).toFixed(1)}%/yr`}
      </span>
    </div>
  );
}

const ZONE_LABEL: Record<string, string> = {
  Pays: "Pays",
  Liquidity_only: "Liquidity",
  Price_only: "Price only",
  Neutral: "Neutral",
  Inverted: "Inverted",
  Untestable: "Untestable",
};

function ZoneChip({
  fitness,
  conf,
  pp,
}: {
  fitness: string | null;
  conf: string | null;
  pp: number | null;
}) {
  if (!fitness) return <span className="text-faint">—</span>;
  const label = ZONE_LABEL[fitness] ?? fitness;
  const tone =
    fitness === "Pays"
      ? "border-teal/30 bg-teal/10 text-teal"
      : fitness === "Inverted"
        ? "border-sienna/25 bg-sienna/10 text-sienna"
        : fitness === "Liquidity_only"
          ? "border-ochre/30 bg-ochre/10 text-ochre"
          : "border-border bg-panel2 text-muted-foreground";
  const ppTxt =
    pp == null
      ? "sell-through premium not computed"
      : `${Number(pp) >= 0 ? "+" : ""}${Number(pp).toFixed(1)}pp sell-through in-zone`;
  const thin = conf === "thin";
  return (
    <span
      className="inline-flex items-center gap-1"
      title={`${fitness} · ${conf ?? "confidence unknown"} · ${ppTxt}`}
    >
      <span className={cn("num rounded-[3px] border px-[5px] py-[1.5px] text-[10px]", tone)}>
        {label}
      </span>
      <span
        className={cn(
          "num text-[9px]",
          thin ? "text-sienna" : "text-faint",
        )}
      >
        {thin ? "thin" : "robust"}
      </span>
    </span>
  );
}

function FreshCell({ fresh }: { fresh: number | null }) {
  if (fresh === null) return <span className="num text-[11px] text-faint">unseeded</span>;
  if (fresh <= 0)
    return <span className="num text-[11px] text-sienna">stale {Math.abs(fresh)}d</span>;
  if (fresh <= 14) return <span className="num text-[11px] text-ochre">due {fresh}d</span>;
  return <span className="num text-[11px] text-muted-foreground">{fresh}d</span>;
}

function FlagChips({ flags }: { flags: string[] }) {
  if (!flags.length) return <span className="text-faint">—</span>;
  return (
    <div className="flex max-w-[20ch] flex-wrap gap-[3px]">
      {flags.map((f) => {
        const warn = WARN_FLAGS.includes(f);
        const due = DUE_FLAGS.some((d) => f.startsWith(d));
        return (
          <span
            key={f}
            className={cn(
              "num rounded-[3px] border px-[5px] py-[1.5px] text-[9px]",
              warn
                ? "border-sienna/25 bg-sienna/10 text-sienna"
                : due
                  ? "border-ochre/30 bg-ochre/10 text-ochre"
                  : "border-border bg-panel2 text-muted-foreground",
            )}
          >
            {f}
          </span>
        );
      })}
    </div>
  );
}

/* --------------------------- legacy drawer cells -------------------------- */

function GateDots({ gate }: { gate: [GateState, GateState, GateState] }) {
  return (
    <span className="mt-0.5 inline-flex gap-1" title="n≥8 · below-estimate buy tier · size-control (not built)">
      {gate.map((g, i) => (
        <span
          key={i}
          className={cn(
            "inline-block h-[9px] w-[9px] rounded-full border-[1.4px]",
            g === "p"
              ? "border-teal bg-teal"
              : g === "f"
                ? "border-sienna bg-sienna"
                : "border-faint bg-transparent",
          )}
        />
      ))}
    </span>
  );
}

function RoomCell({ room }: { room: number | null }) {
  if (room === null) return <span className="num text-[12px] text-faint">—</span>;
  return (
    <span className={cn("num text-[12px]", room < 1 ? "text-teal" : "text-sienna")}>
      {room.toFixed(2)}×
    </span>
  );
}

function LegacyDrawer({ rows }: { rows: BookViewRow[] }) {
  const items = useMemo(
    () =>
      rows
        .slice()
        .sort((a, b) => (b.n_exit_strong ?? -1) - (a.n_exit_strong ?? -1)),
    [rows],
  );

  return (
    <details className="mt-7 rounded-lg border border-border bg-card">
      <summary className="cursor-pointer select-none list-none px-4 py-3">
        <span className="label-caps text-[10.5px] tracking-[0.12em] text-muted-foreground">
          Legacy diagnostic · §H triptych, Exit n, Room
        </span>
        <span className="num ml-2 text-[10.5px] text-sienna">
          legs 1–2 only; size-control not built
        </span>
      </summary>

      <div className="border-t border-border px-4 py-3.5">
        <p className="mb-3 max-w-[92ch] text-[12px] text-foreground/80">
          Retired apparatus, kept for continuity and for reading market depth. Leg 3 (size-band
          control) was <b>never implemented</b>: <span className="num">matched_spread</span> is a
          null placeholder in <span className="num">comps_rollup</span>, so the third dot reads n/a
          rather than fail and <span className="num">spread_trusted</span> is forced false. Nothing
          on this panel can assert an edge. Every published size-mix ruling (Goodall, Muller,
          Stokes, Roberts, Cooke, Brangwyn) is a manual vault judgement, not a machine result. Read
          Exit n as depth and Room as pricing texture; do not read either as a spread.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="label-caps border-b border-border px-3 pb-2 text-left align-bottom text-[10px] font-medium text-muted-foreground"
                >
                  Name
                </th>
                <th
                  scope="col"
                  className="label-caps whitespace-nowrap border-b border-border px-3 pb-2 text-left align-bottom text-[10px] font-medium text-muted-foreground"
                >
                  <span className="inline-flex items-center gap-[5px]">
                    §H
                    <ColInfo label="What the old gate tested" tip={TIPS.gate} />
                  </span>
                  <span className="mt-0.5 block text-[8.5px] font-normal normal-case tracking-normal text-faint">
                    n · disc · size (n/a)
                  </span>
                </th>
                <th
                  scope="col"
                  className="label-caps whitespace-nowrap border-b border-border px-3 pb-2 text-left align-bottom text-[10px] font-medium text-muted-foreground"
                >
                  <span className="inline-flex items-center gap-[5px]">
                    Exit n
                    <ColInfo label="How Exit n is counted" tip={TIPS.exitN} />
                  </span>
                </th>
                <th
                  scope="col"
                  className="label-caps whitespace-nowrap border-b border-border px-3 pb-2 text-left align-bottom text-[10px] font-medium text-muted-foreground"
                >
                  <span className="inline-flex items-center gap-[5px]">
                    Room
                    <ColInfo label="How Room is calculated" tip={TIPS.room} />
                  </span>
                  <span className="mt-0.5 block text-[8.5px] font-normal normal-case tracking-normal text-faint">
                    regional realisation
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.artist_id} className="border-b border-border align-top">
                  <td className="px-3 py-2">
                    <span className="text-[12.5px]">{r.display_name}</span>
                    <span className="num ml-2 text-[10px] text-faint">{r.play}</span>
                  </td>
                  <td className="px-3 py-2">
                    <GateDots gate={r.gate} />
                  </td>
                  <td
                    className={cn(
                      "num px-3 py-2 text-[12px]",
                      r.thin ? "text-sienna" : "text-foreground",
                    )}
                  >
                    {r.n_exit_strong ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <RoomCell room={r.room} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

/* ------------------------------ header cell ------------------------------ */

function Th({
  children,
  tip,
  tipLabel,
  note,
  sortKey,
  active,
  dir,
  onSort,
  width,
}: {
  children: string;
  tip: string;
  tipLabel: string;
  note?: string;
  sortKey?: SortKey;
  active?: boolean;
  dir?: number;
  onSort?: (k: SortKey) => void;
  width?: string;
}) {
  const sortable = !!sortKey && !!onSort;
  return (
    <th
      scope="col"
      style={width ? { width } : undefined}
      onClick={sortable ? () => onSort(sortKey) : undefined}
      className={cn(
        "label-caps whitespace-nowrap border-b border-border px-3 pb-2 text-left align-bottom text-[10px] font-medium text-muted-foreground",
        sortable && "cursor-pointer select-none hover:text-foreground",
        active && "text-foreground",
      )}
    >
      <span className="inline-flex items-center gap-[5px]">
        {children}
        <ColInfo label={tipLabel} tip={tip} />
        {active ? <span className="text-[9px]">{dir === 1 ? "▲" : "▼"}</span> : null}
      </span>
      {note ? (
        <span className="mt-0.5 block text-[8.5px] font-normal normal-case tracking-normal text-faint">
          {note}
        </span>
      ) : null}
    </th>
  );
}

/* -------------------------------- screen -------------------------------- */

function BookScreen() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["book-screen"],
    queryFn: fetchBookScreen,
  });

  const rows = useMemo(() => (data ?? []).map(toViewRow), [data]);

  const [play, setPlay] = useState<string>("all");
  const [ragF, setRagF] = useState<string>("all");
  const [needs, setNeeds] = useState(false);
  const [view, setView] = useState<"ladder" | "full">("ladder");
  const [sortKey, setSortKey] = useState<SortKey>("fresh");
  const [sortDir, setSortDir] = useState(1);

  const kpi = useMemo(() => {
    const live = rows.filter((r) => r.rag === "g").length;
    const cheap = rows.filter((r) => r.level_read === "Cheap").length;
    const zonePays = rows.filter((r) => r.zone_fitness === "Pays").length;
    const stale = rows.filter((r) => r.fresh !== null && r.fresh <= 0).length;
    const unseeded = rows.filter((r) => r.flags.includes("unseeded")).length;
    const ceiling = rows.filter((r) => r.flags.includes("ceiling-breach")).length;
    const arr = rows.filter((r) => r.flags.includes("ARR")).length;
    return [
      { tone: "good", n: live, l: "Live lanes" },
      { tone: "good", n: cheap, l: "Priced cheap" },
      { tone: "good", n: zonePays, l: "Zone pays" },
      { tone: "", n: rows.length, l: "Names tracked" },
      { tone: "flag", n: stale, l: "Verdicts stale" },
      { tone: "flag", n: unseeded, l: "Config unseeded" },
      { tone: "", n: ceiling, l: "Ceiling-breached" },
      { tone: "", n: arr, l: "ARR live" },
    ];
  }, [rows]);

  const groups = useMemo(() => {
    const cmp = (a: BookViewRow, b: BookViewRow) => {
      const key = (r: BookViewRow) => {
        switch (sortKey) {
          case "level":
            return LEVEL_RANK[r.level_read ?? "Unknown"] ?? 3;
          case "zone":
            return ZONE_RANK[r.zone_fitness ?? "Untestable"] ?? 5;
          case "gov":
            return r.gov.sort === null ? -1 : r.gov.sort;
          default:
            return r.fresh === null ? 9999 : r.fresh;
        }
      };
      return (key(a) - key(b)) * sortDir;
    };

    /* Collector ladder: cheapest against own history first, then most liquid. */
    const ladderCmp = (a: BookViewRow, b: BookViewRow) => {
      const la = LEVEL_RANK[a.level_read ?? "Unknown"] ?? 3;
      const lb = LEVEL_RANK[b.level_read ?? "Unknown"] ?? 3;
      if (la !== lb) return la - lb;
      return (Number(b.sell_through_pct ?? 0) - Number(a.sell_through_pct ?? 0));
    };

    const lanes = play === "all" ? [...PLAY_ORDER] : [play];
    return lanes
      .map((lane) => {
        let items = rows.filter((r) => r.play === lane);
        if (ragF !== "all") items = items.filter((r) => r.rag === ragF);
        if (needs)
          items = items.filter(
            (r) =>
              (r.fresh !== null && r.fresh <= 0) ||
              r.flags.includes("unseeded") ||
              r.flags.includes("drop-watch"),
          );
        items =
          view === "ladder" ? items.slice().sort(ladderCmp) : items.slice().sort(cmp);
        return { lane, items };
      })
      .filter((g) => g.items.length > 0);
  }, [rows, play, ragF, needs, view, sortKey, sortDir]);

  const visible = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const onSort = (k: SortKey) => {
    if (view !== "full") setView("full");
    if (sortKey === k) setSortDir((d) => -d);
    else {
      setSortKey(k);
      setSortDir(1);
    }
  };

  const chip = (on: boolean) =>
    cn(
      "num rounded-full border px-2.5 py-1 text-[11px] transition-none",
      on
        ? "border-foreground bg-foreground text-background"
        : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
    );

  return (
    <AppShell>
      <header className="mb-5">
        <div className="label-caps text-muted-foreground">Art360 · roster surface</div>
        <h1 className="mt-1 font-display text-[30px] font-semibold tracking-tight">The Book</h1>
        <p className="max-w-[70ch] text-[13px] text-muted-foreground">
          One row per name. Triage, not analysis: is the name priceable against its own history, is
          it liquid, does its zone pay, is the verdict still fresh. Deep diagnostics stay in Grain.
        </p>
      </header>

      {/* portfolio strip */}
      <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-px overflow-hidden rounded-lg border border-border bg-border">
        {kpi.map((c) => (
          <div key={c.l} className="bg-card px-3.5 py-3">
            <div
              className={cn(
                "font-display text-[26px] leading-none tracking-tight",
                c.tone === "good" && "text-teal",
                c.tone === "flag" && "text-sienna",
              )}
            >
              {c.n}
            </div>
            <div className="label-caps mt-1.5 text-[10.5px] text-muted-foreground">{c.l}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div className="mb-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="label-caps text-[10px] text-faint">Lane</span>
          {["all", ...PLAY_ORDER].map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={play === p}
              onClick={() => setPlay(p)}
              className={chip(play === p)}
            >
              {p === "all" ? "All" : p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="label-caps text-[10px] text-faint">RAG</span>
          {[
            ["all", "All"],
            ["g", "● Live"],
            ["a", "● Watch"],
            ["r", "● Parked"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={ragF === k}
              onClick={() => setRagF(k as string)}
              className={chip(ragF === k)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={needs}
          onClick={() => setNeeds((v) => !v)}
          className={chip(needs)}
        >
          Needs action
        </button>
        <div className="flex-1" />
        <div
          role="group"
          aria-label="view"
          className="flex overflow-hidden rounded-full border border-border"
        >
          {(
            [
              ["ladder", "Collector ladder"],
              ["full", "Full roster"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={view === k}
              onClick={() => setView(k)}
              className={cn(
                "num px-3 py-1 text-[11px]",
                view === k ? "bg-ochre text-background" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-[13px] text-sienna">Could not read the roster surface.</p>
      ) : isLoading ? (
        <p className="label-caps">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <Th tip={TIPS.name} tipLabel="How Name works" width="19%">
                  Name
                </Th>
                <Th tip={TIPS.rag} tipLabel="How RAG is computed" width="34px">
                  RAG
                </Th>
                <Th
                  tip={TIPS.level}
                  tipLabel="How Level is read"
                  note="vs own history"
                  width="90px"
                  sortKey="level"
                  active={view === "full" && sortKey === "level"}
                  dir={sortDir}
                  onSort={onSort}
                >
                  Level
                </Th>
                <Th
                  tip={TIPS.zone}
                  tipLabel="What Zone fitness means"
                  note="per name, not book-wide"
                  width="132px"
                  sortKey="zone"
                  active={view === "full" && sortKey === "zone"}
                  dir={sortDir}
                  onSort={onSort}
                >
                  Zone
                </Th>
                <Th
                  tip={TIPS.gov}
                  tipLabel="How Governing £ is chosen"
                  note="within group only"
                  sortKey="gov"
                  active={view === "full" && sortKey === "gov"}
                  dir={sortDir}
                  onSort={onSort}
                >
                  Governing £
                </Th>
                <Th tip={TIPS.verdict} tipLabel="Where Verdict comes from">
                  Verdict
                </Th>
                <Th tip={TIPS.flags} tipLabel="What Flags mean">
                  Flags
                </Th>
                <Th
                  tip={TIPS.fresh}
                  tipLabel="How Fresh is measured"
                  sortKey="fresh"
                  active={view === "full" && sortKey === "fresh"}
                  dir={sortDir}
                  onSort={onSort}
                >
                  Fresh
                </Th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-muted-foreground">
                    No names match these filters.
                  </td>
                </tr>
              ) : (
                groups.map(({ lane, items }) => (
                  <Fragment key={lane}>
                    <tr className="border-b border-border bg-panel2">
                      <td colSpan={8} className="px-3 py-1.5">
                        <span className="label-caps text-[10.5px] tracking-[0.12em] text-foreground">
                          {lane}
                        </span>
                        <span className="num ml-2 text-[10.5px] text-muted-foreground">
                          {items.length} name{items.length === 1 ? "" : "s"}
                        </span>
                      </td>
                    </tr>
                    {items.map((r) => (
                      <tr
                        key={r.artist_id}
                        className={cn(
                          "border-b border-border align-top hover:bg-card/60",
                          view === "ladder" &&
                            (r.flags.includes("unseeded") || r.flags.includes("no-lane")) &&
                            "opacity-40",
                        )}
                      >
                        <td className="px-3 py-2.5">
                          <div className="font-display text-[16px] leading-tight">
                            {r.display_name}
                          </div>
                          <div className="num mt-0.5 text-[10.5px] text-faint">{r.dates ?? "—"}</div>
                          <div className="mt-1.5 flex gap-3">
                            <Link
                              to="/grain/$artist"
                              params={{ artist: r.artist_id }}
                              className="num border-b border-transparent text-[10px] text-faint hover:border-teal hover:text-teal"
                            >
                              Grain ↗
                            </Link>
                            <Link
                              to="/artists/$artistId"
                              params={{ artistId: r.artist_id }}
                              search={{ tab: "All notes" }}
                              className="num border-b border-transparent text-[10px] text-faint hover:border-teal hover:text-teal"
                            >
                              Notes ↗
                            </Link>
                            {r.mutualart_url && (
                              <a
                                href={r.mutualart_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="num border-b border-transparent text-[10px] text-faint hover:border-teal hover:text-teal"
                              >
                                MutualArt ↗
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <RagDot rag={r.rag} />
                        </td>
                        <td className="px-3 py-2.5">
                          <LevelCell level={r.level_read} cagr={r.price_cagr_full} />
                        </td>
                        <td className="px-3 py-2.5">
                          <ZoneChip
                            fitness={r.zone_fitness}
                            conf={r.zone_conf}
                            pp={r.zone_sellthrough_premium_pp}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "num text-[12px]",
                              r.gov.noRoom && "text-sienna",
                              r.paper_sleeve && "text-muted-foreground line-through",
                            )}
                          >
                            {r.gov.text}
                          </span>
                          <span className="block text-[9.5px] normal-case tracking-normal text-muted-foreground">
                            {r.gov.basis}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="max-w-[34ch] text-[12px] text-foreground/80">
                            {r.verdict}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <FlagChips flags={r.flags} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <FreshCell fresh={r.fresh} />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* legacy diagnostic, collapsed by default */}
      {!error && !isLoading ? <LegacyDrawer rows={visible} /> : null}

      {/* legend */}
      <div className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-[18px] border-t border-border pt-[18px] text-[12px] text-foreground/80">
        <div>
          <h4 className="label-caps mb-2 text-[10px] text-muted-foreground">
            The collector reading
          </h4>
          <p className="mb-1.5">
            Three questions, in order: is the name <b>priceable</b> (Level known, against its own
            history), is it <b>liquid</b> (sell-through), does its <b>zone</b> pay for this name.
          </p>
          <p>
            Own works you like at a sensible price with a walk-away as discipline. Re-rating is a
            free option, never the reason to buy.
          </p>
        </div>
        <div>
          <h4 className="label-caps mb-2 text-[10px] text-muted-foreground">RAG</h4>
          <p className="mb-1.5">
            <b>Live</b>: priceable, liquid (≥60%), fresh, config seeded.
          </p>
          <p className="mb-1.5">
            <b>Watch</b>: thin turnover, level unknown, stale verdict, ARR live, or unseeded.
          </p>
          <p>
            <b>Parked</b>: no derivable home-market lane.
          </p>
        </div>
        <div>
          <h4 className="label-caps mb-2 text-[10px] text-muted-foreground">Zone, honestly</h4>
          <p className="mb-1.5">
            Book-wide, in-zone work is ~45% dearer: that is <b>size and quality selection</b>, not
            zone demand. Do not pay up for it.
          </p>
          <p>
            The surviving edge is <b>liquidity</b>: +4pp sell-through, and only for ~61% of names.
            Applied per name, never as a book-wide gate.
          </p>
        </div>
        <div className="border-l-2 border-ochre pl-2.5">
          <h4 className="label-caps mb-2 text-[10px] text-muted-foreground">
            Second-order flags, designed in
          </h4>
          <p className="mb-1.5">
            <b>Mixed bases:</b> no global £ sort — sorting is scoped inside each lane group.
          </p>
          <p className="mb-1.5">
            <b>Level is not timing:</b> Cheap can stay cheap. No trend is fitted; direction stays a
            human vault call on the right sub-lane.
          </p>
          <p>
            <b>Freshness is load-bearing:</b> verdicts are 90-day snapshots; stale rows flag sienna.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
