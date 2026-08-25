// Grain Distortion Panel: surfaces tail, medium-mix and size-mix confounds
// behind headline Exit/Regional ratios. Render-only diagnostics; no gate logic
// lives here (gates stay in the rollup / scorer per the app contract).
//
// Paper-sleeve carve-out: for paper-primary names (§F: Roberts, Melville) the
// Exit/Regional ratio is a category error, so the ratio strip is replaced by a
// ceiling-relative bar. Paper detection is via @/lib/paper-sleeve.
//
// v3: shared year-range filter across all panels; rich per-lot hover cards
// (title/venue/date/tier/authorship/size/hammer); oil/WC toggle and
// non-autograph markers on the tier strip; per-chart n + year-range caption;
// finished-vs-sketch split for paper names.
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

export interface GrainRow {
  artist_id: string;
  medium_class: "Oil" | "Watercolour" | "Pastel" | "Mixed" | "Print";
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
}

const N_GATE = 8;
const TAIL_TRIM = 0.1;

const TIERS = ["Buy_Regional", "Straddle", "Exit_Strong"] as const;
type Tier = (typeof TIERS)[number];
const TIER_LABEL: Record<Tier, string> = {
  Buy_Regional: "REGIONAL",
  Straddle: "STRADDLE",
  Exit_Strong: "EXIT STRONG",
};

const MEDIUM_COLOUR: Record<string, string> = {
  Oil: "#1f5f5b",
  Watercolour: "#c2870a",
  Pastel: "#8a7d6b",
  Mixed: "#a58a5c",
  Print: "#c0392b",
};

// ---------- stats helpers ----------

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

const gbp = (v: number | null): string =>
  v == null ? "–" : `£${Math.round(v).toLocaleString("en-GB")}`;

const ratioFmt = (v: number | null): string => (v == null ? "–" : `${v.toFixed(2)}x`);

const yearOf = (d?: string | null): number => (d ? new Date(d).getUTCFullYear() : NaN);

const yearsOf = (rows: GrainRow[]): [number, number] | null => {
  const ys = rows.map((r) => yearOf(r.sale_date)).filter((y) => !Number.isNaN(y));
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
};

const isAutograph = (r: GrainRow) => !r.authorship || r.authorship === "Autograph";

// enrich a grain row into the payload every hover card reads
const enrich = (r: GrainRow) => ({
  title: r.title ?? null,
  venue: r.venue ?? null,
  date: r.sale_date,
  authorship: r.authorship ?? null,
  tier: r.vtype_resolved,
  medium: r.medium_class,
  size: r.longest_cm,
  hammer: r.hammer_equiv_gbp as number,
});

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
  usable: GrainRow[];
  mediumLedger: { medium: string; n: number; med: number | null }[];
  finishedWcMed: number | null;
  finishedWcN: number;
  sketchWcMed: number | null;
  sketchWcN: number;
  wcHasGrade: boolean;
}

export function computeGrainStats(rows: GrainRow[]): GrainStats {
  const usable = rows.filter(
    (r) =>
      r.status === "Sold" &&
      r.hammer_equiv_gbp != null &&
      r.hammer_equiv_gbp > 0 &&
      r.vtype_resolved !== "Foreign" &&
      r.vtype_resolved !== "UNMAPPED" &&
      r.medium_class !== "Print"
  );

  const byTier = {} as Record<Tier, TierStats>;
  for (const t of TIERS) {
    const vals = usable
      .filter((r) => r.vtype_resolved === t)
      .map((r) => r.hammer_equiv_gbp as number);
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
      const vals = usable
        .filter((r) => r.medium_class === m)
        .map((r) => r.hammer_equiv_gbp as number);
      return { medium: m, n: vals.length, med: median(vals) };
    })
    .filter((x) => x.n > 0);

  const wc = usable.filter((r) => r.medium_class === "Watercolour");
  const wcHasGrade = wc.some((r) => r.sheet_grade != null && r.sheet_grade !== "");
  const finishedRows = wcHasGrade
    ? wc.filter((r) => (r.sheet_grade ?? "").toLowerCase() === "finished")
    : wc;
  const sketchRows = wcHasGrade
    ? wc.filter((r) => (r.sheet_grade ?? "").toLowerCase() !== "finished")
    : [];
  const fVals = finishedRows.map((r) => r.hammer_equiv_gbp as number);
  const sVals = sketchRows.map((r) => r.hammer_equiv_gbp as number);

  return {
    byTier,
    ratioRaw: div(byTier.Exit_Strong.med, byTier.Buy_Regional.med),
    ratioOil: div(byTier.Exit_Strong.medOil, byTier.Buy_Regional.medOil),
    ratioTrimmed: div(byTier.Exit_Strong.medTrimmed, byTier.Buy_Regional.medTrimmed),
    usable,
    mediumLedger,
    finishedWcMed: median(fVals),
    finishedWcN: fVals.length,
    sketchWcMed: median(sVals),
    sketchWcN: sVals.length,
    wcHasGrade,
  };
}

// ---------- shared bits ----------

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
        <span className="absolute left-5 top-0 z-20 w-64 rounded border border-stone-200 bg-white p-3 text-xs font-normal normal-case leading-relaxed tracking-normal text-stone-600 shadow-md">
          {text}
        </span>
      )}
    </span>
  );
}

// Rich per-lot hover card. Reads the enriched payload, so it never money-formats
// a timestamp or doubles a unit (the earlier default-tooltip defects).
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
        <div>
          {date}
          {p.venue ? ` · ${p.venue}` : ""}
        </div>
        <div>
          {String(p.tier).replace(/_/g, " ")} · {p.medium}
          {p.size ? ` · ${Math.round(p.size)}cm` : ""}
        </div>
        {nonAuto && (
          <div className="text-red-700">{String(p.authorship).replace(/_/g, " ")}</div>
        )}
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
  RAW: "Exit-strong median divided by regional median. A high number looks like edge but is usually size or medium mix. Trust it only when n is 8 or more AND regional realisation is below 1.0. If RAW sits well above OIL ONLY or TAIL STRIPPED, the spread is mix, not a repeatable edge.",
  "OIL ONLY":
    "The same ratio, oils only, stripping watercolour and paper out of the mix. If it collapses versus RAW, the headline was paper bleed. If it reads higher than RAW (up arrow), it is a thin, different slice: treat with suspicion, not as a cleaner signal.",
  "TAIL STRIPPED":
    "The same ratio with the top decile removed per tier. If it collapses versus RAW, a few fat-tail lots drove the spread (the one-big-lot artefact), not something you can repeat.",
};

const CEILING_HELP =
  "Finished-watercolour median divided by your Paper_Ceiling. Below 1.0 means the market clears under your ceiling: room to buy on paper. At or above 1.0 means no room. This governs a paper bid; the oil-based Exit/Regional ratio is suppressed here as a category error.";

const TIMEBUBBLE_HELP =
  "Each bubble is one sold lot: date across, hammer up (log), bubble size is the painting's longest side, colour is in-zone versus out per the mandate. The line is the median by year and is descriptive only: no trend is fitted and nothing is projected forward.";

// ---------- year-range control ----------

function YearRange({
  bounds,
  from,
  to,
  setFrom,
  setTo,
}: {
  bounds: [number, number];
  from: number;
  to: number;
  setFrom: (n: number) => void;
  setTo: (n: number) => void;
}) {
  const years: number[] = [];
  for (let y = bounds[0]; y <= bounds[1]; y++) years.push(y);
  const sel =
    "rounded border border-stone-300 bg-white px-2 py-1 font-mono text-xs text-stone-700";
  const full = from === bounds[0] && to === bounds[1];
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="tracking-widest text-stone-500">YEARS</span>
      <select className={sel} value={from} onChange={(e) => setFrom(+e.target.value)}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <span className="text-stone-400">to</span>
      <select className={sel} value={to} onChange={(e) => setTo(+e.target.value)}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      {!full && (
        <button
          type="button"
          onClick={() => {
            setFrom(bounds[0]);
            setTo(bounds[1]);
          }}
          className="text-stone-500 underline hover:text-stone-700"
        >
          reset
        </button>
      )}
    </div>
  );
}

// ---------- Paper-sleeve ceiling bar ----------

function CeilingBar({ s, ceiling }: { s: GrainStats; ceiling: number }) {
  const med = s.finishedWcMed;
  const ratio = med != null && ceiling > 0 ? med / ceiling : null;
  const fillPct = ratio != null ? Math.min(100, ratio * 100) : 0;
  const room = ratio != null && ratio < 1;

  return (
    <div className="border border-stone-200 rounded p-5 bg-stone-50">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-sm">
          {s.wcHasGrade ? "Finished watercolour" : "Watercolour"} median (UK sold)
          <InfoDot text={CEILING_HELP} />
        </div>
        <div className="font-mono text-2xl">{gbp(med)}</div>
      </div>
      <div className="flex items-baseline justify-between mb-3 text-xs text-stone-500">
        <div>vs Paper_Ceiling {gbp(ceiling)}</div>
        <div className="font-mono">n={s.finishedWcN}</div>
      </div>

      <div className="relative h-4 bg-stone-200 rounded overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 ${room ? "bg-teal-700" : "bg-amber-600"}`}
          style={{ width: `${fillPct}%` }}
        />
        <div className="absolute inset-y-0 right-0 w-px bg-stone-800" />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Badge tone={room ? "ok" : "warn"}>
          {ratio != null ? `${ratio.toFixed(2)}x CEILING` : "NO DATA"}
        </Badge>
        <span className="text-xs text-stone-500">
          {room
            ? "clears below ceiling: room on paper"
            : ratio != null
              ? "at or above ceiling: no paper room"
              : "no finished-watercolour comps"}
        </span>
      </div>

      {!s.wcHasGrade && (
        <p className="mt-3 text-xs text-amber-700">
          sheet_grade absent from grain: bar uses all watercolour, not
          finished-only. Add Sheet_Grade to the comps export to make this exact.
        </p>
      )}
    </div>
  );
}

// finished vs sketch split, paper names only
function PaperSplit({ s }: { s: GrainStats }) {
  if (!s.wcHasGrade) return null;
  const rows = [
    { label: "Finished", med: s.finishedWcMed, n: s.finishedWcN, tone: "#c2870a" },
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
          <div className="font-mono text-sm">
            {gbp(r.med)} <span className="text-stone-400">n={r.n}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- confound-delta KPI strip (oil names) ----------

function KpiStrip({ s }: { s: GrainStats }) {
  const gated = s.byTier.Exit_Strong.n >= N_GATE;
  const gatedOil = s.byTier.Exit_Strong.nOil >= N_GATE;

  const delta = (controlled: number | null): { text: string; suspect: boolean } | null => {
    if (s.ratioRaw == null || controlled == null || s.ratioRaw === 0) return null;
    const d = (controlled - s.ratioRaw) / s.ratioRaw;
    return {
      text: `${d >= 0 ? "↑" : "↓"}${Math.abs(d * 100).toFixed(0)}% vs raw`,
      suspect: d > 0,
    };
  };

  const cells = [
    { label: "RAW", ratio: s.ratioRaw, n: s.byTier.Exit_Strong.n, ok: gated, delta: null as ReturnType<typeof delta> },
    { label: "OIL ONLY", ratio: s.ratioOil, n: s.byTier.Exit_Strong.nOil, ok: gatedOil, delta: delta(s.ratioOil) },
    { label: "TAIL STRIPPED", ratio: s.ratioTrimmed, n: s.byTier.Exit_Strong.n, ok: gated, delta: delta(s.ratioTrimmed) },
  ];

  return (
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
            {c.delta && (
              <span className={`font-mono text-xs ${c.delta.suspect ? "text-amber-700" : "text-stone-500"}`}>
                {c.delta.text}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- tier strip (with oil/WC toggle + non-autograph markers) ----------

function TierStrip({ rows }: { rows: GrainRow[] }) {
  const jitter = (r: GrainRow, i: number) =>
    TIERS.indexOf(r.vtype_resolved as Tier) + ((((i * 37) % 13) / 13 - 0.5) * 0.55);

  const auto = rows.filter(isAutograph);
  const nonAuto = rows.filter((r) => !isAutograph(r));

  const autoPts = auto.map((r, i) => ({ x: jitter(r, i), y: r.hammer_equiv_gbp as number, ...enrich(r) }));
  const nonAutoPts = nonAuto.map((r, i) => ({ x: jitter(r, i), y: r.hammer_equiv_gbp as number, ...enrich(r) }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <XAxis
          type="number"
          dataKey="x"
          domain={[-0.5, 2.5]}
          ticks={[0, 1, 2]}
          tickFormatter={(v: number) => TIER_LABEL[TIERS[v]]}
          tick={{ fontSize: 11, letterSpacing: 2 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="number"
          dataKey="y"
          scale="log"
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => gbp(v)}
          tick={{ fontSize: 11, fontFamily: "monospace" }}
          width={72}
          axisLine={false}
          tickLine={false}
        />
        <ZAxis range={[30, 30]} />
        <Tooltip content={<LotTooltip />} />
        {TIERS.map((t) => {
          const vals = rows.filter((r) => r.vtype_resolved === t).map((r) => r.hammer_equiv_gbp as number);
          const m = median(vals);
          return m != null ? (
            <ReferenceLine
              key={t}
              segment={[
                { x: TIERS.indexOf(t) - 0.35, y: m },
                { x: TIERS.indexOf(t) + 0.35, y: m },
              ]}
              stroke="#44403c"
              strokeWidth={2}
            />
          ) : null;
        })}
        {Object.keys(MEDIUM_COLOUR).map((mm) => (
          <Scatter
            key={mm}
            name={mm}
            data={autoPts.filter((d) => d.medium === mm)}
            fill={MEDIUM_COLOUR[mm]}
            fillOpacity={0.6}
          />
        ))}
        <Scatter name="Non-autograph" data={nonAutoPts} fill="#c0392b" shape="cross" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function TierStripPanel({ rows }: { rows: GrainRow[] }) {
  const [med, setMed] = useState<"all" | "Oil" | "Watercolour">("all");
  const filtered = med === "all" ? rows : rows.filter((r) => r.medium_class === med);
  const btn = (active: boolean) =>
    `rounded border px-2 py-0.5 text-xs tracking-widest ${active ? "border-stone-700 text-stone-800" : "border-stone-300 text-stone-400 hover:text-stone-600"}`;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs tracking-widest text-stone-500">
          SOLD LOTS BY TIER (LOG £, RULE = TIER MEDIAN)
        </h2>
        <div className="flex gap-1">
          {(["all", "Oil", "Watercolour"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMed(m)} className={btn(med === m)}>
              {m === "all" ? "ALL" : m === "Oil" ? "OIL" : "WC"}
            </button>
          ))}
        </div>
      </div>
      <TierStrip rows={filtered} />
      <Caption rows={filtered} />
      <p className="mt-1 text-xs text-stone-500">
        Colour = medium; red crosses = non-autograph (excluded from rollup stats,
        shown here to catch mis-tags).
      </p>
    </section>
  );
}

// ---------- size scatter (oil names) ----------

function SizeScatter({ rows }: { rows: GrainRow[] }) {
  const TIER_DOT: Record<Tier, string> = {
    Buy_Regional: "#8a7d6b",
    Straddle: "#c2870a",
    Exit_Strong: "#1f5f5b",
  };
  const withSize = rows.filter((r) => r.longest_cm != null && r.longest_cm > 0);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <XAxis type="number" dataKey="x" name="cm" tick={{ fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}cm`} />
        <YAxis type="number" dataKey="y" scale="log" domain={["auto", "auto"]} tickFormatter={(v: number) => gbp(v)} tick={{ fontSize: 11, fontFamily: "monospace" }} width={72} axisLine={false} tickLine={false} />
        <ZAxis range={[28, 28]} />
        <Tooltip content={<LotTooltip />} />
        {TIERS.map((t) => (
          <Scatter
            key={t}
            name={TIER_LABEL[t]}
            data={withSize.filter((r) => r.vtype_resolved === t).map((r) => ({ x: r.longest_cm, y: r.hammer_equiv_gbp, ...enrich(r) }))}
            fill={TIER_DOT[t]}
            fillOpacity={0.6}
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ---------- paper size scatter (paper names) ----------

function PaperSizeScatter({ rows, ceiling }: { rows: GrainRow[]; ceiling: number }) {
  const wc = rows.filter((r) => r.medium_class === "Watercolour" && r.longest_cm != null && r.longest_cm > 0);
  const fin = (r: GrainRow) => (r.sheet_grade ?? "").toLowerCase() === "finished";
  const finished = wc.filter(fin).map((r) => ({ x: r.longest_cm, y: r.hammer_equiv_gbp, ...enrich(r) }));
  const other = wc.filter((r) => !fin(r)).map((r) => ({ x: r.longest_cm, y: r.hammer_equiv_gbp, ...enrich(r) }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <XAxis type="number" dataKey="x" name="cm" tick={{ fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}cm`} />
        <YAxis type="number" dataKey="y" scale="log" domain={["auto", "auto"]} tickFormatter={(v: number) => gbp(v)} tick={{ fontSize: 11, fontFamily: "monospace" }} width={72} axisLine={false} tickLine={false} />
        <ZAxis range={[28, 28]} />
        <Tooltip content={<LotTooltip />} />
        <ReferenceLine y={ceiling} stroke="#44403c" strokeDasharray="4 3" label={{ value: `ceiling ${gbp(ceiling)}`, position: "insideTopRight", fontSize: 10 }} />
        {/* teal finished vs muted sketch: strong contrast so the two are separable */}
        <Scatter name="Finished" data={finished} fill="#1f5f5b" fillOpacity={0.7} />
        <Scatter name="Sketch/other" data={other} fill="#c8b89a" fillOpacity={0.7} shape="triangle" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ---------- time bubble ----------

function TimeBubble({ rows }: { rows: GrainRow[] }) {
  const pts = rows
    .filter((r) => r.hammer_equiv_gbp != null && r.hammer_equiv_gbp > 0 && !!r.sale_date)
    .map((r) => ({ t: new Date(r.sale_date).getTime(), y: r.hammer_equiv_gbp as number, size: r.longest_cm ?? 20, inzone: r.in_zone === true, ...enrich(r) }))
    .filter((p) => !Number.isNaN(p.t));

  if (pts.length < 3) {
    return <p className="text-xs text-stone-500 border border-stone-200 rounded p-4">Too few dated sold lots to plot.</p>;
  }

  const inzone = pts.filter((p) => p.inzone);
  const outzone = pts.filter((p) => !p.inzone);

  const byYear = new Map<number, number[]>();
  for (const p of pts) {
    const yr = new Date(p.t).getUTCFullYear();
    const arr = byYear.get(yr);
    if (arr) arr.push(p.y);
    else byYear.set(yr, [p.y]);
  }
  const medianLine = [...byYear.entries()]
    .map(([yr, vals]) => ({ t: Date.UTC(yr, 6, 1), y: median(vals) as number }))
    .sort((a, b) => a.t - b.t);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <XAxis type="number" dataKey="t" domain={["dataMin", "dataMax"]} tickFormatter={(t: number) => String(new Date(t).getUTCFullYear())} tick={{ fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
        <YAxis type="number" dataKey="y" scale="log" domain={["auto", "auto"]} tickFormatter={(v: number) => gbp(v)} tick={{ fontSize: 11, fontFamily: "monospace" }} width={72} axisLine={false} tickLine={false} />
        <ZAxis type="number" dataKey="size" range={[30, 460]} />
        <Tooltip content={<LotTooltip />} />
        <Scatter name="In-zone" data={inzone} fill="#1f5f5b" fillOpacity={0.5} />
        <Scatter name="Out of zone" data={outzone} fill="#c2870a" fillOpacity={0.4} />
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
          <div className="font-mono text-sm">
            {gbp(m.med)} <span className="text-stone-400">n={m.n}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- composed panel ----------

export function GrainPanels({ rows, artistId }: { rows: GrainRow[]; artistId: string }) {
  const sleeve = paperSleeve(artistId);
  const bounds = useMemo<[number, number]>(
    () => yearsOf(rows) ?? [2000, new Date().getUTCFullYear()],
    [rows]
  );
  const [from, setFrom] = useState(bounds[0]);
  const [to, setTo] = useState(bounds[1]);
  useEffect(() => {
    setFrom(bounds[0]);
    setTo(bounds[1]);
  }, [bounds]);

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        const y = yearOf(r.sale_date);
        if (Number.isNaN(y)) return true; // keep undated for the non-time charts
        return y >= from && y <= to;
      }),
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
          No usable UK sold rows in this window. Widen the year range, or check
          the grain has loaded for this name.
        </div>
      ) : (
        <>
          <section>
            {sleeve ? (
              <>
                <h2 className="text-xs tracking-widest text-stone-500 mb-2">
                  PAPER SLEEVE: CEILING-RELATIVE READ (EXIT/REGIONAL SUPPRESSED)
                </h2>
                <CeilingBar s={s} ceiling={sleeve.ceiling} />
                <p className="mt-2 text-xs text-stone-500">
                  Exit/Regional ratio is a category error for a paper-primary
                  name: it divides premium finished sheets by cheap regional
                  scraps. The bar above is the number that governs the bid.
                </p>
                {s.wcHasGrade && (
                  <div className="mt-4">
                    <h3 className="text-xs tracking-widest text-stone-500 mb-2">
                      FINISHED VS SKETCH (UK SOLD WATERCOLOUR)
                    </h3>
                    <PaperSplit s={s} />
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="text-xs tracking-widest text-stone-500 mb-2">
                  CONFOUND DELTA: IF RAW BEATS CONTROLLED, THE RATIO IS MIX, NOT EDGE
                </h2>
                <KpiStrip s={s} />
              </>
            )}
          </section>

          <TierStripPanel rows={s.usable} />

          {!sleeve ? (
            <section>
              <h2 className="text-xs tracking-widest text-stone-500 mb-2">
                SIZE VS PRICE (IF EXIT DOTS SIT UP AND RIGHT, SPREAD IS SIZE-MIX)
              </h2>
              <SizeScatter rows={s.usable} />
              <Caption rows={s.usable.filter((r) => r.longest_cm != null && r.longest_cm > 0)} />
            </section>
          ) : (
            <section>
              <h2 className="text-xs tracking-widest text-stone-500 mb-2">
                WATERCOLOUR SIZE VS PRICE (IS THE PAPER PREMIUM SIZE-DRIVEN?)
              </h2>
              <PaperSizeScatter rows={s.usable} ceiling={sleeve.ceiling} />
              <Caption rows={wcRows.filter((r) => r.longest_cm != null && r.longest_cm > 0)} />
              <p className="mt-2 text-xs text-stone-500">
                Finished sheets teal, sketches/other muted triangles. Points above
                the dashed ceiling are the fat-tail optionality: which sheets to
                chase.
              </p>
            </section>
          )}

          <section>
            <h2 className="text-xs tracking-widest text-stone-500 mb-2">
              {sleeve ? "WATERCOLOUR" : "OIL"} PRICE OVER TIME (BUBBLE = SIZE, COLOUR = IN-ZONE)
              <InfoDot text={TIMEBUBBLE_HELP} />
            </h2>
            <TimeBubble rows={sleeve ? wcRows : oilRows} />
            <Caption rows={sleeve ? wcRows : oilRows} />
            <p className="mt-2 text-xs text-stone-500">
              Teal in-zone, amber out of zone; line is the yearly median.
              Descriptive drift only: no trend is fitted or projected
              (timing-as-signal is a falsified thesis).
            </p>
          </section>

          <section>
            <h2 className="text-xs tracking-widest text-stone-500 mb-2">
              MEDIAN BY MEDIUM (UK SOLD, PRINT EXCLUDED)
            </h2>
            <MediumLedger s={s} />
          </section>
        </>
      )}
    </div>
  );
}
