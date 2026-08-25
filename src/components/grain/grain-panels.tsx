// Grain Distortion Panel: surfaces tail, medium-mix, size-mix and attribution
// confounds behind headline Exit/Regional ratios. Render-only diagnostics; no
// gate logic lives here (gates stay in the rollup / scorer per the app contract).
//
// v4: ALL computed stats (KPI ratios, tier medians, medium ledger, ceiling,
// realisation, size bands) are AUTOGRAPH-ONLY, matching the rollup's
// authorship='Autograph' filter. Non-autograph lots (Circle of / After /
// Follower / Manner of) were deflating the regional median and inflating the
// ratio; they now appear ONLY as red-cross markers on the tier strip, to catch
// mis-tags, and are excluded from every number. Every chart carries a colour
// key and states its basis. Size-band spread table added (§H test 3). Support
// (panel/board) flagged for condition risk.
//
// Foreign/UNMAPPED/Print/non-Sold rows are excluded from stats per §E.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { paperSleeve } from "@/lib/paper-sleeve";
import { RepeatPanel } from "@/components/grain/repeat-panel";

export interface GrainRow {
  artist_id: string;
  medium_class: "Oil" | "Watercolour" | "Pastel" | "Mixed" | "Print";
  medium_raw?: string | null;
  vtype_resolved: "Exit_Strong" | "Straddle" | "Buy_Regional" | "Foreign" | "UNMAPPED";
  hammer_equiv_gbp: number | null;
  longest_cm: number | null;
  status: string;
  in_zone: boolean | null;
  sale_date: string;
  sheet_grade?: string | null;
  title?: string | null;
  authorship?: string | null;
  venue?: string | null;
  est_mid_gbp?: number | null;
  // repeat-sale linkage (sheet-derived; see repeat-panel.tsx)
  ref?: string | null;
  auto_ref?: string | null;
  times_seen?: number | null;
  repeat_flag?: string | null;
  venue_canonical?: string | null;
  dup_flag?: string | null;
}

const N_GATE = 8;
const TAIL_TRIM = 0.1;
const EST_FLOOR = 200; // §E: realisation lies on sub-£200 estimates; exclude them

const TIERS = ["Buy_Regional", "Straddle", "Exit_Strong"] as const;
type Tier = (typeof TIERS)[number];
export const TIER_LABEL: Record<Tier, string> = {
  Buy_Regional: "REGIONAL",
  Straddle: "STRADDLE",
  Exit_Strong: "EXIT STRONG",
};
export const TIER_DOT: Record<Tier, string> = {
  Buy_Regional: "#8a7d6b",
  Straddle: "#c2870a",
  Exit_Strong: "#1f5f5b",
};

const MEDIUM_COLOUR: Record<string, string> = {
  Oil: "#1f5f5b",
  Watercolour: "#c2870a",
  Pastel: "#8a7d6b",
  Mixed: "#a58a5c",
  Print: "#c0392b",
};
const INZONE = "#1f5f5b";
const OUTZONE = "#c2870a";
const NONAUTO = "#c0392b";
const SUPPORT = "#3f3f46";

// ---------- helpers ----------

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const trimTop = (xs: number[], frac: number): number[] => {
  if (xs.length < 3) return xs;
  const s = [...xs].sort((a, b) => a - b);
  const cut = Math.max(1, Math.floor(s.length * frac));
  return s.slice(0, s.length - cut);
};

export const gbp = (v: number | null): string =>
  v == null ? "–" : `£${Math.round(v).toLocaleString("en-GB")}`;

const ratioFmt = (v: number | null): string => (v == null ? "–" : `${v.toFixed(2)}x`);

const yearOf = (d?: string | null): number => (d ? new Date(d).getUTCFullYear() : NaN);

const yearsOf = (rows: GrainRow[]): [number, number] | null => {
  const ys = rows.map((r) => yearOf(r.sale_date)).filter((y) => !Number.isNaN(y));
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
};

export const isAutograph = (r: GrainRow) => !r.authorship || r.authorship === "Autograph";

const parseSupport = (raw?: string | null): "panel" | "canvas" | null => {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/panel|board|millboard|cradled|card/.test(s)) return "panel";
  if (/canvas/.test(s)) return "canvas";
  return null;
};

const enrich = (r: GrainRow) => ({
  title: r.title ?? null,
  venue: r.venue ?? null,
  date: r.sale_date,
  authorship: r.authorship ?? null,
  tier: r.vtype_resolved,
  medium: r.medium_class,
  size: r.longest_cm,
  hammer: r.hammer_equiv_gbp as number,
  estMid: r.est_mid_gbp ?? null,
  support: parseSupport(r.medium_raw),
});

// ---------- stats (AUTOGRAPH-ONLY) ----------

interface TierStats {
  n: number;
  med: number | null;
  medOil: number | null;
  nOil: number;
  medTrimmed: number | null;
}

export interface GrainStats {
  byTier: Record<Tier, TierStats>;
  ratioRaw: number | null;
  ratioOil: number | null;
  ratioTrimmed: number | null;
  usable: GrainRow[]; // autograph-only: the basis for every number
  usableWithNonAuto: GrainRow[]; // incl non-autograph: tier-strip display only
  mediumLedger: { medium: string; n: number; med: number | null }[];
  finishedWcMed: number | null;
  finishedWcN: number;
  sketchWcMed: number | null;
  sketchWcN: number;
  wcHasGrade: boolean;
}

export function computeGrainStats(rows: GrainRow[]): GrainStats {
  const base = rows.filter(
    (r) =>
      r.status === "Sold" &&
      r.hammer_equiv_gbp != null &&
      (r.hammer_equiv_gbp as number) > 0 &&
      r.vtype_resolved !== "Foreign" &&
      r.vtype_resolved !== "UNMAPPED" &&
      r.medium_class !== "Print"
  );
  const usableWithNonAuto = base;
  const usable = base.filter(isAutograph); // autograph-only = the stats basis

  const byTier = {} as Record<Tier, TierStats>;
  for (const t of TIERS) {
    const vals = usable.filter((r) => r.vtype_resolved === t).map((r) => r.hammer_equiv_gbp as number);
    const oil = usable
      .filter((r) => r.vtype_resolved === t && r.medium_class === "Oil")
      .map((r) => r.hammer_equiv_gbp as number);
    byTier[t] = {
      n: vals.length,
      med: median(vals),
      nOil: oil.length,
      medOil: median(oil),
      medTrimmed: median(trimTop(vals, TAIL_TRIM)),
    };
  }

  const div = (a: number | null, b: number | null): number | null =>
    a != null && b != null && b > 0 ? a / b : null;

  const mediums = ["Oil", "Watercolour", "Pastel", "Mixed"];
  const mediumLedger = mediums
    .map((m) => {
      const vals = usable.filter((r) => r.medium_class === m).map((r) => r.hammer_equiv_gbp as number);
      return { medium: m, n: vals.length, med: median(vals) };
    })
    .filter((x) => x.n > 0);

  const wc = usable.filter((r) => r.medium_class === "Watercolour");
  const wcHasGrade = wc.some((r) => r.sheet_grade != null && r.sheet_grade !== "");
  const finishedRows = wcHasGrade ? wc.filter((r) => (r.sheet_grade ?? "").toLowerCase() === "finished") : wc;
  const sketchRows = wcHasGrade ? wc.filter((r) => (r.sheet_grade ?? "").toLowerCase() !== "finished") : [];
  const fVals = finishedRows.map((r) => r.hammer_equiv_gbp as number);
  const sVals = sketchRows.map((r) => r.hammer_equiv_gbp as number);

  return {
    byTier,
    ratioRaw: div(byTier.Exit_Strong.med, byTier.Buy_Regional.med),
    ratioOil: div(byTier.Exit_Strong.medOil, byTier.Buy_Regional.medOil),
    ratioTrimmed: div(byTier.Exit_Strong.medTrimmed, byTier.Buy_Regional.medTrimmed),
    usable,
    usableWithNonAuto,
    mediumLedger,
    finishedWcMed: median(fVals),
    finishedWcN: fVals.length,
    sketchWcMed: median(sVals),
    sketchWcN: sVals.length,
    wcHasGrade,
  };
}

// ---------- shared UI bits ----------

function Badge({ tone, children }: { tone: "ok" | "warn" | "mute"; children: ReactNode }) {
  const c =
    tone === "ok"
      ? "border-teal-800 text-teal-800"
      : tone === "warn"
        ? "border-amber-600 text-amber-700"
        : "border-stone-300 text-stone-400";
  return (
    <span className={`inline-block border rounded px-2 py-0.5 text-xs tracking-widest ${c}`}>
      {children}
    </span>
  );
}

function InfoDot({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label="What this means"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="ml-1 grid h-4 w-4 place-items-center rounded-full border border-stone-300 text-[10px] leading-none text-stone-500 hover:border-stone-500 hover:text-stone-700"
      >
        i
      </button>
      {open && (
        // right-anchored so it never bleeds off the right edge
        <span className="absolute top-6 right-0 z-30 w-64 rounded border border-stone-200 bg-white p-3 text-xs font-normal normal-case leading-relaxed tracking-normal text-stone-600 shadow-md">
          {text}
        </span>
      )}
    </span>
  );
}

type GlyphShape = "dot" | "cross" | "diamond" | "triangle" | "line" | "dashed";
function Glyph({ colour, shape = "dot" }: { colour: string; shape?: GlyphShape }) {
  if (shape === "line")
    return (
      <svg width="16" height="8">
        <line x1="0" y1="4" x2="16" y2="4" stroke={colour} strokeWidth="2" />
      </svg>
    );
  if (shape === "dashed")
    return (
      <svg width="16" height="8">
        <line x1="0" y1="4" x2="16" y2="4" stroke={colour} strokeWidth="1.5" strokeDasharray="3 2" />
      </svg>
    );
  return (
    <svg width="11" height="11">
      {shape === "cross" ? (
        <g stroke={colour} strokeWidth="2">
          <line x1="1.5" y1="1.5" x2="9.5" y2="9.5" />
          <line x1="9.5" y1="1.5" x2="1.5" y2="9.5" />
        </g>
      ) : shape === "diamond" ? (
        <rect x="2.5" y="2.5" width="6" height="6" transform="rotate(45 5.5 5.5)" fill="none" stroke={colour} strokeWidth="1.5" />
      ) : shape === "triangle" ? (
        <polygon points="5.5,1 10,10 1,10" fill={colour} />
      ) : (
        <circle cx="5.5" cy="5.5" r="4" fill={colour} />
      )}
    </svg>
  );
}

function Key({ items }: { items: { colour: string; label: string; shape?: GlyphShape }[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <Glyph colour={it.colour} shape={it.shape} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function LotTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ReturnType<typeof enrich> }> }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  const date = p.date ? new Date(p.date).toLocaleDateString("en-GB") : "–";
  const nonAuto = p.authorship && p.authorship !== "Autograph";
  return (
    <div className="max-w-xs rounded border border-stone-200 bg-white p-3 text-xs shadow-md">
      <div className="font-medium text-stone-800">{p.title || "Untitled lot"}</div>
      <div className="mt-1 space-y-0.5 font-mono text-stone-600">
        <div>{gbp(p.hammer)} hammer-equiv</div>
        {p.estMid && p.estMid > 0 && <div>{(p.hammer / p.estMid).toFixed(2)}x of estimate (est {gbp(p.estMid)})</div>}
        <div>
          {date}
          {p.venue ? ` · ${p.venue}` : ""}
        </div>
        <div>
          {String(p.tier).replace(/_/g, " ")} · {p.medium}
          {p.size ? ` · ${Math.round(p.size)}cm` : ""}
        </div>
        {p.support === "panel" && <div className="text-stone-500">board/panel: condition risk</div>}
        {nonAuto && <div className="text-red-700">{String(p.authorship).replace(/_/g, " ")}</div>}
      </div>
    </div>
  );
}

function Caption({ rows }: { rows: GrainRow[] }) {
  const ys = yearsOf(rows);
  return (
    <p className="mt-1 font-mono text-xs text-stone-400">
      n={rows.length}
      {ys ? ` · ${ys[0]}–${ys[1]}` : ""}
    </p>
  );
}

const KPI_HELP: Record<string, string> = {
  RAW: "Exit-strong median divided by regional median, autograph only, all media. A high number looks like edge but is usually size or medium mix. Trust it only when n is 8 or more AND regional realisation is below 1.0. If RAW sits well above OIL ONLY or TAIL STRIPPED, the spread is mix, not a repeatable edge.",
  "OIL ONLY": "The same ratio, oils only, stripping watercolour and paper out of the mix. If it collapses versus RAW, the headline was paper bleed. If it reads higher than RAW (up arrow), it is a thin, different slice: treat with suspicion, not as a cleaner signal.",
  "TAIL STRIPPED": "The same ratio with the top decile removed per tier. If it collapses versus RAW, a few fat-tail lots drove the spread, not something you can repeat.",
};
const CEILING_HELP =
  "Finished-watercolour median (autograph) divided by your Paper_Ceiling. Below 1.0 means the market clears under your ceiling: room to buy on paper. At or above 1.0 means no room. The oil-based Exit/Regional ratio is suppressed here as a category error.";
const TIMEBUBBLE_HELP =
  "Each bubble is one autograph sold lot: date across, hammer up (log), bubble size is the longest side, colour is in-zone versus out. The line is the median by year and is descriptive only: no trend is fitted or projected.";
const REALISATION_HELP =
  "Hammer divided by estimate-mid, per tier, autograph only. Below the 1.0 line means sold under estimate: a genuine discount, which is the room. At or above 1.0 means the market competed the work up: no room even at the buy tier. This is §H test 2. Estimates under £200 are excluded.";
const SIZEBAND_HELP =
  "The tier spread, recomputed within matched size bands (autograph oil). If the ratio stays high across bands, the spread is real. If it collapses band-by-band versus the headline, the spread was size-mix, not edge. This is §H test 3, the Brangwyn/Stanfield check.";

// ---------- year-range control ----------

function YearRange({ bounds, from, to, setFrom, setTo }: { bounds: [number, number]; from: number; to: number; setFrom: (n: number) => void; setTo: (n: number) => void }) {
  const years: number[] = [];
  for (let y = bounds[0]; y <= bounds[1]; y++) years.push(y);
  const sel = "rounded border border-stone-300 bg-white px-2 py-1 font-mono text-xs text-stone-700";
  const full = from === bounds[0] && to === bounds[1];
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="tracking-widest text-stone-500">YEARS</span>
      <select className={sel} value={from} onChange={(e) => setFrom(+e.target.value)}>
        {years.map((y) => (<option key={y} value={y}>{y}</option>))}
      </select>
      <span className="text-stone-400">to</span>
      <select className={sel} value={to} onChange={(e) => setTo(+e.target.value)}>
        {years.map((y) => (<option key={y} value={y}>{y}</option>))}
      </select>
      {!full && (
        <button type="button" onClick={() => { setFrom(bounds[0]); setTo(bounds[1]); }} className="text-stone-500 underline hover:text-stone-700">
          reset
        </button>
      )}
    </div>
  );
}

// ---------- ceiling bar + paper split ----------

function CeilingBar({ s, ceiling }: { s: GrainStats; ceiling: number }) {
  const med = s.finishedWcMed;
  const ratio = med != null && ceiling > 0 ? med / ceiling : null;
  const fillPct = ratio != null ? Math.min(100, ratio * 100) : 0;
  const room = ratio != null && ratio < 1;
  return (
    <div className="border border-stone-200 rounded p-5 bg-stone-50">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-sm">
          {s.wcHasGrade ? "Finished watercolour" : "Watercolour"} median (UK sold, autograph)
          <InfoDot text={CEILING_HELP} />
        </div>
        <div className="font-mono text-2xl">{gbp(med)}</div>
      </div>
      <div className="flex items-baseline justify-between mb-3 text-xs text-stone-500">
        <div>vs Paper_Ceiling {gbp(ceiling)}</div>
        <div className="font-mono">n={s.finishedWcN}</div>
      </div>
      <div className="relative h-4 bg-stone-200 rounded overflow-hidden">
        <div className={`absolute inset-y-0 left-0 ${room ? "bg-teal-700" : "bg-amber-600"}`} style={{ width: `${fillPct}%` }} />
        <div className="absolute inset-y-0 right-0 w-px bg-stone-800" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Badge tone={room ? "ok" : "warn"}>{ratio != null ? `${ratio.toFixed(2)}x CEILING` : "NO DATA"}</Badge>
        <span className="text-xs text-stone-500">
          {room ? "clears below ceiling: room on paper" : ratio != null ? "at or above ceiling: no paper room" : "no finished-watercolour comps"}
        </span>
      </div>
      {!s.wcHasGrade && (
        <p className="mt-3 text-xs text-amber-700">
          sheet_grade absent: bar uses all watercolour, not finished-only. Add Sheet_Grade to the export to make this exact.
        </p>
      )}
    </div>
  );
}

function PaperSplit({ s }: { s: GrainStats }) {
  if (!s.wcHasGrade) return null;
  const rows = [
    { label: "Finished", med: s.finishedWcMed, n: s.finishedWcN, tone: INZONE },
    { label: "Sketch / other", med: s.sketchWcMed, n: s.sketchWcN, tone: "#8a7d6b" },
  ];
  return (
    <div className="border border-stone-200 rounded divide-y divide-stone-200">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.tone }} />
            <span className="text-sm">{r.label}</span>
          </div>
          <div className="font-mono text-sm">{gbp(r.med)} <span className="text-stone-400">n={r.n}</span></div>
        </div>
      ))}
    </div>
  );
}

// ---------- KPI strip ----------

function KpiStrip({ s }: { s: GrainStats }) {
  const gated = s.byTier.Exit_Strong.n >= N_GATE;
  const gatedOil = s.byTier.Exit_Strong.nOil >= N_GATE;
  const delta = (controlled: number | null): { text: string; suspect: boolean } | null => {
    if (s.ratioRaw == null || controlled == null || s.ratioRaw === 0) return null;
    const d = (controlled - s.ratioRaw) / s.ratioRaw;
    return { text: `${d >= 0 ? "↑" : "↓"}${Math.abs(d * 100).toFixed(0)}% vs raw`, suspect: d > 0 };
  };
  const cells = [
    { label: "RAW", ratio: s.ratioRaw, n: s.byTier.Exit_Strong.n, ok: gated, delta: null as ReturnType<typeof delta> },
    { label: "OIL ONLY", ratio: s.ratioOil, n: s.byTier.Exit_Strong.nOil, ok: gatedOil, delta: delta(s.ratioOil) },
    { label: "TAIL STRIPPED", ratio: s.ratioTrimmed, n: s.byTier.Exit_Strong.n, ok: gated, delta: delta(s.ratioTrimmed) },
  ];
  return (
    <>
      <div className="grid grid-cols-3 gap-px border border-stone-200 rounded overflow-hidden">
        {cells.map((c) => (
          <div key={c.label} className="bg-stone-50 p-4">
            <div className="text-xs tracking-widest text-stone-500 mb-1">
              {c.label} EXIT/REGIONAL
              <InfoDot text={KPI_HELP[c.label] ?? ""} />
            </div>
            <div className="font-mono text-2xl">{ratioFmt(c.ratio)}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge tone={c.ok ? "ok" : "warn"}>{c.ok ? "TRUSTED" : "THIN"}</Badge>
              <span className="font-mono text-xs text-stone-500">n={c.n}</span>
              {c.delta && <span className={`font-mono text-xs ${c.delta.suspect ? "text-amber-700" : "text-stone-500"}`}>{c.delta.text}</span>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-stone-500">
        Basis: UK sold, autograph only. RAW = all media; OIL ONLY = oils; non-autograph excluded from every ratio.
      </p>
    </>
  );
}

// ---------- tier strip (toggle + non-autograph markers) ----------

function TierStrip({ rows }: { rows: GrainRow[] }) {
  const jitter = (r: GrainRow, i: number) => TIERS.indexOf(r.vtype_resolved as Tier) + ((((i * 37) % 13) / 13 - 0.5) * 0.55);
  const auto = rows.filter(isAutograph);
  const nonAuto = rows.filter((r) => !isAutograph(r));
  const autoPts = auto.map((r, i) => ({ x: jitter(r, i), y: r.hammer_equiv_gbp as number, ...enrich(r) }));
  const nonAutoPts = nonAuto.map((r, i) => ({ x: jitter(r, i), y: r.hammer_equiv_gbp as number, ...enrich(r) }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <XAxis type="number" dataKey="x" domain={[-0.5, 2.5]} ticks={[0, 1, 2]} tickFormatter={(v: number) => TIER_LABEL[TIERS[v]]} tick={{ fontSize: 11, letterSpacing: 2 }} axisLine={false} tickLine={false} />
        <YAxis type="number" dataKey="y" scale="log" domain={["auto", "auto"]} tickFormatter={(v: number) => gbp(v)} tick={{ fontSize: 11, fontFamily: "monospace" }} width={72} axisLine={false} tickLine={false} />
        <ZAxis range={[30, 30]} />
        <Tooltip content={<LotTooltip />} />
        {TIERS.map((t) => {
          // median rule is autograph-only, matching the stats basis
          const vals = auto.filter((r) => r.vtype_resolved === t).map((r) => r.hammer_equiv_gbp as number);
          const m = median(vals);
          return m != null ? (
            <ReferenceLine key={t} segment={[{ x: TIERS.indexOf(t) - 0.35, y: m }, { x: TIERS.indexOf(t) + 0.35, y: m }]} stroke="#44403c" strokeWidth={2} />
          ) : null;
        })}
        {Object.keys(MEDIUM_COLOUR).map((mm) => (
          <Scatter key={mm} name={mm} data={autoPts.filter((d) => d.medium === mm)} fill={MEDIUM_COLOUR[mm]} fillOpacity={0.6} />
        ))}
        <Scatter name="Non-autograph" data={nonAutoPts} fill={NONAUTO} shape="cross" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function MediumToggle({ med, setMed }: { med: "all" | "Oil" | "Watercolour"; setMed: (m: "all" | "Oil" | "Watercolour") => void }) {
  const btn = (active: boolean) => `rounded border px-2 py-0.5 text-xs tracking-widest ${active ? "border-stone-700 text-stone-800" : "border-stone-300 text-stone-400 hover:text-stone-600"}`;
  return (
    <div className="flex gap-1">
      {(["all", "Oil", "Watercolour"] as const).map((m) => (
        <button key={m} type="button" onClick={() => setMed(m)} className={btn(med === m)}>
          {m === "all" ? "ALL" : m === "Oil" ? "OIL" : "WC"}
        </button>
      ))}
    </div>
  );
}

function TierStripPanel({ rows }: { rows: GrainRow[] }) {
  const [med, setMed] = useState<"all" | "Oil" | "Watercolour">("all");
  const filtered = med === "all" ? rows : rows.filter((r) => r.medium_class === med);
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs tracking-widest text-stone-500">SOLD LOTS BY TIER (LOG £, RULE = TIER MEDIAN)</h2>
        <MediumToggle med={med} setMed={setMed} />
      </div>
      <TierStrip rows={filtered} />
      <Caption rows={filtered.filter(isAutograph)} />
      <Key
        items={[
          { colour: MEDIUM_COLOUR.Oil, label: "Oil" },
          { colour: MEDIUM_COLOUR.Watercolour, label: "Watercolour" },
          { colour: MEDIUM_COLOUR.Pastel, label: "Pastel/Mixed" },
          { colour: NONAUTO, label: "Non-autograph (excluded from stats)", shape: "cross" },
          { colour: "#44403c", label: "Tier median (autograph)", shape: "line" },
        ]}
      />
    </section>
  );
}

// ---------- size scatter (with medium toggle) ----------

function SizeScatter({ rows }: { rows: GrainRow[] }) {
  const withSize = rows.filter((r) => r.longest_cm != null && (r.longest_cm as number) > 0);
  const panels = withSize.filter((r) => parseSupport(r.medium_raw) === "panel");
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <XAxis type="number" dataKey="x" tickFormatter={(v: number) => `${v}cm`} tick={{ fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
        <YAxis type="number" dataKey="y" scale="log" domain={["auto", "auto"]} tickFormatter={(v: number) => gbp(v)} tick={{ fontSize: 11, fontFamily: "monospace" }} width={72} axisLine={false} tickLine={false} />
        <ZAxis range={[28, 28]} />
        <Tooltip content={<LotTooltip />} />
        {TIERS.map((t) => (
          <Scatter key={t} name={TIER_LABEL[t]} data={withSize.filter((r) => r.vtype_resolved === t).map((r) => ({ x: r.longest_cm, y: r.hammer_equiv_gbp, ...enrich(r) }))} fill={TIER_DOT[t]} fillOpacity={0.6} />
        ))}
        {/* condition-risk overlay: board/panel supports */}
        <Scatter name="Board/panel" data={panels.map((r) => ({ x: r.longest_cm, y: r.hammer_equiv_gbp, ...enrich(r) }))} fill="none" stroke={SUPPORT} shape="diamond" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function SizeScatterPanel({ rows }: { rows: GrainRow[] }) {
  const [med, setMed] = useState<"all" | "Oil" | "Watercolour">("all");
  const filtered = med === "all" ? rows : rows.filter((r) => r.medium_class === med);
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs tracking-widest text-stone-500">SIZE VS PRICE (IF EXIT DOTS SIT UP AND RIGHT, SPREAD IS SIZE-MIX)</h2>
        <MediumToggle med={med} setMed={setMed} />
      </div>
      <SizeScatter rows={filtered} />
      <Caption rows={filtered.filter((r) => r.longest_cm != null && (r.longest_cm as number) > 0)} />
      <Key
        items={[
          { colour: TIER_DOT.Buy_Regional, label: "Regional" },
          { colour: TIER_DOT.Straddle, label: "Straddle" },
          { colour: TIER_DOT.Exit_Strong, label: "Exit strong" },
          { colour: SUPPORT, label: "Board/panel (condition risk)", shape: "diamond" },
        ]}
      />
    </section>
  );
}

// ---------- paper size scatter ----------

function PaperSizeScatter({ rows, ceiling }: { rows: GrainRow[]; ceiling: number }) {
  const wc = rows.filter((r) => r.medium_class === "Watercolour" && r.longest_cm != null && (r.longest_cm as number) > 0);
  const fin = (r: GrainRow) => (r.sheet_grade ?? "").toLowerCase() === "finished";
  const finished = wc.filter(fin).map((r) => ({ x: r.longest_cm, y: r.hammer_equiv_gbp, ...enrich(r) }));
  const other = wc.filter((r) => !fin(r)).map((r) => ({ x: r.longest_cm, y: r.hammer_equiv_gbp, ...enrich(r) }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <XAxis type="number" dataKey="x" tickFormatter={(v: number) => `${v}cm`} tick={{ fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
        <YAxis type="number" dataKey="y" scale="log" domain={["auto", "auto"]} tickFormatter={(v: number) => gbp(v)} tick={{ fontSize: 11, fontFamily: "monospace" }} width={72} axisLine={false} tickLine={false} />
        <ZAxis range={[28, 28]} />
        <Tooltip content={<LotTooltip />} />
        <ReferenceLine y={ceiling} stroke="#44403c" strokeDasharray="4 3" label={{ value: `ceiling ${gbp(ceiling)}`, position: "insideTopRight", fontSize: 10 }} />
        <Scatter name="Finished" data={finished} fill={INZONE} fillOpacity={0.7} />
        <Scatter name="Sketch/other" data={other} fill="#c8b89a" fillOpacity={0.7} shape="triangle" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ---------- realisation ----------

function RealisationStrip({ rows }: { rows: GrainRow[] }) {
  const jitter = (r: GrainRow, i: number) => TIERS.indexOf(r.vtype_resolved as Tier) + ((((i * 37) % 13) / 13 - 0.5) * 0.55);
  const eligible = rows.filter((r) => r.est_mid_gbp != null && (r.est_mid_gbp as number) >= EST_FLOOR && r.hammer_equiv_gbp != null && (r.hammer_equiv_gbp as number) > 0);
  const pts = eligible.map((r, i) => ({ x: jitter(r, i), y: (r.hammer_equiv_gbp as number) / (r.est_mid_gbp as number), inzone: r.in_zone === true, ...enrich(r) }));
  const inzone = pts.filter((p) => p.inzone);
  const outzone = pts.filter((p) => !p.inzone);
  if (pts.length < 3) return <p className="text-xs text-stone-500 border border-stone-200 rounded p-4">Too few lots with an estimate above £{EST_FLOOR} to read realisation.</p>;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <XAxis type="number" dataKey="x" domain={[-0.5, 2.5]} ticks={[0, 1, 2]} tickFormatter={(v: number) => TIER_LABEL[TIERS[v]]} tick={{ fontSize: 11, letterSpacing: 2 }} axisLine={false} tickLine={false} />
        <YAxis type="number" dataKey="y" scale="log" domain={["auto", "auto"]} tickFormatter={(v: number) => `${Number(v).toFixed(2)}x`} tick={{ fontSize: 11, fontFamily: "monospace" }} width={56} axisLine={false} tickLine={false} />
        <ZAxis range={[28, 28]} />
        <Tooltip content={<LotTooltip />} />
        <ReferenceLine y={1} stroke="#44403c" strokeDasharray="4 3" label={{ value: "estimate", position: "insideTopRight", fontSize: 10 }} />
        {TIERS.map((t) => {
          const vals = eligible.filter((r) => r.vtype_resolved === t).map((r) => (r.hammer_equiv_gbp as number) / (r.est_mid_gbp as number));
          const m = median(vals);
          return m != null ? <ReferenceLine key={t} segment={[{ x: TIERS.indexOf(t) - 0.35, y: m }, { x: TIERS.indexOf(t) + 0.35, y: m }]} stroke="#7a6f5f" strokeWidth={2} /> : null;
        })}
        <Scatter name="In-zone" data={inzone} fill={INZONE} fillOpacity={0.55} />
        <Scatter name="Out of zone" data={outzone} fill={OUTZONE} fillOpacity={0.45} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function RealisationPanel({ rows }: { rows: GrainRow[] }) {
  const regional = rows.filter((r) => r.vtype_resolved === "Buy_Regional" && r.est_mid_gbp != null && (r.est_mid_gbp as number) >= EST_FLOOR);
  const regMed = median(regional.map((r) => (r.hammer_equiv_gbp as number) / (r.est_mid_gbp as number)));
  const eligible = rows.filter((r) => r.est_mid_gbp != null && (r.est_mid_gbp as number) >= EST_FLOOR);
  return (
    <section>
      <h2 className="text-xs tracking-widest text-stone-500 mb-2">
        REALISATION VS ESTIMATE BY TIER (BELOW 1.0 = DISCOUNT = ROOM)
        <InfoDot text={REALISATION_HELP} />
      </h2>
      {regMed != null && regional.length >= 5 && (
        <div className="mb-2 flex items-center gap-2">
          <Badge tone={regMed < 1 ? "ok" : "warn"}>{regMed.toFixed(2)}x REGIONAL</Badge>
          <span className="text-xs text-stone-500">{regMed < 1 ? "regional clears below estimate: genuine discount, room (test 2 pass)" : "regional competes to/above estimate: no room at the buy tier (test 2 fail)"}</span>
        </div>
      )}
      <RealisationStrip rows={rows} />
      <Caption rows={eligible} />
      <Key
        items={[
          { colour: INZONE, label: "In-zone" },
          { colour: OUTZONE, label: "Out of zone" },
          { colour: "#7a6f5f", label: "Tier median", shape: "line" },
          { colour: "#44403c", label: "Estimate (1.0)", shape: "dashed" },
        ]}
      />
    </section>
  );
}

// ---------- size-band spread table (§H test 3) ----------

function SizeBandTable({ rows }: { rows: GrainRow[] }) {
  // rows = autograph oil, already filtered by caller
  const bands = [
    { label: "<40cm", lo: 0, hi: 40 },
    { label: "40–60cm", lo: 40, hi: 60 },
    { label: "60–80cm", lo: 60, hi: 80 },
    { label: "80cm+", lo: 80, hi: Infinity },
  ];
  const sized = rows.filter((r) => r.longest_cm != null && (r.longest_cm as number) > 0);
  const rowsOut = bands.map((b) => {
    const inB = sized.filter((r) => (r.longest_cm as number) >= b.lo && (r.longest_cm as number) < b.hi);
    const reg = inB.filter((r) => r.vtype_resolved === "Buy_Regional").map((r) => r.hammer_equiv_gbp as number);
    const exit = inB.filter((r) => r.vtype_resolved === "Exit_Strong").map((r) => r.hammer_equiv_gbp as number);
    const rMed = median(reg);
    const eMed = median(exit);
    return { label: b.label, rMed, rN: reg.length, eMed, eN: exit.length, ratio: rMed && eMed ? eMed / rMed : null };
  });
  return (
    <section>
      <h2 className="text-xs tracking-widest text-stone-500 mb-2">
        SIZE-BANDED EXIT/REGIONAL (AUTOGRAPH OIL)
        <InfoDot text={SIZEBAND_HELP} />
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs tracking-widest text-stone-500">
              <th className="py-2">BAND</th>
              <th className="py-2 text-right">REGIONAL</th>
              <th className="py-2 text-right">EXIT</th>
              <th className="py-2 text-right">RATIO</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rowsOut.map((r) => {
              const thin = r.rN < 3 || r.eN < 3;
              return (
                <tr key={r.label} className="border-b border-stone-100">
                  <td className="py-2 font-sans">{r.label}</td>
                  <td className="py-2 text-right">{gbp(r.rMed)} <span className="text-stone-400">n={r.rN}</span></td>
                  <td className="py-2 text-right">{gbp(r.eMed)} <span className="text-stone-400">n={r.eN}</span></td>
                  <td className={`py-2 text-right ${thin ? "text-stone-400" : "text-stone-800"}`}>{r.ratio != null ? `${r.ratio.toFixed(2)}x` : "–"}{thin && r.ratio != null ? "*" : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-stone-500">
        Ratios marked * rest on fewer than 3 lots a side: ignore them. If the surviving bands stay near the headline ratio, the spread is real; if they collapse, it was size-mix (§H test 3).
      </p>
    </section>
  );
}

// ---------- time bubble ----------

function TimeBubble({ rows }: { rows: GrainRow[] }) {
  const pts = rows
    .filter((r) => r.hammer_equiv_gbp != null && (r.hammer_equiv_gbp as number) > 0 && !!r.sale_date)
    .map((r) => ({ t: new Date(r.sale_date).getTime(), y: r.hammer_equiv_gbp as number, size: r.longest_cm ?? 20, inzone: r.in_zone === true, ...enrich(r) }))
    .filter((p) => !Number.isNaN(p.t));
  if (pts.length < 3) return <p className="text-xs text-stone-500 border border-stone-200 rounded p-4">Too few dated sold lots to plot.</p>;
  const inzone = pts.filter((p) => p.inzone);
  const outzone = pts.filter((p) => !p.inzone);
  const byYear = new Map<number, number[]>();
  for (const p of pts) {
    const yr = new Date(p.t).getUTCFullYear();
    const arr = byYear.get(yr);
    if (arr) arr.push(p.y);
    else byYear.set(yr, [p.y]);
  }
  const medianLine = [...byYear.entries()].map(([yr, vals]) => ({ t: Date.UTC(yr, 6, 1), y: median(vals) as number })).sort((a, b) => a.t - b.t);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <XAxis type="number" dataKey="t" domain={["dataMin", "dataMax"]} tickFormatter={(t: number) => String(new Date(t).getUTCFullYear())} tick={{ fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
        <YAxis type="number" dataKey="y" scale="log" domain={["auto", "auto"]} tickFormatter={(v: number) => gbp(v)} tick={{ fontSize: 11, fontFamily: "monospace" }} width={72} axisLine={false} tickLine={false} />
        <ZAxis type="number" dataKey="size" range={[30, 460]} />
        <Tooltip content={<LotTooltip />} />
        <Scatter name="In-zone" data={inzone} fill={INZONE} fillOpacity={0.5} />
        <Scatter name="Out of zone" data={outzone} fill={OUTZONE} fillOpacity={0.4} />
        <Scatter name="Median by year" data={medianLine} fill="#44403c" line={{ stroke: "#44403c", strokeWidth: 1.5 }} shape="circle" legendType="line" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ---------- medium ledger ----------

function MediumLedger({ s }: { s: GrainStats }) {
  return (
    <div className="border border-stone-200 rounded divide-y divide-stone-200">
      {s.mediumLedger.map((m) => (
        <div key={m.medium} className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: MEDIUM_COLOUR[m.medium] ?? "#8a7d6b" }} />
            <span className="text-sm">{m.medium}</span>
          </div>
          <div className="font-mono text-sm">{gbp(m.med)} <span className="text-stone-400">n={m.n}</span></div>
        </div>
      ))}
    </div>
  );
}

// ---------- composed ----------

export function GrainPanels({ rows, artistId }: { rows: GrainRow[]; artistId: string }) {
  const sleeve = paperSleeve(artistId);
  const bounds = useMemo<[number, number]>(() => yearsOf(rows) ?? [2000, new Date().getUTCFullYear()], [rows]);
  const [from, setFrom] = useState(bounds[0]);
  const [to, setTo] = useState(bounds[1]);
  useEffect(() => { setFrom(bounds[0]); setTo(bounds[1]); }, [bounds]);

  const filteredRows = useMemo(
    () => rows.filter((r) => { const y = yearOf(r.sale_date); if (Number.isNaN(y)) return true; return y >= from && y <= to; }),
    [rows, from, to]
  );
  const s = useMemo(() => computeGrainStats(filteredRows), [filteredRows]);
  const oilRows = s.usable.filter((r) => r.medium_class === "Oil");
  const wcRows = s.usable.filter((r) => r.medium_class === "Watercolour");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-end">
        <YearRange bounds={bounds} from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </div>

      {!s.usable.length ? (
        <div className="text-sm text-stone-500 border border-stone-200 rounded p-6">
          No usable autograph UK sold rows in this window. Widen the year range, or check the grain has loaded for this name.
        </div>
      ) : (
        <>
          <section>
            {sleeve ? (
              <>
                <h2 className="text-xs tracking-widest text-stone-500 mb-2">PAPER SLEEVE: CEILING-RELATIVE READ (EXIT/REGIONAL SUPPRESSED)</h2>
                <CeilingBar s={s} ceiling={sleeve.ceiling} />
                <p className="mt-2 text-xs text-stone-500">Exit/Regional ratio is a category error for a paper-primary name: it divides premium finished sheets by cheap regional scraps. The bar above is the number that governs the bid.</p>
                {s.wcHasGrade && (
                  <div className="mt-4">
                    <h3 className="text-xs tracking-widest text-stone-500 mb-2">FINISHED VS SKETCH (UK SOLD WATERCOLOUR, AUTOGRAPH)</h3>
                    <PaperSplit s={s} />
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="text-xs tracking-widest text-stone-500 mb-2">CONFOUND DELTA: IF RAW BEATS CONTROLLED, THE RATIO IS MIX, NOT EDGE</h2>
                <KpiStrip s={s} />
              </>
            )}
          </section>

          <TierStripPanel rows={s.usableWithNonAuto} />

          {sleeve ? (
            <section>
              <h2 className="text-xs tracking-widest text-stone-500 mb-2">WATERCOLOUR SIZE VS PRICE (IS THE PAPER PREMIUM SIZE-DRIVEN?)</h2>
              <PaperSizeScatter rows={s.usable} ceiling={sleeve.ceiling} />
              <Caption rows={wcRows.filter((r) => r.longest_cm != null && (r.longest_cm as number) > 0)} />
              <Key items={[{ colour: INZONE, label: "Finished" }, { colour: "#c8b89a", label: "Sketch/other", shape: "triangle" }, { colour: "#44403c", label: "Ceiling", shape: "dashed" }]} />
            </section>
          ) : (
            <>
              <SizeScatterPanel rows={s.usable} />
              <SizeBandTable rows={oilRows} />
            </>
          )}

          <RealisationPanel rows={s.usable} />

          <section>
            <h2 className="text-xs tracking-widest text-stone-500 mb-2">
              {sleeve ? "WATERCOLOUR" : "OIL"} PRICE OVER TIME (BUBBLE = SIZE, COLOUR = IN-ZONE)
              <InfoDot text={TIMEBUBBLE_HELP} />
            </h2>
            <TimeBubble rows={sleeve ? wcRows : oilRows} />
            <Caption rows={sleeve ? wcRows : oilRows} />
            <Key items={[{ colour: INZONE, label: "In-zone" }, { colour: OUTZONE, label: "Out of zone" }, { colour: "#44403c", label: "Yearly median (descriptive)", shape: "line" }]} />
            <p className="mt-1 text-xs text-stone-500">Bubble = longest side. Autograph only. No trend fitted or projected (timing-as-signal is falsified).</p>
          </section>

          {/* Repeat-sale / flip tracker. Fed the year-filtered raw rows (unsold
              legs retained on purpose), not s.usable, so a bought-in lot that
              later re-lists is visible. Medium follows the page: paper for a
              sleeve name, oil otherwise. */}
          <RepeatPanel rows={filteredRows} medium={sleeve ? "Watercolour" : "Oil"} />

          <section>
            <h2 className="text-xs tracking-widest text-stone-500 mb-2">MEDIAN BY MEDIUM (UK SOLD, AUTOGRAPH, PRINT EXCLUDED)</h2>
            <MediumLedger s={s} />
          </section>
        </>
      )}
    </div>
  );
}
