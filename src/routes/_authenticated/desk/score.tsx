import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/art/app-shell";
import { Chip, EmptyState, Stat } from "@/components/art/primitives";
import { fetchArtistOptions, gbp } from "@/lib/art360";
import {
  AUTHORSHIPS, PALETTES, SUBJECTS, commitLotClient, emptyLot, logVerdict, scoreLotClient,
  type CommitActuals, type LotForm,
} from "@/lib/desk-ui";
import type { Decision } from "@/lib/desk/score";

export const Route = createFileRoute("/_authenticated/desk/score")({
  head: () => ({
    meta: [
      { title: "Score a lot — Art360" },
      { name: "description", content: "Score a live lot manually against the collector fair-value discipline." },
    ],
  }),
  component: ScoreLot,
});

const inputCls = "mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm num";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label-caps">{label}</span>
      {children}
    </label>
  );
}

function ScoreLot() {
  const qc = useQueryClient();
  const [f, setF] = useState<LotForm>(emptyLot());
  const [result, setResult] = useState<Decision | null>(null);
  const set = <K extends keyof LotForm>(k: K, v: LotForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const numOrNull = (s: string): number | null => (s.trim() === "" ? null : Number(s));

  const { data: artists } = useQuery({ queryKey: ["artist-options"], queryFn: fetchArtistOptions });

  const score = useMutation({
    mutationFn: async () => {
      const d = await scoreLotClient(f);
      await logVerdict(f, d); // auto-log: verdict note + lots candidate row, deduped by sale_key
      return d;
    },
    onSuccess: (d) => {
      setResult(d);
      qc.invalidateQueries({ queryKey: ["deal-log"] });
      qc.invalidateQueries({ queryKey: ["scored-lots"] });
    },
    onError: (e: Error) => { setResult(null); toast.error(e.message); },
  });

  return (
    <AppShell
      eyebrow="Bid discipline"
      title="Score a lot"
      lede="The manual fallback: for a lot with no listing to hand Claude. Home-market anchor, bounded quality delta, per-name K_buy, hard taste and budget gates, walk-away ladder."
    >
      <div className="mb-6">
        <Link to="/desk" className="label-caps text-harbour transition-colors hover:underline">
          ← Candidates
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        {/* ---------------- form ---------------- */}
        <form
          className="wall-card space-y-4 p-5"
          onSubmit={(e) => { e.preventDefault(); score.mutate(); }}
        >
          <Field label="Artist">
            <select className={inputCls} value={f.artist_id} onChange={(e) => set("artist_id", e.target.value)} required>
              <option value="">Select…</option>
              {(artists ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>

          <Field label="Title">
            <input className={inputCls} value={f.title} onChange={(e) => set("title", e.target.value)} required />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Authorship">
              <select className={inputCls} value={f.authorship} onChange={(e) => set("authorship", e.target.value)}>
                {AUTHORSHIPS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Longest side (cm)">
              <input type="number" step="0.1" className={inputCls} value={f.longest_cm || ""} onChange={(e) => set("longest_cm", Number(e.target.value))} required />
            </Field>
          </div>

          <Field label="Medium (verbatim)">
            <input className={inputCls} value={f.medium_raw} onChange={(e) => set("medium_raw", e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Subject">
              <select className={inputCls} value={f.subject} onChange={(e) => set("subject", e.target.value)} required>
                <option value="">Select…</option>
                {SUBJECTS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Palette">
              <select className={inputCls} value={f.palette} onChange={(e) => set("palette", e.target.value)}>
                {PALETTES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Venue">
              <input className={inputCls} value={f.venue} onChange={(e) => set("venue", e.target.value)} required />
            </Field>
            <Field label="Sale date">
              <input type="date" className={inputCls} value={f.sale_date} onChange={(e) => set("sale_date", e.target.value)} required />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Estimate low">
              <input type="number" className={inputCls} value={f.est_low ?? ""} onChange={(e) => set("est_low", numOrNull(e.target.value))} />
            </Field>
            <Field label="Estimate high">
              <input type="number" className={inputCls} value={f.est_high ?? ""} onChange={(e) => set("est_high", numOrNull(e.target.value))} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Quality δ (blank = 1.0)">
              <input type="number" step="0.01" className={inputCls} value={f.quality_delta ?? ""} onChange={(e) => set("quality_delta", numOrNull(e.target.value))} />
            </Field>
            <Field label="δ override reason">
              <input className={inputCls} value={f.quality_override_reason} onChange={(e) => set("quality_override_reason", e.target.value)} />
            </Field>
          </div>

          <Field label="Condition / provenance / sale context">
            <textarea className={inputCls} rows={2} value={f.condition} onChange={(e) => set("condition", e.target.value)} placeholder="condition notes" />
          </Field>
          <input className={inputCls} value={f.provenance_note} onChange={(e) => set("provenance_note", e.target.value)} placeholder="provenance note (flags a flip)" />
          <input className={inputCls} value={f.sale_context} onChange={(e) => set("sale_context", e.target.value)} placeholder="sale context (multiples / pair)" />

          <div className="flex flex-wrap gap-5 pt-1">
            <label className="label-caps flex items-center gap-2">
              <input type="checkbox" checked={f.strong_venue_candidate} onChange={(e) => set("strong_venue_candidate", e.target.checked)} />
              Strong-venue candidate
            </label>
            <label className="label-caps flex items-center gap-2">
              <input type="checkbox" checked={f.taste_ok} onChange={(e) => set("taste_ok", e.target.checked)} />
              Glad to own (taste)
            </label>
            <label className="label-caps flex items-center gap-2">
              <input type="checkbox" checked={f.condition_checked} onChange={(e) => set("condition_checked", e.target.checked)} />
              Condition sighted
            </label>
          </div>

          <button
            type="submit"
            disabled={score.isPending}
            className="label-caps w-full rounded-sm border border-harbour px-4 py-2.5 text-harbour transition-colors hover:bg-harbour hover:text-background disabled:opacity-50"
          >
            {score.isPending ? "Scoring…" : "Score lot"}
          </button>
        </form>

        {/* ---------------- result ---------------- */}
        <div>
          {!result && <EmptyState title="No lot scored yet" hint="Fill the lot in and score it. It lands on the candidate list; nothing graduates to the ledger until you record a win." />}
          {result && <ResultPanel result={result} form={f} />}
        </div>
      </div>
    </AppShell>
  );
}

function decisionTone(d: Decision["decision"]): "harbour" | "ochre" | "muted" {
  return d === "Buy" ? "harbour" : d === "Monitor" ? "ochre" : "muted";
}

function ResultPanel({ result, form }: { result: Decision; form: LotForm }) {
  const a = result.anchor;
  const l = result.ladder;
  return (
    <div className="space-y-6">
      <div className="wall-card space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <Chip tone={decisionTone(result.decision)} className="text-sm">{result.decision}</Chip>
          {result.binding_constraint && <span className="label-caps text-muted-foreground">{result.binding_constraint}</span>}
        </div>
        <p className="text-sm leading-relaxed text-foreground">{result.rationale}</p>

        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          <Stat label="Firm" value={gbp(l.firm)} tone="harbour" />
          <Stat label="Stretch" value={gbp(l.stretch)} />
          <Stat label="All-in @ firm" value={gbp(result.all_in_at_firm)} />
          <Stat label="Commission" value={gbp(l.commission)} />
        </div>
      </div>

      <div className="wall-card space-y-4 p-5">
        <p className="label-caps">Anchor</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Fair value" value={gbp(a.fair_value)} tone="ochre" />
          <Stat label="Tier" value={a.tier ?? "—"} />
          <Stat label="Rung / n" value={`${a.rung} / ${a.n}`} />
          <Stat label="Confidence" value={a.confidence ?? "—"} />
          <Stat label="IQR" value={a.iqr ? `${gbp(a.iqr[0])}–${gbp(a.iqr[1])}` : "—"} />
          <Stat label="Range" value={a.comp_range ? `${gbp(a.comp_range[0])}–${gbp(a.comp_range[1])}` : "—"} />
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          <Stat label="Quality δ" value={String(result.quality_delta.value)} />
          <Stat label="δ bound" value={result.quality_delta.bound ? `${result.quality_delta.bound[0]}–${result.quality_delta.bound[1]}` : "—"} />
          <Stat label="K_buy" value={String(result.K_buy)} />
          <Stat label="Gates" value={`${result.taste_ok ? "taste✓" : "taste✗"} ${result.budget_ok ? "budget✓" : "budget✗"}`} />
        </div>
        {result.flags.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {result.flags.map((fl) => <Chip key={fl} tone="muted">{fl}</Chip>)}
          </div>
        )}
      </div>

      {result.decision !== "Skip" && <CommitPanel result={result} form={form} />}
    </div>
  );
}

function CommitPanel({ result, form }: { result: Decision; form: LotForm }) {
  const qc = useQueryClient();
  const [house, setHouse] = useState(form.venue);
  // Reset the actuals whenever a new Decision arrives: a stale hammer figure
  // attached to a fresh ladder is the one number the operator must retype.
  const [act, setAct] = useState<CommitActuals>({
    hammer_paid_gbp: 0, house, condition_status: "", buy_date: "", rationale: "", commit_override_reason: "",
  });
  useEffect(() => {
    setAct((p) => ({ ...p, hammer_paid_gbp: 0, condition_status: "", commit_override_reason: "" }));
  }, [result]);

  const guard = commitLadderGuard(act.hammer_paid_gbp, result.ladder.firm, result.ladder.stretch);
  const outside = act.hammer_paid_gbp > 0 && (guard.tooHigh || guard.tooLow);
  const needsReason = outside && !act.commit_override_reason?.trim();

  const commit = useMutation({
    mutationFn: () => commitLotClient(form, { ...act, house }),
    onSuccess: (r) => {
      toast.success(`Committed. All-in ${gbp(r.all_in_gbp)}.${r.over_walkaway ? " Paid above firm." : ""}`);
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["desk-budget"] });
      qc.invalidateQueries({ queryKey: ["scored-lots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="wall-card space-y-4 p-5">
      <p className="label-caps">Record a win</p>
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="label-caps">Hammer paid</span>
          <input type="number" className={inputCls} value={act.hammer_paid_gbp || ""} onChange={(e) => setAct((p) => ({ ...p, hammer_paid_gbp: Number(e.target.value) }))} />
        </label>
        <label className="block">
          <span className="label-caps">House</span>
          <input className={inputCls} value={act.house} onChange={(e) => setAct((p) => ({ ...p, house: e.target.value }))} />
        </label>
      </div>
      <input className={inputCls} value={act.condition_status} onChange={(e) => setAct((p) => ({ ...p, condition_status: e.target.value }))} placeholder="condition as bought" />
      <button
        onClick={() => commit.mutate()}
        disabled={commit.isPending || !act.hammer_paid_gbp}
        className="label-caps w-full rounded-sm border border-border px-4 py-2.5 transition-colors hover:border-harbour hover:text-harbour disabled:opacity-50"
      >
        {commit.isPending ? "Committing…" : "Commit to ledger"}
      </button>
      <p className="text-xs text-muted-foreground">
        Writes a Lot note and a position; the budget updates automatically. <Link to="/positions" className="text-harbour">View positions →</Link>
      </p>
    </div>
  );
}
