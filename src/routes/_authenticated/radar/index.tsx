import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/art/app-shell";
import { Chip, EmptyState } from "@/components/art/primitives";
import { gbp } from "@/lib/art360";
import {
  fetchRadar, groupByLane, LANE_LABEL, LANE_LEDE, LANE_ORDER, RADAR_STAMP,
  type RadarLane, type RadarRow,
} from "@/lib/radar";

export const Route = createFileRoute("/_authenticated/radar/")({
  head: () => ({
    meta: [
      { title: "Radar — Art360" },
      { name: "description", content: "Upcoming lots surfaced for taste review. Coincident only." },
    ],
  }),
  component: RadarPage,
});

function verdictTone(v: string | null): "harbour" | "ochre" | "muted" {
  if (v === "Core") return "harbour";
  if (v === "Cooling" || v === "Thin_recent" || v === "Survivorship_suspect") return "ochre";
  return "muted";
}

function RadarPage() {
  const [showSuppressed, setShowSuppressed] = useState(false);
  const { data: rows, isLoading } = useQuery({ queryKey: ["radar"], queryFn: fetchRadar });
  const lanes = groupByLane(rows ?? []);
  const visible = LANE_ORDER.filter((l) => (l === "suppressed" ? showSuppressed : true));

  return (
    <AppShell
      eyebrow="Coincident read"
      title="Radar"
      lede="Upcoming lots by tracked names, surfaced for taste review. The radar reads whether a band is live now; it does not time entry and it does not price a lot. Nothing here is a bid."
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <span className="label-caps text-muted-foreground">{RADAR_STAMP}</span>
        <label className="label-caps flex items-center gap-2">
          <input
            type="checkbox"
            checked={showSuppressed}
            onChange={(e) => setShowSuppressed(e.target.checked)}
          />
          Show suppressed
        </label>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading the feed…</p>}

      {!isLoading && (rows ?? []).length === 0 && (
        <EmptyState
          title="Nothing upcoming"
          hint="The nightly ingest has not run, or no tracked name has a lot in a UK room before its sale date. Nothing qualifying is the normal state, not a failure."
        />
      )}

      {!isLoading &&
        visible.map((lane) =>
          lanes[lane].length === 0 ? null : (
            <section key={lane} className="mb-10">
              <h2 className="font-display text-2xl text-foreground">
                {LANE_LABEL[lane]}{" "}
                <span className="num text-base text-muted-foreground">{lanes[lane].length}</span>
              </h2>
              <p className="mb-4 mt-1 max-w-2xl text-sm text-muted-foreground">{LANE_LEDE[lane]}</p>
              <div className="space-y-3">
                {lanes[lane].map((r) => (
                  <RadarCard key={r.sale_key} row={r} lane={lane} />
                ))}
              </div>
            </section>
          ),
        )}
    </AppShell>
  );
}

function RadarCard({ row, lane }: { row: RadarRow; lane: RadarLane }) {
  const est =
    row.est_low != null || row.est_high != null
      ? `${gbp(row.est_low)}–${gbp(row.est_high)}`
      : "no estimate";

  return (
    <div className="wall-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {row.band_verdict && (
              <Chip tone={verdictTone(row.band_verdict)}>{row.band_verdict}</Chip>
            )}
            {row.band_label && <Chip tone="muted">{row.band_label}</Chip>}
            <Chip tone="muted">{row.source}</Chip>
            {row.radar_reason && (
              <span className="label-caps text-muted-foreground">{row.radar_reason}</span>
            )}
          </div>

          <h3 className="mt-2 font-display text-xl text-foreground">
            {row.artist_name ?? row.artist_raw}
          </h3>
          <p className="text-sm text-muted-foreground">
            {row.title}
            {row.subject ? ` · ${row.subject}` : ""}
            {row.palette ? ` · ${row.palette}` : ""}
            {row.longest_cm ? ` · ${row.longest_cm}cm` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {[row.venue_canonical, row.sale_date, est].filter(Boolean).join(" · ")}
          </p>

          {/* Caveats that must travel with the row, never buried in a tooltip. */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>palette read from the title only</span>
            {row.subject_confidence != null && (
              <span>subject confidence {row.subject_confidence.toFixed(2)}</span>
            )}
            {row.concentration_ratio != null && row.concentration_ratio > 1 && (
              <span>
                {Math.round(row.concentration_ratio * 100)}% of an average slot: concentrated
              </span>
            )}
            {row.band_verdict === "Cooling" && <span>band cooling: a caveat, not a signal</span>}
          </div>
        </div>

        <div className="shrink-0 text-right">
          {/* Deliberately NOT a walk-away. The band level is median-quality and
              blended across venue tiers; the ladder comes from the desk, after
              taste and a quality delta. Showing a number here would anchor the
              one answer the taste gate needs kept clean. */}
          {lane === "candidate" && row.band_firm_hammer_gbp != null && (
            <p className="text-xs text-muted-foreground">band level available at the desk</p>
          )}
          <div className="mt-2 flex flex-col items-end gap-2">
            {row.lot_url && (
              <a
                href={row.lot_url}
                target="_blank"
                rel="noreferrer"
                className="label-caps text-harbour underline-offset-4 hover:underline"
              >
                View lot
              </a>
            )}
            <Link
              to="/desk/score"
              search={{ sale_key: row.sale_key }}
              className="label-caps rounded-sm border border-harbour px-3 py-1.5 text-harbour transition-colors hover:bg-harbour hover:text-background"
            >
              Take to desk
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
