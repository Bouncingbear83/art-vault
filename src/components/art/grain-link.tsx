// Grain Distortion Panel: surfaces tail, medium-mix and size-mix confounds
// behind headline Exit/Regional ratios. Render-only diagnostics; no gate logic
// lives here (gates stay in the rollup / scorer per the app contract).
//
// v2 adds the paper-sleeve carve-out. For paper-primary names (Mandate §F: a
// closed two-name set, Roberts + Melville) the Exit/Regional ratio is a
// category error: it divides a premium-finished-sheet exit median by a
// cheap-scrap regional median, two non-comparable populations. So for those
// names the ratio strip is suppressed and replaced by a ceiling-relative bar
// (finished-watercolour median vs the stored Paper_Ceiling), which is the
// number that actually governs a paper bid.
//
// Reads the comps grain (spec §1 columns). Foreign rows excluded per §E.
// N_GATE mirrors the §E Exit_Strong n >= 8 rule.

import { useMemo, useState, type ReactNode } from "react";
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
}

const N_GATE = 8;
const TAIL_TRIM = 0.1;

// Paper sub-sleeve (Roberts, Melville) is resolved via the shared
// @/lib/paper-sleeve module so the list stays canonical in one place.

const TIERS = ["Buy_Regional", "Straddle", "Exit_Strong"] as const;
type Tier = (typeof TIERS)[number];
const TIER_LABEL: Record<Tier, string> = {
  Buy_Regional: "REGIONAL",
  Straddle: "STRADDLE",
  Exit_Strong: "EXIT STRONG",
};

const MEDIUM_COLOUR: Record<string, string> = {
  Oil: "#1f5f5b",
  Watercolour: "#b8860b",
  Pastel: "#8a7d6b",
  Mixed: "#8a7d6b",
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
  v == null ? "\u2013" : `\u00a3${Math.round(v).toLocaleString("en-GB")}`;

const ratioFmt = (v: number | null): string => (v == null ? "\u2013" : `${v.toFixed(2)}x`);

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
  finishedWcMed: number | null; // finished-watercolour UK median (paper ceiling comparator)
  finishedWcN: number;
  wcHasGrade: boolean; // false => sheet_grade absent, ceiling bar falls back to all-watercolour
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

  // finished-watercolour median for the ceiling comparator. §F derives the
  // ceiling on FINISHED sheets, so compare like-for-like. If sheet_grade is
  // absent from the grain, fall back to all-watercolour and flag it.
  const wc = usable.filter((r) => r.medium_class === "Watercolour");
  const wcHasGrade = wc.some((r) => r.sheet_grade != null && r.sheet_grade !== "");
  const wcFinished = wcHasGrade
    ? wc.filter((r) => (r.sheet_grade ?? "").toLowerCase() === "finished")
    : wc;
  const wcVals = wcFinished.map((r) => r.hammer_equiv_gbp as number);

  return {
    byTier,
    ratioRaw: div(byTier.Exit_Strong.med, byTier.Buy_Regional.med),
    ratioOil: div(byTier.Exit_Strong.medOil, byTier.Buy_Regional.medOil),
    ratioTrimmed: div(byTier.Exit_Strong.medTrimmed, byTier.Buy_Regional.medTrimmed),
    usable,
    mediumLedger,
    finishedWcMed: median(wcVals),
    finishedWcN: wcVals.length,
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

// Dependency-free info tooltip. Click/tap toggles; blur closes. Kept local so
// the panel carries its own explainers without assuming a shadcn Tooltip.
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

// KPI explainer copy, written from the §E/§H rules so it is name-specific, not
// generic. Each says what good looks like and what the number is telling you.
const KPI_HELP: Record<string, string> = {
  RAW: "Exit-strong median divided by regional median. A high number looks like edge but is usually size or medium mix. Trust it only when n is 8 or more AND regional realisation is below 1.0. If RAW sits well above the OIL ONLY or TAIL STRIPPED cells, the spread is mix, not a repeatable edge.",
  "OIL ONLY":
    "The same ratio, oils only, stripping watercolour and paper out of the mix. If it collapses versus RAW, the headline was paper bleed. If it reads higher than RAW (up arrow), it is a thin, different slice: treat it with suspicion, not as a cleaner signal.",
  "TAIL STRIPPED":
    "The same ratio with the top decile removed per tier. If it collapses versus RAW, a few fat-tail lots drove the spread (the classic one-big-lot artefact), not something you can repeat.",
};

const CEILING_HELP =
  "Finished-watercolour median divided by your Paper_Ceiling. Below 1.0 means the market clears under your ceiling: room to buy on paper. At or above 1.0 means the market is already at or above your ceiling: no room. This governs a paper bid; the oil-based Exit/Regional ratio is suppressed here as a category error.";

const TIMEBUBBLE_HELP =
  "Each bubble is one sold lot: date across, hammer up (log), bubble size is the painting's longest side, colour is in-zone versus out per the mandate. The line is the median by year and is descriptive only: no trend is fitted and nothing is projected forward.";

// ---------- Paper-sleeve ceiling bar (replaces the ratio strip for §F names) ----------

function CeilingBar({
  s,
  ceiling,
}: {
  s: GrainStats;
  ceiling: number;
}) {
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
        {/* ceiling marker at 100% */}
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

// ---------- Panel 1: confound-delta KPI strip (oil names only) ----------

function KpiStrip({ s }: { s: GrainStats }) {
  const gated = s.byTier.Exit_Strong.n >= N_GATE;
  const gatedOil = s.byTier.Exit_Strong.nOil >= N_GATE;

  // Δ reads as: how far the controlled ratio moves off raw, direction explicit.
  // down = control removed inflation (mix stripped, the healthy case);
  // up = controlled ratio is HIGHER (thin different slice, treat with suspicion).
  const delta = (controlled: number | null): { text: string; suspect: boolean } | null => {
    if (s.ratioRaw == null || controlled == null || s.ratioRaw === 0) return null;
    const d = (controlled - s.ratioRaw) / s.ratioRaw;
    return {
      text: `${d >= 0 ? "\u2191" : "\u2193"}${Math.abs(d * 100).toFixed(0)}% vs raw`,
      suspect: d > 0,
    };
  };

  const cells: {
    label: string;
    ratio: number | null;
    n: number;
    ok: boolean;
    delta: { text: string; suspect: boolean } | null;
  }[] = [
    { label: "RAW", ratio: s.ratioRaw, n: s.byTier.Exit_Strong.n, ok: gated, delta: null },
    {
      label: "OIL ONLY",
      ratio: s.ratioOil,
      n: s.byTier.Exit_Strong.nOil,
      ok: gatedOil,
      delta: delta(s.ratioOil),
    },
    {
      label: "TAIL STRIPPED",
      ratio: s.ratioTrimmed,
      n: s.byTier.Exit_Strong.n,
      ok: gated,
      delta: delta(s.ratioTrimmed),
    },
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
              <span
                className={`font-mono text-xs ${c.delta.suspect ? "text-amber-700" : "text-stone-500"}`}
              >
                {c.delta.text}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Panel 2: tier strip plot (log £) ----------

function TierStrip({ s }: { s: GrainStats }) {
  const data = s.usable.map((r, i) => ({
    x: TIERS.indexOf(r.vtype_resolved as Tier) + ((((i * 37) % 13) / 13 - 0.5) * 0.55),
    y: r.hammer_equiv_gbp as number,
    medium: r.medium_class,
  }));

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
        <ZAxis range={[28, 28]} />
        <Tooltip
          formatter={(v: number) => gbp(v)}
          labelFormatter={() => ""}
          contentStyle={{ fontFamily: "monospace", fontSize: 12 }}
        />
        {TIERS.map((t) =>
          s.byTier[t].med != null ? (
            <ReferenceLine
              key={t}
              segment={[
                { x: TIERS.indexOf(t) - 0.35, y: s.byTier[t].med as number },
                { x: TIERS.indexOf(t) + 0.35, y: s.byTier[t].med as number },
              ]}
              stroke="#44403c"
              strokeWidth={2}
            />
          ) : null
        )}
        {Object.keys(MEDIUM_COLOUR).map((m) => (
          <Scatter
            key={m}
            name={m}
            data={data.filter((d) => d.medium === m)}
            fill={MEDIUM_COLOUR[m]}
            fillOpacity={0.55}
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ---------- Panel 3: size scatter ----------

function SizeScatter({ s }: { s: GrainStats }) {
  const withSize = s.usable.filter((r) => r.longest_cm != null && r.longest_cm > 0);
  const TIER_DOT: Record<Tier, string> = {
    Buy_Regional: "#8a7d6b",
    Straddle: "#b8860b",
    Exit_Strong: "#1f5f5b",
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <XAxis
          type="number"
          dataKey="x"
          name="Longest cm"
          unit="cm"
          tick={{ fontSize: 11, fontFamily: "monospace" }}
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
        <ZAxis range={[26, 26]} />
        <Tooltip
          formatter={(v: number, name: string) => (name === "Longest cm" ? `${v}cm` : gbp(v))}
          contentStyle={{ fontFamily: "monospace", fontSize: 12 }}
        />
        {TIERS.map((t) => (
          <Scatter
            key={t}
            name={TIER_LABEL[t]}
            data={withSize
              .filter((r) => r.vtype_resolved === t)
              .map((r) => ({ x: r.longest_cm, y: r.hammer_equiv_gbp }))}
            fill={TIER_DOT[t]}
            fillOpacity={0.55}
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ---------- Paper scatter: watercolour size vs price (paper names only) ----------
// Diagnoses whether the paper premium is size-driven, and which finished sheets
// clear ABOVE the ceiling (the fat-tail optionality §F flags). The tier strip
// showed watercolours climbing £150 -> £11k across tiers; this asks why.

function PaperSizeScatter({ s, ceiling }: { s: GrainStats; ceiling: number }) {
  const wc = s.usable.filter(
    (r) => r.medium_class === "Watercolour" && r.longest_cm != null && r.longest_cm > 0
  );
  const isFinished = (r: GrainRow) => (r.sheet_grade ?? "").toLowerCase() === "finished";
  const finished = wc
    .filter(isFinished)
    .map((r) => ({ x: r.longest_cm, y: r.hammer_equiv_gbp }));
  const other = wc
    .filter((r) => !isFinished(r))
    .map((r) => ({ x: r.longest_cm, y: r.hammer_equiv_gbp }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <XAxis
          type="number"
          dataKey="x"
          name="Longest cm"
          unit="cm"
          tick={{ fontSize: 11, fontFamily: "monospace" }}
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
        <ZAxis range={[28, 28]} />
        <Tooltip
          formatter={(v: number, name: string) => (name === "Longest cm" ? `${v}cm` : gbp(v))}
          contentStyle={{ fontFamily: "monospace", fontSize: 12 }}
        />
        <ReferenceLine
          y={ceiling}
          stroke="#44403c"
          strokeDasharray="4 3"
          label={{ value: `ceiling ${gbp(ceiling)}`, position: "insideTopRight", fontSize: 10 }}
        />
        <Scatter name="Finished" data={finished} fill="#b8860b" fillOpacity={0.65} />
        <Scatter name="Sketch/other" data={other} fill="#8a7d6b" fillOpacity={0.45} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ---------- Time bubble: date x, price y, bubble=size, colour=in-zone ----------
// Descriptive drift only. Answers "is the in-zone gate paying, and is the name
// re-rating up or down over time" WITHOUT fitting or projecting a trend: the
// timing-as-signal thesis is falsified, so this stays a rear-view mirror.

function TimeBubble({ rows, title }: { rows: GrainRow[]; title: string }) {
  const pts = rows
    .filter((r) => r.hammer_equiv_gbp != null && r.hammer_equiv_gbp > 0 && !!r.sale_date)
    .map((r) => ({
      t: new Date(r.sale_date).getTime(),
      y: r.hammer_equiv_gbp as number,
      size: r.longest_cm ?? 20,
      inzone: r.in_zone === true,
    }))
    .filter((p) => !Number.isNaN(p.t));

  if (pts.length < 3) {
    return (
      <p className="text-xs text-stone-500 border border-stone-200 rounded p-4">
        Too few dated sold lots to plot.
      </p>
    );
  }

  const inzone = pts.filter((p) => p.inzone);
  const outzone = pts.filter((p) => !p.inzone);

  // yearly median, descriptive: no extrapolation beyond observed years
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

  const yearTick = (t: number) => String(new Date(t).getUTCFullYear());

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <XAxis
          type="number"
          dataKey="t"
          domain={["dataMin", "dataMax"]}
          tickFormatter={yearTick}
          tick={{ fontSize: 11, fontFamily: "monospace" }}
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
        <ZAxis type="number" dataKey="size" range={[30, 460]} name="Longest cm" unit="cm" />
        <Tooltip
          formatter={(v: number, name: string) =>
            name === "Longest cm" ? `${Math.round(v)}cm` : gbp(v)
          }
          labelFormatter={(t: number) => new Date(t).toLocaleDateString("en-GB")}
          contentStyle={{ fontFamily: "monospace", fontSize: 12 }}
        />
        <Scatter name="In-zone" data={inzone} fill="#1f5f5b" fillOpacity={0.5} />
        <Scatter name="Out of zone" data={outzone} fill="#8a7d6b" fillOpacity={0.4} />
        {/* descriptive yearly-median spine */}
        <Scatter
          name="Median by year"
          data={medianLine}
          fill="#44403c"
          line={{ stroke: "#44403c", strokeWidth: 1.5 }}
          shape="circle"
          legendType="line"
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ---------- Panel 4: medium ledger ----------

function MediumLedger({ s }: { s: GrainStats }) {
  return (
    <div className="border border-stone-200 rounded divide-y divide-stone-200">
      {s.mediumLedger.map((m) => (
        <div key={m.medium} className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: MEDIUM_COLOUR[m.medium] ?? "#8a7d6b" }}
            />
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
  const s = useMemo(() => computeGrainStats(rows), [rows]);
  const sleeve = paperSleeve(artistId);

  if (!s.usable.length) {
    return (
      <div className="text-sm text-stone-500 border border-stone-200 rounded p-6">
        No usable UK sold rows for this name. Check artist_id, or the grain has
        not been loaded for this name yet.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        {sleeve ? (
          <>
            <h2 className="text-xs tracking-widest text-stone-500 mb-2">
              PAPER SLEEVE: CEILING-RELATIVE READ (EXIT/REGIONAL SUPPRESSED)
            </h2>
            <CeilingBar s={s} ceiling={sleeve.ceiling} />
            <p className="mt-2 text-xs text-stone-500">
              Exit/Regional ratio is a category error for a paper-primary name:
              it divides premium finished sheets by cheap regional scraps. The
              bar above is the number that governs the bid.
            </p>
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

      <section>
        <h2 className="text-xs tracking-widest text-stone-500 mb-2">
          SOLD LOTS BY TIER (LOG £, RULE = TIER MEDIAN, COLOUR = MEDIUM)
        </h2>
        <TierStrip s={s} />
      </section>

      {!sleeve ? (
        <section>
          <h2 className="text-xs tracking-widest text-stone-500 mb-2">
            SIZE VS PRICE (IF EXIT DOTS SIT UP AND RIGHT, SPREAD IS SIZE-MIX)
          </h2>
          <SizeScatter s={s} />
        </section>
      ) : (
        <section>
          <h2 className="text-xs tracking-widest text-stone-500 mb-2">
            WATERCOLOUR SIZE VS PRICE (IS THE PAPER PREMIUM SIZE-DRIVEN?)
          </h2>
          <PaperSizeScatter s={s} ceiling={sleeve.ceiling} />
          <p className="mt-2 text-xs text-stone-500">
            Finished sheets in amber, sketches/other muted. Points above the
            dashed ceiling are the fat-tail optionality: which sheets to chase.
          </p>
        </section>
      )}

      <section>
        <h2 className="text-xs tracking-widest text-stone-500 mb-2">
          {sleeve ? "WATERCOLOUR" : "OIL"} PRICE OVER TIME (BUBBLE = SIZE, COLOUR = IN-ZONE)
          <InfoDot text={TIMEBUBBLE_HELP} />
        </h2>
        <TimeBubble
          rows={s.usable.filter(
            (r) => r.medium_class === (sleeve ? "Watercolour" : "Oil")
          )}
          title={sleeve ? "watercolour" : "oil"}
        />
        <p className="mt-2 text-xs text-stone-500">
          Teal in-zone, muted out of zone; line is the yearly median. Descriptive
          drift only: no trend is fitted or projected (timing-as-signal is a
          falsified thesis).
        </p>
      </section>

      <section>
        <h2 className="text-xs tracking-widest text-stone-500 mb-2">
          MEDIAN BY MEDIUM (UK SOLD, PRINT EXCLUDED)
        </h2>
        <MediumLedger s={s} />
      </section>
    </div>
  );
}
