import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/art/app-shell";
import { Chip, EmptyState, Stat } from "@/components/art/primitives";
import { gbp } from "@/lib/art360";
import { fetchDeskConfigAll } from "@/lib/desk-ui";
import {
  fetchBudgetFull,
  fetchBuyBands,
  fetchDeskParamsFull,
  impliedCeiling,
  prettyArtist,
  previewBands,
  saveBudget,
} from "@/lib/desk-params";
import {
  applySleeveMultiple,
  fetchParamsHistory,
  fetchSleeveRows,
  previewCeiling,
  ratifyParams,
  rpcErrorText,
  type RatifyArgs,
} from "@/lib/desk-params-write";

export const Route = createFileRoute("/_authenticated/desk/params")({
  head: () => ({
    meta: [
      { title: "Desk params — Art360" },
      {
        name: "description",
        content:
          "The in-force desk parameters, the two sanctioned write paths, and the full ratification history.",
      },
      { property: "og:title", content: "Desk params — Art360" },
      {
        property: "og:description",
        content: "Ratify economic parameters, price the paper sleeve, and audit every params write.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeskParams,
});

const pctv = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const dt = (s: string | null) => (s ? s.slice(0, 16).replace("T", " ") : "—");

/* ---------------------------------------------------------------- inputs -- */

function NumField(p: {
  id: string;
  label: string;
  hint?: string;
  value: number | "";
  baseline: string;
  changed: boolean;
  step: number;
  min?: number;
  max?: number;
  onChange: (v: number | "") => void;
}) {
  return (
    <div>
      <label className="label-caps mb-1 block" htmlFor={p.id}>
        {p.label}
      </label>
      <input
        id={p.id}
        type="number"
        step={p.step}
        {...(p.min != null ? { min: p.min } : {})}
        {...(p.max != null ? { max: p.max } : {})}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className="num w-full rounded border border-border bg-background p-2 text-sm"
      />
      <p className="label-caps mt-1">
        {p.changed ? <span className="text-primary">was {p.baseline}</span> : `current ${p.baseline}`}
        {p.hint ? ` · ${p.hint}` : ""}
      </p>
    </div>
  );
}

function LockedRow({ label, value, tag }: { label: string; value: string; tag: string }) {
  return (
    <div className="min-w-0">
      <p className="label-caps truncate">{label}</p>
      <p className="num mt-1 text-base text-muted-foreground">{value}</p>
      <p className="label-caps mt-0.5 text-muted-foreground/70">{tag}</p>
    </div>
  );
}

/* ----------------------------------------------------------------- page --- */

function DeskParams() {
  const year = new Date().getFullYear();
  const qc = useQueryClient();

  const { data: params } = useQuery({ queryKey: ["desk-params-full"], queryFn: fetchDeskParamsFull });
  const { data: budget } = useQuery({ queryKey: ["desk-budget-full", year], queryFn: () => fetchBudgetFull(year) });
  const { data: bands } = useQuery({ queryKey: ["buy-bands"], queryFn: fetchBuyBands });
  const { data: config, isLoading } = useQuery({ queryKey: ["desk-config"], queryFn: fetchDeskConfigAll });
  const { data: sleeve } = useQuery({ queryKey: ["sleeve-config"], queryFn: fetchSleeveRows });
  const { data: history } = useQuery({ queryKey: ["desk-params-history"], queryFn: fetchParamsHistory });

  /* ---- section 1 draft: nothing is written until Ratify -------------------- */
  const [dFirmIn, setDFirmIn] = useState<number | "" | null>(null);
  const [dStretchIn, setDStretchIn] = useState<number | "" | null>(null);
  const [floorIn, setFloorIn] = useState<number | "" | null>(null);
  const [nGateIn, setNGateIn] = useState<number | "" | null>(null);
  const [capIn, setCapIn] = useState<number | "" | null>(null);
  const [maxWorkIn, setMaxWorkIn] = useState<number | "" | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const cur = params;
  const val = (draft: number | "" | null, base: number | null | undefined) =>
    draft === null || draft === "" ? (base ?? null) : draft;

  const dFirm = val(dFirmIn, cur?.collector_discount_firm) ?? 0.25;
  const dStretch = val(dStretchIn, cur?.collector_discount_stretch) ?? 0.1;
  const floor = val(floorIn, cur?.band_floor_gbp);
  const nGate = val(nGateIn, cur?.band_n_gate);
  const cap = val(capIn, cur?.band_factor_cap);
  const maxWork = val(maxWorkIn, cur?.max_work_gbp);

  const changed = {
    firm: cur != null && dFirm !== cur.collector_discount_firm,
    stretch: cur != null && dStretch !== cur.collector_discount_stretch,
    floor: cur != null && floor !== cur.band_floor_gbp,
    nGate: cur != null && nGate !== cur.band_n_gate,
    cap: cur != null && cap !== cur.band_factor_cap,
    maxWork: cur != null && maxWork !== cur.max_work_gbp,
  };
  const anyChanged = Object.values(changed).some(Boolean);

  const ratify = useMutation({
    mutationFn: () => {
      // Only changed fields travel; omitted ones copy forward inside the RPC.
      const args: RatifyArgs = {
        p_discount_firm: dFirm,
        p_discount_stretch: dStretch,
        p_note: note,
      };
      if (changed.floor && floor != null) args.p_band_floor_gbp = floor;
      if (changed.nGate && nGate != null) args.p_band_n_gate = nGate;
      if (changed.cap && cap != null) args.p_band_factor_cap = cap;
      if (changed.maxWork && maxWork != null) args.p_max_work_gbp = maxWork;
      return ratifyParams(args);
    },
    onSuccess: async () => {
      setErr(null);
      setOk("Params ratified. A new effective-dated row is in force.");
      setNote("");
      setDFirmIn(null); setDStretchIn(null); setFloorIn(null);
      setNGateIn(null); setCapIn(null); setMaxWorkIn(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["desk-params-full"] }),
        qc.invalidateQueries({ queryKey: ["desk-params"] }),
        qc.invalidateQueries({ queryKey: ["desk-params-current"] }),
        qc.invalidateQueries({ queryKey: ["desk-params-history"] }),
        qc.invalidateQueries({ queryKey: ["buy-bands"] }),
      ]);
    },
    // verbatim Postgres exception text; never rewritten to something friendlier
    onError: (e: unknown) => { setOk(null); setErr(rpcErrorText(e)); },
  });

  /* ---- section 2 sleeve ---------------------------------------------------- */
  const [multIn, setMultIn] = useState<number | "" | null>(null);
  const mult = val(multIn, cur?.sleeve_ceiling_multiple) ?? 0.45;
  const multDirty = cur != null && mult !== cur.sleeve_ceiling_multiple;
  const multValid = mult >= 0.3 && mult <= 0.6;

  const applySleeve = useMutation({
    mutationFn: () => applySleeveMultiple(mult),
    onSuccess: async () => {
      setErr(null);
      setOk(`Sleeve multiple applied at ${mult.toFixed(2)}. Paper ceilings rewritten.`);
      setMultIn(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["desk-params-full"] }),
        qc.invalidateQueries({ queryKey: ["desk-params-current"] }),
        qc.invalidateQueries({ queryKey: ["desk-params-history"] }),
        qc.invalidateQueries({ queryKey: ["sleeve-config"] }),
        qc.invalidateQueries({ queryKey: ["desk-config"] }),
        qc.invalidateQueries({ queryKey: ["book-screen"] }),
      ]);
    },
    onError: (e: unknown) => { setOk(null); setErr(rpcErrorText(e)); },
  });

  /* ---- band arithmetic preview (unchanged behaviour) ----------------------- */
  const env = budget?.envelope_gbp ?? 0;
  const tw = budget?.target_works ?? 5;
  const newCeiling = impliedCeiling(env, tw, dFirm);
  const preview = useMemo(
    () => (bands ? previewBands(bands, dFirm, newCeiling, floor ?? 2000) : []),
    [bands, dFirm, newCeiling, floor],
  );
  const core = useMemo(
    () =>
      preview
        .filter((b) => b.band_verdict === "Core" || b.crosses)
        .sort((a, b) => (b.recent_median_gbp ?? 0) - (a.recent_median_gbp ?? 0)),
    [preview],
  );

  /* ---- envelope ------------------------------------------------------------ */
  const [envelope, setEnvelope] = useState<number | null>(null);
  const [works, setWorks] = useState<number | null>(null);
  const envV = envelope ?? env;
  const twV = works ?? tw;
  const budgetDirty = budget != null && (envV !== budget.envelope_gbp || twV !== (budget.target_works ?? 5));
  const saveEnv = useMutation({
    mutationFn: () => saveBudget({ period_year: year, envelope_gbp: envV, target_works: twV }),
    onSuccess: async () => {
      setErr(null); setOk("Envelope saved.");
      setEnvelope(null); setWorks(null);
      await qc.invalidateQueries({ queryKey: ["desk-budget-full", year] });
      await qc.invalidateQueries({ queryKey: ["buy-bands"] });
    },
    onError: (e: unknown) => { setOk(null); setErr(rpcErrorText(e)); },
  });

  return (
    <AppShell
      eyebrow="Desk configuration"
      title="Params & per-name config"
      lede="Two sanctioned write paths, both effective-dated and both logged. desk_params is append-never-mutate: nothing on this page edits a row in place."
    >
      {err && (
        <pre className="wall-card mb-4 whitespace-pre-wrap border-l-2 border-l-destructive p-4 text-sm text-destructive">
          {err}
        </pre>
      )}
      {ok && <p className="wall-card mb-4 p-4 text-sm text-muted-foreground">{ok}</p>}

      {/* ---------------- 1. economic and governance ------------------------- */}
      {cur && (
        <div className="wall-card mb-6 p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <p className="label-caps">1 · Economic and governance</p>
            <span className="label-caps">in force since {dt(cur.effective_from)}</span>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField
              id="p-firm" label="Collector discount, firm" step={0.01} min={0.01} max={0.99}
              value={dFirmIn === null ? cur.collector_discount_firm : dFirmIn}
              baseline={pctv(cur.collector_discount_firm)} changed={changed.firm}
              onChange={setDFirmIn}
            />
            <NumField
              id="p-stretch" label="Collector discount, stretch" step={0.01} min={0.01} max={0.99}
              value={dStretchIn === null ? cur.collector_discount_stretch : dStretchIn}
              baseline={pctv(cur.collector_discount_stretch)} changed={changed.stretch}
              onChange={setDStretchIn}
            />
            <NumField
              id="p-floor" label="Band floor £" step={50} min={0}
              value={floorIn === null ? (cur.band_floor_gbp ?? "") : floorIn}
              baseline={cur.band_floor_gbp == null ? "—" : gbp(cur.band_floor_gbp)}
              changed={changed.floor} onChange={setFloorIn}
            />
            <NumField
              id="p-ngate" label="Band n-gate" step={1} min={1}
              value={nGateIn === null ? cur.band_n_gate : nGateIn}
              baseline={String(cur.band_n_gate)} changed={changed.nGate} onChange={setNGateIn}
            />
            <NumField
              id="p-cap" label="Band factor cap" step={0.05} min={1}
              value={capIn === null ? (cur.band_factor_cap ?? "") : capIn}
              baseline={cur.band_factor_cap?.toFixed(2) ?? "—"} changed={changed.cap} onChange={setCapIn}
            />
            <NumField
              id="p-maxwork" label="Max work £" step={250} min={1}
              value={maxWorkIn === null ? (cur.max_work_gbp ?? "") : maxWorkIn}
              baseline={cur.max_work_gbp == null ? "—" : gbp(cur.max_work_gbp)}
              changed={changed.maxWork} onChange={setMaxWorkIn}
            />
          </div>

          <label className="label-caps mb-2 block" htmlFor="ratify-note">
            Rationale (required)
          </label>
          <textarea
            id="ratify-note" rows={3} value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why this change, and what evidence supports it."
            className="mb-3 w-full rounded border border-border bg-background p-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!anyChanged || !note.trim() || ratify.isPending}
              onClick={() => ratify.mutate()}
              className="rounded border border-border px-4 py-2 text-sm disabled:opacity-40"
            >
              {ratify.isPending ? "Ratifying…" : "Ratify"}
            </button>
            {anyChanged && (
              <button
                type="button"
                onClick={() => {
                  setDFirmIn(null); setDStretchIn(null); setFloorIn(null);
                  setNGateIn(null); setCapIn(null); setMaxWorkIn(null);
                }}
                className="label-caps underline"
              >
                reset
              </button>
            )}
            {anyChanged && <Chip tone="ochre">unratified draft</Chip>}
          </div>
          <p className="label-caps mt-3">
            Only changed fields are sent; everything else copies forward inside ratify_desk_params.
            Validation lives in SQL — a refusal is shown verbatim.
          </p>
        </div>
      )}

      {/* ---------------- 2. paper sleeve ------------------------------------ */}
      {cur && (
        <div className="wall-card mb-6 p-5">
          <p className="label-caps mb-4">2 · Paper sleeve</p>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField
              id="p-sleeve" label="Sleeve ceiling multiple" step={0.01} min={0.3} max={0.6}
              value={multIn === null ? (cur.sleeve_ceiling_multiple ?? "") : multIn}
              baseline={cur.sleeve_ceiling_multiple?.toFixed(2) ?? "—"}
              changed={multDirty} hint="0.30–0.60" onChange={setMultIn}
            />
          </div>
          {!multValid && (
            <p className="mb-3 text-sm text-destructive">
              Multiple must sit between 0.30 and 0.60; the write will be refused.
            </p>
          )}

          <div className="overflow-hidden rounded border border-border">
            <div className="hidden grid-cols-[1fr_8rem_8rem_8rem] gap-4 border-b border-border px-4 py-2 sm:grid">
              {["Name", "In-zone WC median", "Ceiling now", `Ceiling at ${mult.toFixed(2)}`].map((h) => (
                <span key={h} className="label-caps">{h}</span>
              ))}
            </div>
            <ul>
              {(sleeve ?? []).map((s) => {
                const next = previewCeiling(s.inzone_finished_wc_median_gbp, mult);
                const moves = next !== (s.paper_ceiling_gbp ?? null);
                return (
                  <li
                    key={s.artist_id}
                    className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-border px-4 py-2 last:border-b-0 sm:grid-cols-[1fr_8rem_8rem_8rem] sm:items-baseline"
                  >
                    <span className="font-display text-sm">{prettyArtist(s.artist_id)}</span>
                    <span className="num text-xs text-muted-foreground">
                      {gbp(s.inzone_finished_wc_median_gbp)}
                    </span>
                    <span className="num text-xs text-muted-foreground">
                      {s.paper_ceiling_gbp == null ? "—" : gbp(s.paper_ceiling_gbp)}
                    </span>
                    <span className={`num text-sm ${moves ? "text-primary" : "text-foreground"}`}>
                      {gbp(next)}
                    </span>
                  </li>
                );
              })}
            </ul>
            {(sleeve ?? []).length === 0 && (
              <p className="label-caps px-4 py-3">No names carry an in-zone watercolour median.</p>
            )}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={!multDirty || !multValid || applySleeve.isPending}
              onClick={() => applySleeve.mutate()}
              className="rounded border border-border px-4 py-2 text-sm disabled:opacity-40"
            >
              {applySleeve.isPending ? "Applying…" : "Apply"}
            </button>
            {multDirty && <Chip tone="ochre">preview only, nothing written</Chip>}
          </div>
        </div>
      )}

      {/* ---------------- 3. read-only --------------------------------------- */}
      {cur && (
        <div className="wall-card mb-6 p-5">
          <p className="label-caps mb-4">3 · Read-only</p>
          <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <LockedRow label="VAT on premium" value={pctv(cur.vat_premium)} tag="statutory · locked" />
            <LockedRow label="ARR rate" value={pctv(cur.arr_rate)} tag="statutory · locked" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[
              ["Stale haircut", pctv(cur.stale_haircut)],
              ["Remote haircut", pctv(cur.remote_haircut)],
              ["BP default", pctv(cur.bp_pct_default)],
              ["n-gate", String(cur.n_gate)],
              ["Homogeneity threshold", pctv(cur.homogeneity_threshold)],
              ["Recency cutoff", String(cur.recency_cutoff)],
            ].map(([l, v]) => (
              <LockedRow key={l} label={l as string} value={v as string} tag="no write path: change via migration only" />
            ))}
          </div>
        </div>
      )}

      {/* ---------------- 4. history ----------------------------------------- */}
      <p className="label-caps mb-3">4 · History</p>
      {history && history.length === 0 && (
        <EmptyState title="No params rows" hint="Nothing has been ratified yet." />
      )}
      {history && history.length > 0 && (
        <div className="wall-card mb-8 overflow-hidden">
          <div className="hidden grid-cols-[10rem_1fr_10rem_8rem] gap-4 border-b border-border px-5 py-3 lg:grid">
            {["Effective from", "Note", "Source", "Role"].map((h) => (
              <span key={h} className="label-caps">{h}</span>
            ))}
          </div>
          <ul>
            {history.map((h) => (
              <li
                key={h.params_id}
                className={`grid grid-cols-1 gap-x-4 gap-y-1 border-b border-border px-5 py-3 last:border-b-0 lg:grid-cols-[10rem_1fr_10rem_8rem] lg:items-baseline ${
                  h.sanctioned ? "" : "border-l-2 border-l-destructive bg-destructive/5"
                }`}
              >
                <span className="num text-xs text-muted-foreground">{dt(h.effective_from)}</span>
                <span className="text-sm text-foreground">
                  {h.note ?? <span className="text-muted-foreground">no rationale recorded</span>}
                </span>
                <span className="label-caps">
                  {h.source ?? "unlogged"}
                  {!h.sanctioned && <Chip tone="ochre" className="ml-2">off-path write</Chip>}
                </span>
                <span className="num text-xs text-muted-foreground">{h.db_role ?? "—"}</span>
              </li>
            ))}
          </ul>
          <p className="label-caps px-5 py-3">
            Highlighted rows were not written by ratify_desk_params or apply_sleeve_multiple.
          </p>
        </div>
      )}

      {/* ---------------- envelope (unchanged) -------------------------------- */}
      {budget && (
        <div className="wall-card mb-6 p-5">
          <p className="label-caps mb-4">Envelope {budget.period_year}</p>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="label-caps mb-1 block" htmlFor="env">Envelope</label>
              <input
                id="env" type="number" step={500} value={envV}
                onChange={(e) => setEnvelope(Number(e.target.value))}
                className="num w-full rounded border border-border bg-background p-2 text-sm"
              />
            </div>
            <div>
              <label className="label-caps mb-1 block" htmlFor="tw">Target works</label>
              <input
                id="tw" type="number" step={1} min={1} value={twV}
                onChange={(e) => setWorks(Number(e.target.value))}
                className="num w-full rounded border border-border bg-background p-2 text-sm"
              />
            </div>
            <Stat label="Committed" value={gbp(budget.committed_gbp)} tone="ochre" />
            <Stat label="Remaining" value={gbp(budget.envelope_gbp - budget.committed_gbp)} tone="harbour" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Stat label="Implied band ceiling" value={gbp(newCeiling)} tone="harbour" />
            <button
              type="button"
              disabled={!budgetDirty || twV < 1 || saveEnv.isPending}
              onClick={() => saveEnv.mutate()}
              className="rounded border border-border px-4 py-2 text-sm disabled:opacity-40"
            >
              {saveEnv.isPending ? "Saving…" : "Save envelope"}
            </button>
          </div>
        </div>
      )}

      {/* ---------------- band arithmetic preview ----------------------------- */}
      {core.length > 0 && (
        <>
          <p className="label-caps mb-3">Buy bands at these settings</p>
          <div className="wall-card mb-8 overflow-hidden">
            <div className="hidden grid-cols-[1fr_5rem_6rem_4rem_5rem_6rem_6rem] gap-4 border-b border-border px-5 py-3 lg:grid">
              {["Name", "Band", "Recent med", "n rec", "Drift", "Firm", "All-in"].map((h) => (
                <span key={h} className="label-caps">{h}</span>
              ))}
            </div>
            <ul>
              {core.map((b) => (
                <li
                  key={`${b.artist_id}-${b.band_label}`}
                  className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-border px-5 py-3 last:border-b-0 lg:grid-cols-[1fr_5rem_6rem_4rem_5rem_6rem_6rem] lg:items-baseline"
                >
                  <span className="font-display text-sm text-foreground">
                    {prettyArtist(b.artist_id)}
                    {b.crosses === "enters" && <Chip tone="harbour">enters</Chip>}
                    {b.crosses === "leaves" && <Chip tone="ochre">leaves</Chip>}
                  </span>
                  <span className="label-caps">{b.band_label}</span>
                  <span className="num text-xs text-muted-foreground">{gbp(b.recent_median_gbp ?? 0)}</span>
                  <span className="num text-xs text-muted-foreground">{b.n_sold_recent}</span>
                  <span className="num text-xs text-muted-foreground">{b.recency_drift?.toFixed(2) ?? "—"}</span>
                  <span className="num text-sm text-foreground">{b.new_firm_gbp == null ? "—" : gbp(b.new_firm_gbp)}</span>
                  <span className="num text-xs text-muted-foreground">{b.new_all_in_gbp == null ? "—" : gbp(b.new_all_in_gbp)}</span>
                </li>
              ))}
            </ul>
            <p className="label-caps px-5 py-3">
              Arithmetic preview only. Verdicts re-cut server-side on ratify.
            </p>
          </div>
        </>
      )}

      {/* ---------------- per-name config ------------------------------------- */}
      <p className="label-caps mb-3">Per-name config</p>
      {isLoading && <p className="label-caps">Loading…</p>}
      {config && config.length > 0 && (
        <div className="wall-card overflow-hidden">
          <div className="hidden grid-cols-[1fr_9rem_5rem_5rem_6rem_5rem_7rem] gap-4 border-b border-border px-5 py-3 lg:grid">
            {["Name", "Class", "d firm", "d strch", "Floor", "Min cm", "Paper / ARR"].map((h) => (
              <span key={h} className="label-caps">{h}</span>
            ))}
          </div>
          <ul>
            {config.map((c) => (
              <li key={c.artist_id} className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-border px-5 py-3 last:border-b-0 hover:bg-secondary/40 lg:grid-cols-[1fr_9rem_5rem_5rem_6rem_5rem_7rem] lg:items-baseline">
                <span className="font-display text-sm text-foreground">{c.artist_name}</span>
                <span className="label-caps">{c.discount_class}</span>
                <span className="num text-xs text-muted-foreground">{c.discount_override_firm == null ? "—" : pctv(c.discount_override_firm)}</span>
                <span className="num text-xs text-muted-foreground">{c.discount_override_stretch == null ? "—" : pctv(c.discount_override_stretch)}</span>
                <span className="num text-xs text-muted-foreground">{gbp(c.commission_floor_gbp)}</span>
                <span className="num text-xs text-muted-foreground">{c.min_longest_cm ?? "—"}</span>
                <span className="flex flex-wrap gap-1">
                  {c.paper_ceiling_gbp != null && <Chip tone="harbour">paper {gbp(c.paper_ceiling_gbp)}</Chip>}
                  {c.arr_active_until && <Chip tone="ochre">ARR {c.arr_active_until}</Chip>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppShell>
  );
}
