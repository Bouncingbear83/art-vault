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
  ratifyDeskParams,
  saveBudget,
} from "@/lib/desk-params";

export const Route = createFileRoute("/_authenticated/desk/params")({
  head: () => ({
    meta: [
      { title: "Desk params — Art360" },
      { name: "description", content: "The in-force desk parameters and per-name collector config." },
    ],
  }),
  component: DeskParams,
});

const pctv = (n: number | null | undefined) =>
  n == null ? "—" : `${Math.round(n * 100)}%`;

function DeskParams() {
  const year = new Date().getFullYear();
  const qc = useQueryClient();

  const { data: params } = useQuery({ queryKey: ["desk-params-full"], queryFn: fetchDeskParamsFull });
  const { data: budget } = useQuery({ queryKey: ["desk-budget-full", year], queryFn: () => fetchBudgetFull(year) });
  const { data: bands } = useQuery({ queryKey: ["buy-bands"], queryFn: fetchBuyBands });
  const { data: config, isLoading } = useQuery({ queryKey: ["desk-config"], queryFn: fetchDeskConfigAll });

  /* ---- draft state: the sliders move freely, nothing is written until Ratify --- */
  const [draftFirm, setDraftFirm] = useState<number | null>(null);
  const [draftStretch, setDraftStretch] = useState<number | null>(null);
  const [draftFloor, setDraftFloor] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [envelope, setEnvelope] = useState<number | null>(null);
  const [works, setWorks] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const dFirm = draftFirm ?? params?.collector_discount_firm ?? 0.25;
  const dStretch = draftStretch ?? params?.collector_discount_stretch ?? 0.1;
  const floor = draftFloor ?? params?.band_floor_gbp ?? 2000;
  const env = envelope ?? budget?.envelope_gbp ?? 0;
  const tw = works ?? budget?.target_works ?? 5;

  const dirty =
    params != null &&
    (dFirm !== params.collector_discount_firm ||
      dStretch !== params.collector_discount_stretch ||
      floor !== (params.band_floor_gbp ?? 2000));

  const budgetDirty =
    budget != null && (env !== budget.envelope_gbp || tw !== (budget.target_works ?? 5));

  const liveCeiling = bands?.[0]?.band_ceiling_gbp ?? 0;
  const newCeiling = impliedCeiling(env, tw, dFirm);

  const preview = useMemo(
    () => (bands ? previewBands(bands, dFirm, newCeiling, floor) : []),
    [bands, dFirm, newCeiling, floor],
  );

  const core = useMemo(
    () =>
      preview
        .filter((b) => b.band_verdict === "Core" || b.crosses)
        .sort((a, b) => (b.recent_median_gbp ?? 0) - (a.recent_median_gbp ?? 0)),
    [preview],
  );

  const ratify = useMutation({
    mutationFn: () =>
      ratifyDeskParams({
        discount_firm: dFirm,
        discount_stretch: dStretch,
        band_floor_gbp: floor,
        note,
      }),
    onSuccess: async () => {
      setErr(null);
      setOk("Params ratified. Bands re-cut.");
      setNote("");
      setDraftFirm(null); setDraftStretch(null); setDraftFloor(null);
      await qc.invalidateQueries({ queryKey: ["desk-params-full"] });
      await qc.invalidateQueries({ queryKey: ["desk-params"] });
      await qc.invalidateQueries({ queryKey: ["buy-bands"] });
    },
    onError: (e: Error) => { setOk(null); setErr(e.message); },
  });

  const saveEnv = useMutation({
    mutationFn: () => saveBudget({ period_year: year, envelope_gbp: env, target_works: tw }),
    onSuccess: async () => {
      setErr(null); setOk("Envelope saved. Bands re-cut.");
      setEnvelope(null); setWorks(null);
      await qc.invalidateQueries({ queryKey: ["desk-budget-full", year] });
      await qc.invalidateQueries({ queryKey: ["desk-budget", year] });
      await qc.invalidateQueries({ queryKey: ["buy-bands"] });
    },
    onError: (e: Error) => { setOk(null); setErr(e.message); },
  });

  return (
    <AppShell
      eyebrow="Desk configuration"
      title="Params & per-name config"
      lede="Economic parameters are editable and effective-dated: drag to preview, then ratify with a reason. Governance thresholds (n-gates, recency, homogeneity) stay in SQL by design."
    >
      {err && <p className="wall-card mb-4 border-l-2 border-l-destructive p-4 text-sm text-destructive">{err}</p>}
      {ok && <p className="wall-card mb-4 p-4 text-sm text-muted-foreground">{ok}</p>}

      {/* ------------------------------ economic params ---------------------- */}
      {params && (
        <div className="wall-card mb-6 p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <p className="label-caps">Economic parameters</p>
            <span className="label-caps">in force since {params.effective_from}</span>
          </div>

          <SliderRow
            label="Collector discount, firm"
            hint="Cushion below fair value on the firm bid. Loosening this raises every walk-away."
            value={dFirm} min={0.05} max={0.5} step={0.01}
            display={pctv(dFirm)} baseline={pctv(params.collector_discount_firm)}
            onChange={setDraftFirm}
          />
          <SliderRow
            label="Collector discount, stretch"
            hint="Tighter cushion for a wanted piece or a quiet room. Must stay below firm."
            value={dStretch} min={0.02} max={0.4} step={0.01}
            display={pctv(dStretch)} baseline={pctv(params.collector_discount_stretch)}
            onChange={setDraftStretch}
          />
          <SliderRow
            label="Band floor"
            hint="Below this recent median a band reads Dead_low: cheap, illiquid, no exit. A judgement, not a derivation."
            value={floor} min={500} max={5000} step={50}
            display={gbp(floor)} baseline={gbp(params.band_floor_gbp ?? 2000)}
            onChange={setDraftFloor}
          />

          {dStretch >= dFirm && (
            <p className="mb-3 text-sm text-destructive">
              Stretch must be tighter than firm; the write will be refused.
            </p>
          )}

          <div className="mt-4 border-t border-border pt-4">
            <label className="label-caps mb-2 block" htmlFor="ratify-note">
              Rationale (required)
            </label>
            <textarea
              id="ratify-note" rows={2} value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this change, and what evidence supports it."
              className="mb-3 w-full rounded border border-border bg-background p-2 text-sm"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!dirty || !note.trim() || dStretch >= dFirm || ratify.isPending}
                onClick={() => ratify.mutate()}
                className="rounded border border-border px-4 py-2 text-sm disabled:opacity-40"
              >
                {ratify.isPending ? "Ratifying…" : "Ratify params"}
              </button>
              {dirty && (
                <button
                  type="button"
                  onClick={() => { setDraftFirm(null); setDraftStretch(null); setDraftFloor(null); }}
                  className="label-caps underline"
                >
                  reset
                </button>
              )}
              {dirty && <Chip tone="ochre">unratified draft</Chip>}
            </div>
            <p className="label-caps mt-3">
              Writes a new effective-dated row; all other values copy forward. Nothing is mutated.
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------ fixed params -------------------------- */}
      {params && (
        <div className="wall-card mb-6 grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <Stat label="Stale haircut" value={pctv(params.stale_haircut)} />
          <Stat label="Remote haircut" value={pctv(params.remote_haircut)} />
          <Stat label="BP default" value={pctv(params.bp_pct_default)} />
          <Stat label="VAT on premium" value={pctv(params.vat_premium)} />
          <Stat label="ARR rate" value={pctv(params.arr_rate)} />
          <Stat label="Sleeve multiple" value={params.sleeve_ceiling_multiple?.toFixed(2) ?? "—"} />
          <Stat label="n-gate" value={String(params.n_gate)} />
          <Stat label="Band n-gate" value={String(params.band_n_gate)} />
          <Stat label="Band factor cap" value={params.band_factor_cap?.toFixed(2) ?? "—"} />
          <Stat label="Homogeneity" value={pctv(params.homogeneity_threshold)} />
          <Stat label="Recency cutoff" value={String(params.recency_cutoff)} />
        </div>
      )}

      {/* ------------------------------ envelope ------------------------------ */}
      {budget && (
        <div className="wall-card mb-6 p-5">
          <p className="label-caps mb-4">Envelope {budget.period_year}</p>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="label-caps mb-1 block" htmlFor="env">Envelope</label>
              <input
                id="env" type="number" step={500} value={env}
                onChange={(e) => setEnvelope(Number(e.target.value))}
                className="num w-full rounded border border-border bg-background p-2 text-sm"
              />
            </div>
            <div>
              <label className="label-caps mb-1 block" htmlFor="tw">Target works</label>
              <input
                id="tw" type="number" step={1} min={1} value={tw}
                onChange={(e) => setWorks(Number(e.target.value))}
                className="num w-full rounded border border-border bg-background p-2 text-sm"
              />
            </div>
            <Stat label="Committed" value={gbp(budget.committed_gbp)} tone="ochre" />
            <Stat label="Remaining" value={gbp(budget.envelope_gbp - budget.committed_gbp)} tone="harbour" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Stat label="Implied band ceiling" value={gbp(newCeiling)} tone="harbour" />
            {liveCeiling > 0 && newCeiling !== liveCeiling && (
              <Chip tone="ochre">live {gbp(liveCeiling)}</Chip>
            )}
            <button
              type="button"
              disabled={!budgetDirty || tw < 1 || saveEnv.isPending}
              onClick={() => saveEnv.mutate()}
              className="rounded border border-border px-4 py-2 text-sm disabled:opacity-40"
            >
              {saveEnv.isPending ? "Saving…" : "Save envelope"}
            </button>
          </div>
          <p className="label-caps mt-3">
            Ceiling = envelope / works / (1 − firm discount). Committed is maintained by the positions
            ledger and is not editable here. Underspend rolls; it does not raise this year's ceiling.
          </p>
        </div>
      )}

      {/* ------------------------------ band preview -------------------------- */}
      <p className="label-caps mb-3">Buy bands at these settings</p>
      {core.length === 0 && (
        <EmptyState title="No Core bands" hint="Nothing clears the floor, ceiling and recent-evidence gates." />
      )}
      {core.length > 0 && (
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
      )}

      {/* ------------------------------ per-name config ----------------------- */}
      <p className="label-caps mb-3">Per-name config</p>
      {isLoading && <p className="label-caps">Loading…</p>}
      {config && config.length === 0 && <EmptyState title="No config rows" hint="Run the Phase 0 seed." />}
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
                  {/* keys off the CEILING, never paper_primary: Wyld carries the flag
                      false by design and would otherwise vanish from the sleeve */}
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

/* ------------------------------ slider row -------------------------------- */

function SliderRow(p: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  baseline: string;
  onChange: (n: number) => void;
}) {
  const changed = p.display !== p.baseline;
  return (
    <div className="mb-5">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <label className="label-caps" htmlFor={p.label}>{p.label}</label>
        <span className="num text-sm text-foreground">
          {p.display}
          {changed && <span className="label-caps ml-2">was {p.baseline}</span>}
        </span>
      </div>
      <input
        id={p.label} type="range" min={p.min} max={p.max} step={p.step} value={p.value}
        onChange={(e) => p.onChange(Number(e.target.value))}
        className="w-full accent-current"
      />
      <p className="label-caps mt-1">{p.hint}</p>
    </div>
  );
}
