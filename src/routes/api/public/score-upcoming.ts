import { createFileRoute } from '@tanstack/react-router'
import { computeInZone, inferMedium, normKey, OIL, WATERCOLOUR, AUTOGRAPH } from '@/lib/desk/score'

// Forward-feed radar ingest (Move 1). Two modes, one shared secret.
//
//   POST /api/public/score-upcoming
//   Authorization: Bearer <COMPS_SHARED_SECRET>
//   Body: { "mode": "ingest",  "rows": [ ...raw upcoming lots... ] }
//         { "mode": "outcome", "rows": [ { sale_key, outcome_status, ... } ] }
//
// WHAT THIS HANDLER IS NOT. It does not score. scoreLot() needs a boolean
// taste_ok and taste is a hard human gate, so the radar has no business calling
// it: a fabricated taste value is worse than no number at all. What the radar
// produces is a SCREENING read from artist_buy_band, which is a band-level,
// median-quality, blended-tier number. It is never a bid, and /radar never
// renders it as one. The walk-away comes from the desk, after a human answers
// taste and sets a quality delta.
//
// WHERE JUDGEMENT LIVES. n8n scrapes and normalises units, and runs one LLM
// node for subject and palette only. This handler does every derivation that
// the desk also does, using the desk's own exported functions (inferMedium,
// computeInZone, normKey), so the two cannot drift. Verdicts and levels come
// from Postgres. Nothing is computed here that a view could compute.
//
// LANES, not a ranked buy list:
//   candidate    every machine-checkable mandate gate passes; only human gates left
//   watch        scoreable but thin, cooling, concentrated, or collector-review
//   unclassified subject or palette below the confidence threshold
//   suppressed   fails a mandate gate outright
//   quarantine   cannot be read at all (no artist, no size, no date, no venue)

const CONFIDENCE_FLOOR = 0.7
const STAMP = 'lead-falsified, coincident-only'

// Verdicts that end a candidacy. Cooling is deliberately absent: §J forbids the
// radar timing entry, so a cooling band down-ranks to watch and is never hidden.
const SUPPRESSING_VERDICTS = new Set([
  'Below_min_size',
  'Dead_low',
  'Ceiling_breach',
  'Palette_excluded',
  'No_eligible_comps',
])

type Row = Record<string, unknown>

const str = (v: unknown): string => (v == null ? '' : String(v).trim())
const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function authOk(request: Request): boolean {
  const secret = process.env['COMPS_SHARED_SECRET']
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  if (header.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < header.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

interface BandDef { band_set: string; band_label: string; lo: number; hi: number | null }
interface BuyBand {
  artist_id: string
  band_label: string
  band_verdict: string
  firm_hammer_gbp: number | null
  concentration_ratio: number | null
}
interface ArtistRef { artist_id: string; display_name: string; tracked: boolean }
interface ConfigRef {
  artist_id: string
  band_set: string | null
  min_longest_cm: number | null
  paper_ceiling_gbp: number | null
}

function bandLabelFor(cm: number, bandSet: string, defs: BandDef[]): string | null {
  const hit = defs.find(
    (d) => d.band_set === bandSet && cm >= d.lo && (d.hi == null || cm < d.hi),
  )
  return hit ? hit.band_label : null
}

export const Route = createFileRoute('/api/public/score-upcoming')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = (b: unknown, status: number) =>
          new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })

        if (!authOk(request)) return json({ error: 'Unauthorised' }, 401)

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json({ error: 'Invalid JSON body' }, 400)
        }

        const mode = str((body as { mode?: unknown })?.mode) || 'ingest'
        const rows = Array.isArray((body as { rows?: unknown })?.rows)
          ? ((body as { rows: Row[] }).rows)
          : null
        if (!rows) return json({ error: 'Expected { rows: [...] }' }, 400)
        if (!['ingest', 'outcome'].includes(mode))
          return json({ error: 'mode must be ingest or outcome' }, 400)

        const { supabaseAdmin: sb } = await import('@/integrations/supabase/client.server')

        /* ------------------------------------------------------------------
         * OUTCOME MODE. The point of the whole exercise: 46 of 115 bands read
         * Survivorship_suspect because no unsold side was ever captured, and
         * unsold data only exists if something was watching before the sale.
         * A settled outcome is a legitimate comp and goes to comps_stage for
         * human promotion; an upcoming lot with an estimate never does.
         * ------------------------------------------------------------------ */
        if (mode === 'outcome') {
          let staged = 0
          let backfilled = 0
          const batch = `radar-${new Date().toISOString().slice(0, 10)}`
          const problems: string[] = []

          for (const r of rows) {
            const sale_key = str(r['sale_key'])
            if (!sale_key) { problems.push('missing sale_key'); continue }

            const outcome_status = str(r['outcome_status'])
            if (!['Sold', 'Not_Sold', 'Withdrawn', 'Results_NA'].includes(outcome_status)) {
              problems.push(`${sale_key}: bad outcome_status`)
              continue
            }

            const hammer = numOrNull(r['outcome_hammer_native'])
            const basis = str(r['outcome_basis']) || 'Hammer'

            const { data: up, error: upErr } = await sb
              .from('upcoming_lots')
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .update({
                outcome_status,
                outcome_hammer_native: hammer,
                outcome_currency: str(r['outcome_currency']) || 'GBP',
                outcome_basis: basis,
                outcome_captured_at: new Date().toISOString(),
                staged_batch: batch,
                updated_at: new Date().toISOString(),
              } as any)
              .eq('sale_key', sale_key)
              .select('artist_raw, title, authorship, medium_raw, medium_class, subject, palette, h_cm, w_cm, est_low, est_high, currency, venue_raw, sale_date, artist_id')
              .maybeSingle()

            if (upErr || !up) { problems.push(`${sale_key}: not in upcoming_lots`); continue }
            const u = up as Record<string, unknown>

            // comps_stage, not comps. comps has no confidence column, so a
            // machine subject call must not enter the corpus unreviewed.
            const { error: stErr } = await sb.from('comps_stage').insert({
              artist: str(u['artist_raw']),
              title: str(u['title']),
              authorship: str(u['authorship']),
              medium_raw: str(u['medium_raw']),
              medium_class: str(u['medium_class']),
              subject: str(u['subject']),
              palette: str(u['palette']),
              h_cm: numOrNull(u['h_cm']),
              w_cm: numOrNull(u['w_cm']),
              est_low: numOrNull(u['est_low']),
              est_high: numOrNull(u['est_high']),
              currency: str(u['currency']) || 'GBP',
              realized_native: outcome_status === 'Sold' ? hammer : null,
              realized_basis: outcome_status === 'Sold' ? basis : '-',
              status: outcome_status,
              venue: str(u['venue_raw']),
              sale_date: u['sale_date'],
              load_batch: batch,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any)
            if (!stErr) staged += 1

            // Deal Log calibration. Match on artist_id + normalised title +
            // sale_date: lots.sale_key and comps.sale_key use different
            // generators, so a key join would silently match nothing.
            if (outcome_status === 'Sold' && hammer != null && u['artist_id']) {
              const { data: cands } = await sb
                .from('lots')
                .select('lot_id, title, result_hammer_gbp')
                .eq('artist_id', u['artist_id'] as string)
                .eq('sale_date', u['sale_date'] as string)
              const wanted = normKey(str(u['title']))
              const matches = (cands ?? []).filter(
                (c) => normKey(str((c as Record<string, unknown>)['title'])) === wanted,
              )
              if (matches.length === 1 && (matches[0] as Record<string, unknown>)['result_hammer_gbp'] == null) {
                await sb
                  .from('lots')
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .update({ result_hammer_gbp: hammer, result_captured_at: new Date().toISOString().slice(0, 10) } as any)
                  .eq('lot_id', (matches[0] as Record<string, unknown>)['lot_id'] as string)
                backfilled += 1
              } else if (matches.length > 1) {
                problems.push(`${sale_key}: ${matches.length} candidate lots, left for a human`)
              }
            }
          }

          return json({ ok: true, mode, rows_in: rows.length, staged, backfilled, problems, stamp: STAMP }, 200)
        }

        /* ------------------------------------------------------------------
         * INGEST MODE
         * ------------------------------------------------------------------ */
        const [artistsRes, configRes, bandsRes, buyRes, paramsRes] = await Promise.all([
          sb.from('artists').select('artist_id, display_name, tracked'),
          sb.from('artist_desk_config').select('artist_id, band_set, min_longest_cm, paper_ceiling_gbp'),
          sb.from('size_band_defs').select('band_set, band_label, lo, hi'),
          sb.from('artist_buy_band').select('artist_id, band_label, band_verdict, firm_hammer_gbp, concentration_ratio'),
          sb.from('desk_params_current').select('params_id').maybeSingle(),
        ])
        const firstErr = [artistsRes, configRes, bandsRes, buyRes].find((r) => r.error)
        if (firstErr?.error) return json({ error: firstErr.error.message }, 500)

        const artists = (artistsRes.data ?? []) as unknown as ArtistRef[]
        const configs = new Map(
          ((configRes.data ?? []) as unknown as ConfigRef[]).map((c) => [c.artist_id, c]),
        )
        const bandDefs = (bandsRes.data ?? []) as unknown as BandDef[]
        const buyBands = new Map(
          ((buyRes.data ?? []) as unknown as BuyBand[]).map((b) => [`${b.artist_id}|${b.band_label}`, b]),
        )
        const params_id = (paramsRes.data as { params_id?: string } | null)?.params_id ?? null

        const bySlug = new Map(artists.map((a) => [a.artist_id, a]))
        const byName = new Map(artists.map((a) => [a.display_name.toLowerCase(), a]))
        const defaultBandSet =
          bandDefs.length > 0 ? (bandDefs[0] as BandDef).band_set : 'default'

        const now = new Date().toISOString()
        const payload: Row[] = []
        const counts: Record<string, number> = {
          candidate: 0, watch: 0, unclassified: 0, suppressed: 0, quarantine: 0,
        }

        for (const r of rows) {
          const artist_raw = str(r['artist_raw']) || str(r['artist'])
          const title = str(r['title'])
          const venue_raw = str(r['venue_raw']) || str(r['venue'])
          const venue_canonical = str(r['venue_canonical']) || venue_raw
          const sale_date = str(r['sale_date'])
          const authorship = str(r['authorship']) || AUTOGRAPH
          const medium_raw = str(r['medium_raw'])
          const longest_cm = numOrNull(r['longest_cm'])

          const artist =
            bySlug.get(normKey(artist_raw)) ?? byName.get(artist_raw.toLowerCase()) ?? null
          const artist_id = artist?.artist_id ?? null

          const sale_key = [
            artist_id ?? normKey(artist_raw),
            normKey(title),
            normKey(venue_canonical),
            sale_date,
          ].join('|')

          const medium_class = str(r['medium_class']) || (medium_raw ? inferMedium(medium_raw) : '')

          // Palette: title-only by construction, so the radar never asserts
          // Grey, which is a hard skip. Below the floor it ships Neutral, which
          // flags rather than kills, and the row re-lanes to unclassified.
          const subject = str(r['subject'])
          const subject_confidence = numOrNull(r['subject_confidence'])
          const palette_confidence = numOrNull(r['palette_confidence'])
          const paletteRaw = str(r['palette'])
          const paletteLowConf = palette_confidence != null && palette_confidence < CONFIDENCE_FLOOR
          const palette = paletteLowConf || paletteRaw === 'Grey' ? 'Neutral' : paletteRaw || 'Neutral'

          const in_zone = artist_id && subject ? computeInZone(artist_id, subject) : null
          const cfg = artist_id ? configs.get(artist_id) : undefined
          const band_label =
            longest_cm != null
              ? bandLabelFor(longest_cm, cfg?.band_set ?? defaultBandSet, bandDefs)
              : null
          const buy = artist_id && band_label ? buyBands.get(`${artist_id}|${band_label}`) : undefined

          const lowConf =
            (subject_confidence != null && subject_confidence < CONFIDENCE_FLOOR) || paletteLowConf

          let lane: string
          let reason: string

          if (!artist_id || !sale_date || longest_cm == null || !venue_canonical) {
            lane = 'quarantine'
            reason = !artist_id
              ? 'artist not on the roster; no config, no comps, no band'
              : 'missing size, date or venue'
          } else if (authorship !== AUTOGRAPH) {
            lane = 'suppressed'; reason = `authorship: ${authorship}`
          } else if (medium_class !== OIL && medium_class !== WATERCOLOUR) {
            lane = 'suppressed'; reason = `medium: ${medium_class || 'unreadable'}`
          } else if (medium_class === WATERCOLOUR && cfg?.paper_ceiling_gbp == null) {
            // §F: paper by an oil-market name is the weak sibling.
            lane = 'suppressed'; reason = 'paper by a non-sleeve name'
          } else if (medium_class === OIL && cfg?.paper_ceiling_gbp != null) {
            // §F.1: an oil under a sleeve name routes to collector-review, and
            // gets no level. Roberts oils are dead at both size ends, Melville
            // has no vector, Wyld is a taste lane. None is a ladder lane.
            lane = 'watch'; reason = 'sleeve-name oil: collector-review'
          } else if (lowConf) {
            lane = 'unclassified'; reason = 'subject or palette below the confidence floor'
          } else if (in_zone === 'Skip') {
            lane = 'suppressed'; reason = 'out of zone'
          } else if (cfg?.min_longest_cm != null && longest_cm < cfg.min_longest_cm) {
            lane = 'suppressed'; reason = `below ${cfg.min_longest_cm}cm minimum`
          } else if (!buy) {
            lane = 'watch'; reason = 'no band read for this cell'
          } else if (SUPPRESSING_VERDICTS.has(buy.band_verdict)) {
            lane = 'suppressed'; reason = buy.band_verdict
          } else if (buy.band_verdict === 'Core' && buy.firm_hammer_gbp != null) {
            const est = numOrNull(r['est_low'])
            lane = 'candidate'
            reason =
              est != null && est <= buy.firm_hammer_gbp
                ? 'Core band, estimate under the band level'
                : 'Core band, estimate above the band level'
          } else {
            lane = 'watch'; reason = buy.band_verdict
          }

          counts[lane] = (counts[lane] ?? 0) + 1

          payload.push({
            sale_key,
            source: str(r['source']) || 'mutualart',
            source_ref: str(r['source_ref']) || null,
            lot_url: str(r['lot_url']) || null,
            image_url: str(r['image_url']) || null,
            last_seen_at: now,
            artist_id,
            artist_raw,
            title,
            authorship,
            medium_raw: medium_raw || null,
            medium_class: medium_class || null,
            longest_cm,
            h_cm: numOrNull(r['h_cm']),
            w_cm: numOrNull(r['w_cm']),
            est_low: numOrNull(r['est_low']),
            est_high: numOrNull(r['est_high']),
            currency: str(r['currency']) || 'GBP',
            venue_raw,
            venue_canonical,
            vtype_resolved: str(r['vtype_resolved']) || null,
            geo_resolved: str(r['geo_resolved']) || null,
            sale_date: sale_date || null,
            subject: subject || null,
            subject_confidence,
            palette,
            palette_confidence,
            palette_kw_only: true,
            in_zone,
            classification_json: r['classification_json'] ?? null,
            band_label,
            band_verdict: buy?.band_verdict ?? null,
            band_firm_hammer_gbp: buy?.firm_hammer_gbp ?? null,
            paper_ceiling_gbp: cfg?.paper_ceiling_gbp ?? null,
            radar_lane: lane,
            radar_reason: reason,
            scored_at: now,
            params_id,
            updated_at: now,
          })
        }

        const { error } = await sb
          .from('upcoming_lots')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(payload as any, { onConflict: 'sale_key' })
        if (error) return json({ error: error.message }, 500)

        return json({ ok: true, mode, rows_in: rows.length, upserted: payload.length, lanes: counts, stamp: STAMP }, 200)
      },
    },
  },
})
