// Repeat-sale / flip tracker: tracks an individual physical work across its
// auction appearances, to surface re-offers (same room, re-listed) and flips
// (bought regional, resold strong). Descriptive only: no timing-as-signal and
// no forward projection (that thesis is falsified). This is auction-comp repeat
// detection, NOT the owned-position ledger (owned flips live in the Positions
// tab).
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
  deltaPct: number | null; // first sold -> last sold hammer move
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
  const c: Record<Read, string> =
    {
      FLIP: "border-teal-800 text-teal-800",
      MOVED: "border-amber-600 text-amber-700",
      "RE-OFFER": "border-stone-300 text-stone-500",
    };
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs tracking-widest ${c[read]}`}>
      {read}
    </span>
  );
}

// self-contained sparkline of sold-leg hammers; no recharts, degrades on n<2
function Spark({ vals }: { vals: number[] }) {
  if (vals.length < 2) return <span className="font-mono text-xs text-stone-300">–</span>;
  const w = 64;
  const h = 20;
  const pad = 2;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const xy = (v: number, i: number): [number, number] => [
    pad + (i * (w - 2 * pad)) / (vals.length - 1),
    h - pad - ((v - min) / span) * (h - 2 * pad),
  ];
  const first = vals[0] ?? 0;
  const last = vals[vals.length - 1] ?? 0;
  const stroke = last >= first ? "#1f5f5b" : "#b45309";
  const pts = vals.map((v, i) => xy(v, i).map((n) => n.toFixed(1)).join(",")).join(" ");
  return (
    <svg width={w} height={h} role="img" aria-label="hammer trajectory">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" />
      {vals.map((v, i) => {
        const [cx, cy] = xy(v, i);
        return <circle key={i} cx={cx} cy={cy} r="1.8" fill={stroke} />;
      })}
    </svg>
  );
}

export function RepeatPanel({ rows, medium }: { rows: GrainRow[]; medium: "Oil" | "Watercolour" }) {
  const scoped = rows.filter((r) => r.medium_class === medium);
  const groups = buildRepeatGroups(scoped);

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
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs tracking-widest text-stone-500">
                  <th className="py-2">WORK</th>
                  <th className="py-2 text-center">N</th>
                  <th className="py-2 text-center">TRAJECTORY</th>
                  <th className="py-2 text-right">Δ FIRST→LAST</th>
                  <th className="py-2">MOVE</th>
                  <th className="py-2 text-right">READ</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((g) => {
                  const soldVals = g.soldLegs.map((r) => r.hammer_equiv_gbp as number);
                  const dUp = g.deltaPct != null && g.deltaPct >= 0;
                  const lastTier = g.tierPath[g.tierPath.length - 1];
                  return (
                    <tr key={g.key} className="border-b border-stone-100 align-top">
                      <td className="py-2 pr-3">
                        <div className="text-stone-800">{g.title}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-stone-400">
                          {g.appearances} appearances
                          {g.corpusSeen > g.appearances ? ` (+${g.corpusSeen - g.appearances} elsewhere)` : ""}
                          {g.hasUnsoldLeg ? " · unsold leg" : ""}
                        </div>
                      </td>
                      <td className="py-2 text-center font-mono">{g.appearances}</td>
                      <td className="py-2 text-center">
                        <span className="inline-flex justify-center">
                          <Spark vals={soldVals} />
                        </span>
                      </td>
                      <td
                        className={`py-2 text-right font-mono ${
                          g.deltaPct == null ? "text-stone-300" : dUp ? "text-teal-800" : "text-amber-700"
                        }`}
                      >
                        {g.deltaPct == null ? "–" : `${g.deltaPct >= 0 ? "+" : ""}${g.deltaPct.toFixed(0)}%`}
                        {g.firstSold && g.lastSold && (
                          <div className="text-[11px] text-stone-400">
                            {gbp(g.firstSold.hammer_equiv_gbp)} → {gbp(g.lastSold.hammer_equiv_gbp)}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
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
                          {g.read !== "FLIP" && g.hasUnsoldLeg && (
                            <span className="inline-block rounded border border-stone-300 px-1.5 py-0.5 text-[10px] tracking-widest text-stone-400">
                              UNSOLD LEG
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {overflow > 0 && (
            <p className="mt-1 text-[11px] text-stone-400">
              +{overflow} further repeated works not shown (sorted flips first, then by move size).
            </p>
          )}

          <p className="mt-1 text-xs text-stone-500">
            Descriptive only, no forward projection. FLIP needs both legs sold with a tier-up and a
            hammer gain; an unsold lot coming back is tagged UNSOLD LEG, never a flip. Grouping is UK
            autograph non-duplicate on the sheet ref key; corpus-wide siblings (foreign,
            non-autograph) show as "+n elsewhere". This is auction-comp repeat detection, not the
            owned-position ledger.
          </p>
        </>
      )}
    </section>
  );
}
