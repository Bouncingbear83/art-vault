// Repeat-sale / flip tracker: tracks an individual physical work across its
// auction appearances, to surface re-offers (same room, re-listed) and flips
// (bought regional, resold strong). Descriptive only: dates and elapsed spans
// are historical, not a timing signal, and no trend is fitted or projected
// (that thesis is falsified). This is auction-comp repeat detection, NOT the
// owned-position ledger (owned flips live in the Positions tab).
//
// Linkage key is the sheet's `ref` (fallback `auto_ref`):
//     Artist | norm-title | bucketed-size | Medium_Class
// A ref group is one candidate physical work. Grouping is recomputed here over
// UK autograph non-duplicate rows, so it can differ from the sheet's corpus-wide
// times_seen (foreign / non-autograph / duplicate siblings are stripped). §E
// dedup: same work + same venue + same date = duplicate (dropped via dup_flag);
// same work + same venue + later date = re-offer; same work + different venue =
// a move. A flip needs BOTH legs sold, a tier-up AND a hammer gain, so an
// unsold lot coming back can never read as a flip.

import { Fragment, useState } from "react";
import { type GrainRow, gbp, isAutograph, TIER_DOT, TIER_LABEL } from "@/components/grain/grain-panels";

type Read = "FLIP" | "MOVED" | "RE-OFFER";

const TIER_RANK: Record<string, number> = { Buy_Regional: 0, Straddle: 1, Exit_Strong: 2 };
const MAX_ROWS = 40; // cap the table for prolific names; overflow noted below

const tierColour = (t?: string | null): string =>
  (TIER_DOT as Record<string, string>)[t ?? ""] ?? "#8a7d6b";
const tierText = (t: string): string => (TIER_LABEL as Record<string, string>)[t] ?? t;

const isSold = (r: GrainRow): boolean =>
  r.status === "Sold" && r.hammer_equiv_gbp != null && (r.hammer_equiv_gbp as number) > 0;

const refKey = (r: GrainRow): string | null => r.ref ?? r.auto_ref ?? null;
const venueLabel = (r: GrainRow): string | null => r.venue_canonical ?? r.venue ?? null;

const dateNum = (d?: string | null): number => {
  if (!d) return NaN;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? NaN : t;
};

// Historical description only (dates and elapsed spans), never a timing signal.
const spanLabel = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return "same sale";
  const days = ms / 86_400_000;
  if (days < 31) return `${Math.round(days)}d`;
  const months = days / 30.44;
  if (months < 12) return `${Math.round(months)}mo`;
  return `${(days / 365.25).toFixed(1)}y`;
};
const ymShort = (d?: string | null): string => {
  const n = dateNum(d);
  if (Number.isNaN(n)) return "?";
  return new Date(n).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
};
const fullDate = (d?: string | null): string => {
  const n = dateNum(d);
  if (Number.isNaN(n)) return "undated";
  return new Date(n).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

// compress a tier sequence, dropping consecutive repeats: e.g.
// [Regional, Regional, Exit_Strong] -> "REGIONAL → EXIT STRONG"
const compressTiers = (path: string[]): string => {
  const out: string[] = [];
  for (const t of path) {
    const lab = tierText(t);
    if (out[out.length - 1] !== lab) out.push(lab);
  }
  return out.join(" → ");
};

interface Group {
  key: string;
  title: string;
  rows: GrainRow[]; // ordered by sale_date ascending
  appearances: number;
  corpusSeen: number; // max times_seen across the group (whole-corpus)
  soldLegs: GrainRow[];
  firstSold: GrainRow | null;
  lastSold: GrainRow | null;
  deltaPct: number | null; // first sold -> last sold hammer move (only if 2+ sold)
  venues: string[]; // distinct canonical venues, first-seen order
  moved: boolean;
  tierPath: string[]; // vtype sequence in date order
  hasUnsoldLeg: boolean;
  read: Read;
}

export function buildRepeatGroups(rows: GrainRow[]): Group[] {
  const usable = rows.filter(
    (r) =>
      isAutograph(r) &&
      r.vtype_resolved !== "Foreign" &&
      r.vtype_resolved !== "UNMAPPED" &&
      r.medium_class !== "Print" &&
      r.dup_flag !== "Y" &&
      refKey(r) != null,
  );

  const map = new Map<string, GrainRow[]>();
  for (const r of usable) {
    const k = refKey(r) as string;
    const arr = map.get(k);
    if (arr) arr.push(r);
    else map.set(k, [r]);
  }

  const groups: Group[] = [];
  for (const [key, raw] of map) {
    if (raw.length < 2) continue;

    const ordered = [...raw].sort((a, b) => {
      const da = dateNum(a.sale_date);
      const db = dateNum(b.sale_date);
      if (Number.isNaN(da) && Number.isNaN(db)) return 0;
      if (Number.isNaN(da)) return 1;
      if (Number.isNaN(db)) return -1;
      return da - db;
    });

    const soldLegs = ordered.filter(isSold);
    const firstSold = soldLegs[0] ?? null;
    const lastSold = soldLegs.length ? soldLegs[soldLegs.length - 1] ?? null : null;
    const deltaPct =
      soldLegs.length >= 2 && firstSold && lastSold && (firstSold.hammer_equiv_gbp as number) > 0
        ? (((lastSold.hammer_equiv_gbp as number) - (firstSold.hammer_equiv_gbp as number)) /
            (firstSold.hammer_equiv_gbp as number)) *
          100
        : null;

    const venues: string[] = [];
    for (const r of ordered) {
      const v = venueLabel(r);
      if (v && !venues.includes(v)) venues.push(v);
    }
    const moved = venues.length > 1;

    // FLIP: an earlier sold leg at a lower tier followed by a later sold leg at
    // a higher tier AND a higher hammer. Both legs sold, so unsold-then-sold
    // cannot qualify.
    let flip = false;
    for (let i = 0; i < ordered.length && !flip; i++) {
      const a = ordered[i];
      if (!a || !isSold(a)) continue;
      for (let j = i + 1; j < ordered.length; j++) {
        const b = ordered[j];
        if (!b || !isSold(b)) continue;
        const up = (TIER_RANK[b.vtype_resolved] ?? -1) > (TIER_RANK[a.vtype_resolved] ?? -1);
        const gained = (b.hammer_equiv_gbp as number) > (a.hammer_equiv_gbp as number);
        if (up && gained) {
          flip = true;
          break;
        }
      }
    }

    const read: Read = flip ? "FLIP" : moved ? "MOVED" : "RE-OFFER";
    const title = ordered.map((r) => r.title).find((t) => !!t && t.trim().length > 0) ?? "Untitled work";
    const corpusSeen = Math.max(...ordered.map((r) => r.times_seen ?? 0), ordered.length);

    groups.push({
      key,
      title,
      rows: ordered,
      appearances: ordered.length,
      corpusSeen,
      soldLegs,
      firstSold,
      lastSold,
      deltaPct,
      venues,
      moved,
      tierPath: ordered.map((r) => r.vtype_resolved),
      hasUnsoldLeg: ordered.some((r) => !isSold(r)),
      read,
    });
  }

  const order: Record<Read, number> = { FLIP: 0, MOVED: 1, "RE-OFFER": 2 };
  groups.sort((a, b) => {
    if (order[a.read] !== order[b.read]) return order[a.read] - order[b.read];
    const da = a.deltaPct == null ? -Infinity : Math.abs(a.deltaPct);
    const db = b.deltaPct == null ? -Infinity : Math.abs(b.deltaPct);
    return db - da;
  });
  return groups;
}

// ---------- UI ----------

function ReadBadge({ read }: { read: Read }) {
  const c: Record<Read, string> = {
    FLIP: "border-teal-800 text-teal-800",
    MOVED: "border-amber-600 text-amber-700",
    "RE-OFFER": "border-stone-300 text-stone-500",
  };
  return (
    <span className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-xs tracking-widest ${c[read]}`}>
      {read}
    </span>
  );
}

interface Leg {
  sold: boolean;
  label: string; // hover detail: date, venue, tier, price / bought in
}

// One glyph per appearance in date order: filled teal = sold, hollow = bought
// in. Each dot carries a hover tooltip as a convenience, but the full ladder
// (expand the row) is the primary, touch-friendly detail surface.
function AppearanceStrip({ legs }: { legs: Leg[] }) {
  const r = 3.2;
  const gap = 11;
  const pad = 7;
  const h = 14;
  const w = pad * 2 + Math.max(0, legs.length - 1) * gap;
  return (
    <svg width={Math.max(w, pad * 2 + r * 2)} height={h} role="img" aria-label="appearances in date order, filled = sold">
      {legs.length > 1 && (
        <line x1={pad} y1={h / 2} x2={pad + (legs.length - 1) * gap} y2={h / 2} stroke="#e7e5e4" strokeWidth="1" />
      )}
      {legs.map((leg, i) => {
        const cx = pad + i * gap;
        return (
          <g key={i}>
            <title>{leg.label}</title>
            <circle cx={cx} cy={h / 2} r={6} fill="transparent" />
            {leg.sold ? (
              <circle cx={cx} cy={h / 2} r={r} fill="#1f5f5b" />
            ) : (
              <circle cx={cx} cy={h / 2} r={r - 0.5} fill="#faf9f7" stroke="#a8a29e" strokeWidth="1" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Realised move. 0 sold = bought in; 1 sold = a single clearance (NOT a move,
// so no "X -> X"); 2+ sold = first -> last with a coloured delta.
function RealisedCell({ g }: { g: Group }) {
  const n = g.soldLegs.length;
  if (n === 0) return <span className="text-stone-400">bought in</span>;
  if (n === 1) return <span>{gbp(g.firstSold?.hammer_equiv_gbp ?? null)}</span>;
  const up = g.deltaPct != null && g.deltaPct >= 0;
  return (
    <div>
      <div className="whitespace-nowrap">
        {gbp(g.firstSold?.hammer_equiv_gbp ?? null)} → {gbp(g.lastSold?.hammer_equiv_gbp ?? null)}
      </div>
      {g.deltaPct != null && (
        <div className={`text-[11px] ${up ? "text-teal-800" : "text-amber-700"}`}>
          {g.deltaPct >= 0 ? "+" : ""}
          {g.deltaPct.toFixed(0)}%
        </div>
      )}
    </div>
  );
}

// Full appearance ladder, revealed on expand. Every leg in date order with its
// date / venue / tier / price, and between legs the elapsed time and the step
// price change. This is the pricing journey and the "2 months or 10 years"
// answer, made visible without relying on hover.
function Ladder({ g }: { g: Group }) {
  return (
    <div className="rounded border border-stone-200 bg-white p-3">
      <div className="mb-2 text-[11px] tracking-widest text-stone-500">
        APPEARANCE LADDER · {ymShort(g.rows[0]?.sale_date ?? null)} → {ymShort(g.rows[g.rows.length - 1]?.sale_date ?? null)} ·{" "}
        {spanLabel(dateNum(g.rows[g.rows.length - 1]?.sale_date ?? null) - dateNum(g.rows[0]?.sale_date ?? null))} span
      </div>
      <div className="flex flex-col">
        {g.rows.map((r, i) => {
          const prev = i > 0 ? g.rows[i - 1] ?? null : null;
          const gap = prev ? spanLabel(dateNum(r.sale_date) - dateNum(prev.sale_date)) : null;
          const bothSold = !!prev && isSold(prev) && isSold(r);
          const stepPct =
            bothSold && prev && (prev.hammer_equiv_gbp as number) > 0
              ? (((r.hammer_equiv_gbp as number) - (prev.hammer_equiv_gbp as number)) /
                  (prev.hammer_equiv_gbp as number)) *
                100
              : null;
          const up = stepPct != null && stepPct >= 0;
          return (
            <Fragment key={i}>
              {gap && (
                <div className="flex items-center gap-2 py-0.5 pl-1 text-[11px] text-stone-400">
                  <span className="inline-block w-3 text-center">↓</span>
                  <span className="font-mono">{gap}</span>
                  {stepPct != null && (
                    <span className={`font-mono ${up ? "text-teal-800" : "text-amber-700"}`}>
                      {stepPct >= 0 ? "+" : ""}
                      {stepPct.toFixed(0)}%
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-baseline gap-3 py-1">
                <span className="w-28 shrink-0 font-mono text-xs text-stone-600">{fullDate(r.sale_date)}</span>
                <span className="flex w-32 shrink-0 items-center gap-1.5 text-xs text-stone-600">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: tierColour(r.vtype_resolved) }}
                  />
                  {tierText(r.vtype_resolved)}
                </span>
                <span className="flex-1 truncate text-xs text-stone-500">{venueLabel(r) ?? "?"}</span>
                <span className={`w-20 shrink-0 text-right font-mono text-xs ${isSold(r) ? "text-stone-800" : "text-stone-400"}`}>
                  {isSold(r) ? gbp(r.hammer_equiv_gbp) : "bought in"}
                </span>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export function RepeatPanel({ rows, medium }: { rows: GrainRow[]; medium: "Oil" | "Watercolour" }) {
  const scoped = rows.filter((r) => r.medium_class === medium);
  const groups = buildRepeatGroups(scoped);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const counts = groups.reduce(
    (acc, g) => {
      acc[g.read] += 1;
      return acc;
    },
    { FLIP: 0, MOVED: 0, "RE-OFFER": 0 } as Record<Read, number>,
  );

  const shown = groups.slice(0, MAX_ROWS);
  const overflow = groups.length - shown.length;

  return (
    <section>
      <h2 className="mb-2 text-xs tracking-widest text-stone-500">
        REPEAT SALES: SAME WORK ACROSS APPEARANCES ({medium.toUpperCase()})
      </h2>

      {groups.length === 0 ? (
        <p className="rounded border border-stone-200 p-4 text-xs text-stone-500">
          No repeated works detected in this window (UK autograph, duplicates removed). Widen the
          YEARS range to surface chains that span more time.
        </p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <ReadBadge read="FLIP" />
              <span className="font-mono text-xs text-stone-500">{counts.FLIP}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ReadBadge read="MOVED" />
              <span className="font-mono text-xs text-stone-500">{counts.MOVED}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ReadBadge read="RE-OFFER" />
              <span className="font-mono text-xs text-stone-500">{counts["RE-OFFER"]}</span>
            </span>
            <span className="ml-auto text-[11px] text-stone-400">tap a work for its full ladder</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs tracking-widest text-stone-500">
                  <th className="whitespace-nowrap py-2">WORK</th>
                  <th className="whitespace-nowrap py-2">SEEN</th>
                  <th className="whitespace-nowrap py-2 text-right">REALISED</th>
                  <th className="whitespace-nowrap py-2 pl-6">MOVE</th>
                  <th className="whitespace-nowrap py-2 text-right">READ</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((g) => {
                  const legs: Leg[] = g.rows.map((r) => ({
                    sold: isSold(r),
                    label: `${ymShort(r.sale_date)} · ${venueLabel(r) ?? "?"} · ${tierText(r.vtype_resolved)} · ${
                      isSold(r) ? gbp(r.hammer_equiv_gbp) : "bought in"
                    }`,
                  }));
                  const firstDate = g.rows[0]?.sale_date ?? null;
                  const lastDate = g.rows[g.rows.length - 1]?.sale_date ?? null;
                  const span = spanLabel(dateNum(lastDate) - dateNum(firstDate));
                  const lastTier = g.tierPath[g.tierPath.length - 1];
                  const isOpen = open.has(g.key);
                  return (
                    <Fragment key={g.key}>
                      <tr className="border-b border-stone-100 align-top">
                        <td className="max-w-[340px] py-2 pr-4">
                          <button
                            type="button"
                            onClick={() => toggle(g.key)}
                            aria-expanded={isOpen}
                            className="flex items-start gap-1.5 text-left hover:opacity-80"
                          >
                            <svg
                              viewBox="0 0 12 12"
                              aria-hidden="true"
                              className={`mt-1 h-3 w-3 shrink-0 text-stone-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                            >
                              <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.5" />
                            </svg>
                            <span>
                              <span className="block break-words text-stone-800">{g.title}</span>
                              <span className="mt-0.5 block font-mono text-[11px] text-stone-400">
                                {g.appearances} appearances · {g.soldLegs.length} sold
                                {g.corpusSeen > g.appearances ? ` · +${g.corpusSeen - g.appearances} elsewhere` : ""}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="py-2 pt-3">
                          <AppearanceStrip legs={legs} />
                          <div className="mt-1 whitespace-nowrap font-mono text-[11px] text-stone-400">
                            {ymShort(firstDate)} → {ymShort(lastDate)} · {span}
                          </div>
                        </td>
                        <td className="whitespace-nowrap py-2 text-right font-mono">
                          <RealisedCell g={g} />
                        </td>
                        <td className="py-2 pl-6">
                          <div className="flex items-center gap-1.5 text-xs text-stone-600">
                            <span
                              className="inline-block h-2 w-2 shrink-0 rounded-full"
                              style={{ background: tierColour(lastTier) }}
                            />
                            {compressTiers(g.tierPath)}
                          </div>
                          <div className="mt-0.5 text-[11px] text-stone-400">{g.venues.join(" → ")}</div>
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <ReadBadge read={g.read} />
                            {g.read === "MOVED" && g.hasUnsoldLeg && (
                              <span className="inline-block whitespace-nowrap rounded border border-stone-300 px-1.5 py-0.5 text-[10px] tracking-widest text-stone-400">
                                UNSOLD LEG
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-stone-100">
                          <td colSpan={5} className="px-4 pb-3 pl-9">
                            <Ladder g={g} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-500">
            <span className="inline-flex items-center gap-1.5">
              <svg width="10" height="10" aria-hidden="true">
                <circle cx="5" cy="5" r="3.2" fill="#1f5f5b" />
              </svg>
              sold
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="10" height="10" aria-hidden="true">
                <circle cx="5" cy="5" r="2.7" fill="#faf9f7" stroke="#a8a29e" strokeWidth="1" />
              </svg>
              bought in
            </span>
          </div>

          {overflow > 0 && (
            <p className="mt-1 text-[11px] text-stone-400">
              +{overflow} further repeated works not shown (sorted flips first, then by move size).
            </p>
          )}

          <p className="mt-1 text-xs text-stone-500">
            Descriptive only: dates and spans are historical, not a timing signal, and no trend is
            fitted or projected. FLIP needs both legs sold with a tier-up and a hammer gain; an unsold
            lot coming back is never a flip. Grouping is UK autograph non-duplicate on the sheet ref
            key; corpus-wide siblings (foreign, non-autograph) show as "+n elsewhere". This is
            auction-comp repeat detection, not the owned-position ledger.
          </p>
        </>
      )}
    </section>
  );
}
