import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Sleeve ceiling multiple slider. Lives on /desk/params.
 *
 * Reads the current multiple from desk_params_current and the three paper-sleeve
 * medians from artist_desk_config. Dragging previews the recomputed ceilings
 * client-side (no writes). Apply calls the transactional RPC apply_sleeve_multiple,
 * which inserts a new params row (append-only history) and recomputes every
 * paper_ceiling_gbp in one transaction. Nothing is written until Apply.
 *
 * A name flags red when its computed ceiling falls below its all-in + remote-haircut
 * floor: the §F sleeve kill-criterion made visible. Floor = ceiling must still clear
 * an unsighted blind punt (ceiling x (1 - remote_haircut)); if the recomputed ceiling
 * drops under a name's practical minimum viable bid, the sleeve is closing for it.
 */

const MIN = 0.35;
const MAX = 0.55;
const STEP = 0.01;
const round50 = (n: number) => Math.round(n / 50) * 50;

const TOOLTIP =
  "Sleeve ceiling multiple. The share of a paper name's in-zone finished strong-venue " +
  "watercolour exit median you will pay all-in as a buy ceiling. 0.45 bakes in margin, " +
  "ARR, buyer's premium and the collector-hold discount (buying to own, not to flip). " +
  "Moving it re-prices every paper ceiling at once: lower it to demand more margin. " +
  "Watch the kill line - if a name's ceiling drops below its all-in plus remote-haircut " +
  "floor, the sleeve closes for that name. Ratified default 0.45; a change is a logged " +
  "decision (a new params row), not a nudge.";

interface SleeveRow {
  artist_id: string;
  display_name: string | null;
  inzone_finished_wc_median_gbp: number;
}

interface DeskParams {
  sleeve_ceiling_multiple: number;
  remote_haircut: number;
}

const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");

async function fetchParams(): Promise<DeskParams> {
  const { data, error } = await supabase
    .from("desk_params_current" as never)
    .select("sleeve_ceiling_multiple, remote_haircut")
    .single();
  if (error) throw error;
  return data as unknown as DeskParams;
}

async function fetchSleeve(): Promise<SleeveRow[]> {
  // key off the median, not paper_primary: Wyld is paper_primary=false by design
  const { data, error } = await supabase
    .from("artist_desk_config" as never)
    .select("artist_id, display_name, inzone_finished_wc_median_gbp")
    .not("inzone_finished_wc_median_gbp", "is", null)
    .order("artist_id");
  if (error) throw error;
  return (data ?? []) as unknown as SleeveRow[];
}

function InfoDot({ tip }: { tip: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="What is the sleeve ceiling multiple?"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="grid h-[15px] w-[15px] place-items-center rounded-full border border-border text-[10px] leading-none text-muted-foreground hover:text-foreground"
      >
        i
      </button>
      {open ? (
        <span className="absolute left-5 top-0 z-20 w-[320px] rounded-md border border-border bg-card p-3 text-[11.5px] leading-snug text-foreground/80 shadow-lg">
          {tip}
        </span>
      ) : null}
    </span>
  );
}

export function SleeveMultipleSlider() {
  const qc = useQueryClient();
  const params = useQuery({ queryKey: ["desk-params-current"], queryFn: fetchParams });
  const sleeve = useQuery({ queryKey: ["sleeve-config"], queryFn: fetchSleeve });

  const committed = params.data?.sleeve_ceiling_multiple ?? 0.45;
  const haircut = params.data?.remote_haircut ?? 0.4;

  const [draft, setDraft] = useState<number | null>(null);
  const value = draft ?? committed;
  const dirty = draft !== null && draft !== committed;

  const [applying, setApplying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = sleeve.data ?? [];
    return list.map((r) => {
      const ceiling = round50(r.inzone_finished_wc_median_gbp * value);
      // practical minimum viable bid: an unsighted punt after the remote haircut.
      // if that clears below ~£250 the ceiling is too tight to act on: kill line.
      const floor = ceiling * (1 - haircut);
      return { ...r, ceiling, floor, dead: floor < 250 };
    });
  }, [sleeve.data, value, haircut]);

  async function apply() {
    if (!dirty) return;
    setApplying(true);
    setErr(null);
    try {
      const { error } = await supabase.rpc("apply_sleeve_multiple" as never, {
        p_multiple: draft,
      } as never);
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["desk-params-current"] }),
        qc.invalidateQueries({ queryKey: ["sleeve-config"] }),
        qc.invalidateQueries({ queryKey: ["book-screen"] }),
      ]);
      setDraft(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Apply failed.");
    } finally {
      setApplying(false);
    }
  }

  if (params.isLoading || sleeve.isLoading)
    return <p className="label-caps text-muted-foreground">Loading sleeve params…</p>;
  if (params.error || sleeve.error)
    return <p className="text-[13px] text-sienna">Could not read desk params.</p>;

  return (
    <section className="max-w-[520px] rounded-lg border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="font-display text-[17px] tracking-tight">Sleeve ceiling multiple</h3>
        <InfoDot tip={TOOLTIP} />
      </div>
      <p className="mb-4 text-[12px] text-muted-foreground">
        One lever governs all paper-sleeve ceilings. Ratified default 0.45.
      </p>

      <div className="mb-2 flex items-baseline justify-between">
        <span className="num text-[28px] leading-none tracking-tight">{value.toFixed(2)}</span>
        {dirty ? (
          <span className="num text-[11px] text-ochre">
            was {committed.toFixed(2)} · unapplied
          </span>
        ) : (
          <span className="num text-[11px] text-muted-foreground">applied</span>
        )}
      </div>

      <input
        type="range"
        min={MIN}
        max={MAX}
        step={STEP}
        value={value}
        onChange={(e) => setDraft(parseFloat(e.target.value))}
        className="w-full accent-ochre"
        aria-label="Sleeve ceiling multiple"
      />
      <div className="num mb-4 flex justify-between text-[10px] text-faint">
        <span>{MIN.toFixed(2)} · more margin</span>
        <span>{MAX.toFixed(2)} · less margin</span>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border bg-panel2 text-left">
              <th className="label-caps px-3 py-1.5 text-[9.5px] font-medium text-muted-foreground">
                Name
              </th>
              <th className="label-caps px-3 py-1.5 text-right text-[9.5px] font-medium text-muted-foreground">
                In-zone median
              </th>
              <th className="label-caps px-3 py-1.5 text-right text-[9.5px] font-medium text-muted-foreground">
                Ceiling
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.artist_id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">{r.display_name ?? r.artist_id}</td>
                <td className="num px-3 py-2 text-right text-muted-foreground">
                  {gbp(r.inzone_finished_wc_median_gbp)}
                </td>
                <td
                  className={cn(
                    "num px-3 py-2 text-right",
                    r.dead ? "text-sienna" : "text-foreground",
                  )}
                >
                  {gbp(r.ceiling)}
                  {r.dead ? <span className="ml-1 text-[9px]">below floor</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {err ? <p className="mt-3 text-[12px] text-sienna">{err}</p> : null}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          disabled={!dirty || applying}
          onClick={apply}
          className={cn(
            "num rounded-md px-4 py-1.5 text-[12px]",
            dirty && !applying
              ? "bg-foreground text-background"
              : "cursor-not-allowed border border-border text-faint",
          )}
        >
          {applying ? "Applying…" : "Apply"}
        </button>
        {dirty ? (
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="num rounded-md border border-border px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        ) : null}
      </div>
    </section>
  );
}
