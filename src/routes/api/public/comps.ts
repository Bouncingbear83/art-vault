import { createFileRoute } from '@tanstack/react-router'

// Row-level comps upsert — DUMB.
// The Sheet does all row-level judgement (authorship, subject, palette,
// in_zone, venue resolution, hammer-equiv, Sheet_Grade) and ships the derived
// A:AQ rows here. Postgres does ALL aggregation via the comps_rollup and
// comps_timeseries VIEWS, so there is nothing to compute or gate in this
// handler: it validates, whitelists to real comps columns, and upserts on
// sale_key. (Replaces /comps-rollup and /comps-timeseries, both retired.)
//
//   POST /api/public/comps
//   Authorization: Bearer <COMPS_SHARED_SECRET>
//   Body: { "rows": [ { "sale_key": "...", "artist_id": "james-kay", ... } ] }
//
// The n8n Code node maps Sheet headers -> these column names, derives
// artist_id (slug) from the display name, and coerces numerics, so rows arrive
// already comps-shaped. This whitelist is the backstop.

const MIN_ROWS = 500 // full comps is ~3k; a short payload = a truncated Sheet read

const COLUMNS = [
  'sale_key','artist_id','artist','title','authorship','medium_raw','medium_class',
  'subject','palette','h_cm','w_cm','est_low','est_high','currency','realized_native',
  'realized_basis','status','venue','sale_date','confirmed_ref','venue_canonical',
  'vtype_resolved','geo_resolved','auto_ref','ref','times_seen','repeat_flag','dup_flag',
  'longest_cm','wall_presence','fx','est_mid_gbp','realized_gbp','hammer_equiv_gbp',
  'realisation','in_zone','medium_pref','palette_pref_hit','trigger_gbp','include_in_stats',
  'buy_candidate','sheet_grade','condition_checked','remote_haircut_pct',
] as const

type Row = Record<string, unknown>

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

function clean(row: Row): Row {
  const out: Row = {}
  for (const k of COLUMNS) if (row[k] !== undefined) out[k] = row[k] === '' ? null : row[k]
  return out
}

export const Route = createFileRoute('/api/public/comps')({
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

        const rows = Array.isArray(body)
          ? (body as Row[])
          : Array.isArray((body as { rows?: unknown })?.rows)
            ? (body as { rows: Row[] }).rows
            : null

        if (!Array.isArray(rows)) return json({ error: 'Expected an array of rows or { rows: [...] }' }, 400)
        if (rows.length < MIN_ROWS)
          return json({ error: 'partial_read', received: rows.length, min_expected: MIN_ROWS,
            message: 'Too few rows; skipping upsert to avoid a truncated comps load.' }, 422)

        const bad = rows.filter((r) => !String(r['sale_key'] ?? '').trim())
        if (bad.length) return json({ error: 'missing_sale_key', bad_rows: bad.length }, 422)

        const payload = rows.map(clean)

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { error } = await supabaseAdmin
          .from('comps')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(payload as any, { onConflict: 'sale_key' })

        if (error) return json({ error: error.message }, 500)
        return json({ ok: true, rows_in: rows.length, upserted: payload.length }, 200)
      },
    },
  },
})
