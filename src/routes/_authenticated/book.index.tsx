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
          "One row per name: is there a live lane, is the edge real, is the verdict still fresh. Deep diagnostics stay in Grain.",
      },
      { property: "og:title", content: "The Book — roster triage — Art360" },
      {
        property: "og:description",
        content: "Sortable, filterable roster surface over book_screen with the §H gate triptych.",
      },
    ],
  }),
  component: BookScreen,
});

/* ------------------------------ column copy ------------------------------ */

const TIPS = {
  name: "Identity from the artists table. Grain opens the per-name distortion panel (tier plots, size scatter, medium ledger). Notes opens the vault verdict, open flags and supersede history for this name.",
  rag: "Computed roll-up, not hand-set. GREEN: lane active for its play type + verdict fresh + no open P1/P2 flag. AMBER: selective, thin exit (n<8), stale verdict, ARR expiring, or config unseeded. RED: no derivable lane, drop-watch expired, or dead arbitrage.",
  gate: "The three-gate 'is the edge real?' test. Left dot: Exit_Strong n ≥ 8. Middle: Buy_Regional median realisation < 1.0 (genuine below-estimate discount). Right: spread survives a size-band control (<60 / ≥60cm, in-zone + palette-hit, n≥8 both sides). INCLUDES UK autograph oil, sold, hammer-equiv. EXCLUDES paper, non-autograph, print, foreign, sub-£200 estimates. Sort orders by fail-count.",
  exitN:
    "Count of Exit_Strong sold lots (UK autograph oil, hammer-equiv present). Exit_Strong rooms: Bonhams New Bond St, L&T Edinburgh/London, Woolley & Wallis, Christie's London, Sotheby's London/Edinburgh. Below 8 the exit anchor is noise: WATCH, not BUY (shown sienna).",
  room: "Buy_Regional median realisation = hammer-equiv ÷ estimate-mid, in-zone UK oil sold, estimate-mid ≥ £200. Below 1.0× = real below-estimate discount (room to buy). At/above 1.0× = market competes it up, no room. Median not mean; sub-£200 estimates excluded because realisation lies on tiny bases.",
  gov: "Switches by play type. Arbitrage / Quality_hold: autograph-oil hammer-equiv median (UK sold). Paper: finished strong-venue watercolour median vs Paper_Ceiling, shown as a ratio (>1× = clears above ceiling, no paper room). Quality carve-out: exit band. Hammer-equivalent throughout (inclusive ÷ 1.29). EXCLUDES non-autograph, print, foreign. No global sort: bases are not comparable across lanes.",
  verdict:
    "Headline from the current vault Verdict note (note_type = Verdict, non-superseded, non-expired). Full note, guards, kill-criteria and history sit one tap away under Notes.",
  flags:
    "Open Flag notes (action_status = Open) plus standing tags: ceiling-breach (exits above ~£10k), size-mix (tier ratio is a size artefact), taste-bet, unseeded (no desk config row), ARR expiry, post-sale (edge is the private approach, not open auction).",
  fresh:
    "Days to the verdict's valid_to (valid_from + 90d, or next rollup re-sync, whichever is sooner). Past valid_to = stale (sienna). Unseeded = no config row yet. This mockup uses a comps-updated proxy; production joins the vault valid_to.",
} as const;

type SortKey = "gate" | "exitN" | "room" | "gov" | "fresh";

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

function GateDots({ gate }: { gate: [GateState, GateState, GateState] }) {
  return (
    <span className="mt-0.5 inline-flex gap-1" title="n≥8 · discount · size-band">
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
    const zonePays = rows.filter((r) => r.zone_fitness === "Pays").length;
    const stale = rows.filter((r) => r.fresh !== null && r.fresh <= 0).length;
    const unseeded = rows.filter((r) => r.flags.includes("unseeded")).length;
    const ceiling = rows.filter((r) => r.flags.includes("ceiling-breach")).length;
    const arr = rows.filter((r) => r.flags.includes("ARR")).length;
    return [
      { tone: "good", n: live, l: "Live lanes" },
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
          case "gate":
            return r.fails;
          case "room":
            return r.room === null ? 99 : r.room;
          case "gov":
            return r.gov.sort === null ? -1 : r.gov.sort;
          case "exitN":
            return r.n_exit_strong === null ? -1 : r.n_exit_strong;
          default:
            return r.fresh === null ? 9999 : r.fresh;
        }
      };
      return (key(a) - key(b)) * sortDir;
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
          view === "ladder"
            ? items.slice().sort((a, b) => {
                if (a.thin !== b.thin) return a.thin ? 1 : -1;
                return (a.room ?? 99) - (b.room ?? 99);
              })
            : items.slice().sort(cmp);
        return { lane, items };
      })
      .filter((g) => g.items.length > 0);
  }, [rows, play, ragF, needs, view, sortKey, sortDir]);

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
          One row per name. Triage, not analysis: is there a live lane, is the edge real, is the
          verdict still fresh. Deep diagnostics stay in Grain.
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
              ["ladder", "Room ladder"],
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
                  tip={TIPS.gate}
                  tipLabel="How the gate test works"
                  note="n · disc · size"
                  width="66px"
                  sortKey="gate"
                  active={view === "full" && sortKey === "gate"}
                  dir={sortDir}
                  onSort={onSort}
                >
                  §H
                </Th>
                <Th
                  tip={TIPS.exitN}
                  tipLabel="How Exit n is counted"
                  sortKey="exitN"
                  active={view === "full" && sortKey === "exitN"}
                  dir={sortDir}
                  onSort={onSort}
                >
                  Exit n
                </Th>
                <Th
                  tip={TIPS.room}
                  tipLabel="How Room is calculated"
                  note="regional realisation"
                  sortKey="room"
                  active={view === "full" && sortKey === "room"}
                  dir={sortDir}
                  onSort={onSort}
                >
                  Room
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
                  <td colSpan={9} className="p-6 text-muted-foreground">
                    No names match these filters.
                  </td>
                </tr>
              ) : (
                groups.map(({ lane, items }) => (
                  <Fragment key={lane}>
                    <tr className="border-b border-border bg-panel2">
                      <td colSpan={9} className="px-3 py-1.5">
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
                          view === "ladder" && r.thin && "opacity-40",
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
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <RagDot rag={r.rag} />
                        </td>
                        <td className="px-3 py-2.5">
                          <GateDots gate={r.gate} />
                        </td>
                        <td
                          className={cn(
                            "num px-3 py-2.5 text-[12px]",
                            r.thin ? "text-sienna" : "text-foreground",
                          )}
                        >
                          {r.n_exit_strong ?? "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <RoomCell room={r.room} />
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

      {/* legend */}
      <div className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-[18px] border-t border-border pt-[18px] text-[12px] text-foreground/80">
        <div>
          <h4 className="label-caps mb-2 text-[10px] text-muted-foreground">
            §H gate — three dots, never merged
          </h4>
          <p className="mb-1.5">
            Left: Exit_Strong n ≥ 8. Middle: regional realisation &lt; 1.0 (real discount). Right:
            spread survives size-band control.
          </p>
          <p className="flex items-center gap-2">
            <GateDots gate={["p", "f", "n"]} /> pass · fail · n/a (paper / pending / unseeded).
          </p>
        </div>
        <div>
          <h4 className="label-caps mb-2 text-[10px] text-muted-foreground">RAG</h4>
          <p className="mb-1.5">
            <b>Live</b>: lane active for its play type, verdict fresh, no open P1/P2.
          </p>
          <p className="mb-1.5">
            <b>Watch</b>: selective / thin exit (n&lt;8) / stale / ARR expiring / config unseeded.
          </p>
          <p>
            <b>Parked</b>: no derivable lane, drop-watch expired, or dead arbitrage.
          </p>
        </div>
        <div className="border-l-2 border-ochre pl-2.5">
          <h4 className="label-caps mb-2 text-[10px] text-muted-foreground">
            Second-order flags, designed in
          </h4>
          <p className="mb-1.5">
            <b>Mixed bases:</b> no global £ sort — sorting is scoped inside each play-type group.
          </p>
          <p>
            <b>Freshness is load-bearing:</b> verdicts are 90-day snapshots; stale rows flag sienna.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
