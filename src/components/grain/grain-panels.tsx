// Grain Distortion Panel: surfaces tail, medium-mix and size-mix confounds
// behind headline Exit/Regional ratios. Render-only diagnostics; no gate logic
// lives here (gates stay in the rollup / scorer per the app contract).
//
// Reads the comps grain (spec §1 columns). Foreign rows are excluded from all
// statistics per §E geography discipline. N_GATE mirrors the §E Exit_Strong
// n >= 8 rule; keep in lockstep with desk_params if that ever becomes dynamic.

import { useMemo, type ReactNode } from "react";
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

export interface GrainRow {
  artist_id: string;
  medium_class: "Oil" | "Watercolour" | "Pastel" | "Mixed" | "Print";
  vtype_resolved: "Exit_Strong" | "Straddle" | "Buy_Regional" | "Foreign" | "UNMAPPED";
  hammer_equiv_gbp: number | null;
  longest_cm: number | null;
  status: string;
  in_zone: boolean | null;
  sale_date: string;
  title?: string | null;
}

const N_GATE = 8;
const TAIL_TRIM = 0.1; // strip top decile per tier for the tail-stripped ratio

const TIERS = ["Buy_Regional", "Straddle", "Exit_Strong"] as const;
type Tier = (typeof TIERS)[number];
const TIER_LABEL: Record<Tier, string> = {
  Buy_Regional: "REGIONAL",
  Straddle: "STRADDLE",
  Exit_Strong: "EXIT STRONG",
};

const MEDIUM_COLOUR: Record<string, string> = {
  Oil: "#1f5f5b", // teal: the mandate medium
  Watercolour: "#b8860b", // amber: paper sleeve
  Pastel: "#8a7d6b",
  Mixed: "#8a7d6b",
  Print: "#c0392b", // should never appear in stats; if visible, that is itself a flag
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
  usable: GrainRow[]; // Sold, UK, numeric hammer, non-Print
  mediumLedger: { medium: string; n: number; med: number | null }[];
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

  return {
    byTier,
    ratioRaw: div(byTier.Exit_Strong.med, byTier.Buy_Regional.med),
    ratioOil: div(byTier.Exit_Strong.medOil, byTier.Buy_Regional.medOil),
    ratioTrimmed: div(byTier.Exit_Strong.medTrimmed, byTier.Buy_Regional.medTrimmed),
    usable,
    mediumLedger,
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

// ---------- Panel 1: confound-delta KPI strip ----------

function KpiStrip({ s }: { s: GrainStats }) {
  const gated = s.byTier.Exit_Strong.n >= N_GATE;
  const gatedOil = s.byTier.Exit_Strong.nOil >= N_GATE;

  const delta = (controlled: number | null): string => {
    if (s.ratioRaw == null || controlled == null || s.ratioRaw === 0) return "–";
    const d = (s.ratioRaw - controlled) / s.ratioRaw;
    return `${d >= 0 ? "−" : "+"}${Math.abs(d * 100).toFixed(0)}%`;
  };

  const cells: {
    label: string;
    ratio: number | null;
    n: number;
    ok: boolean;
    delta?: string;
  }[] = [
    { label: "RAW", ratio: s.ratioRaw, n: s.byTier.Exit_Strong.n, ok: gated },
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
          </div>
          <div className="font-mono text-2xl">{ratioFmt(c.ratio)}</div>
          <div className="mt-1 flex items-center gap-2">
            <Badge tone={c.ok ? "ok" : "warn"}>{c.ok ? "TRUSTED" : "THIN"}</Badge>
            <span className="font-mono text-xs text-stone-500">n={c.n}</span>
            {c.delta && (
              <span className="font-mono text-xs text-stone-500">Δ {c.delta}</span>
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
    title: r.title ?? "",
    date: r.sale_date,
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

// ---------- Panel 3: size scatter (size-mix test) ----------

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

export function GrainPanels({ rows }: { rows: GrainRow[] }) {
  const s = useMemo(() => computeGrainStats(rows), [rows]);

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
        <h2 className="text-xs tracking-widest text-stone-500 mb-2">
          CONFOUND DELTA: IF RAW BEATS CONTROLLED, THE RATIO IS MIX, NOT EDGE
        </h2>
        <KpiStrip s={s} />
      </section>

      <section>
        <h2 className="text-xs tracking-widest text-stone-500 mb-2">
          SOLD LOTS BY TIER (LOG £, RULE = TIER MEDIAN, COLOUR = MEDIUM)
        </h2>
        <TierStrip s={s} />
      </section>

      <section>
        <h2 className="text-xs tracking-widest text-stone-500 mb-2">
          SIZE VS PRICE (IF EXIT DOTS SIT UP AND RIGHT, SPREAD IS SIZE-MIX)
        </h2>
        <SizeScatter s={s} />
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
