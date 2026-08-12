import { createFileRoute } from '@tanstack/react-router'

// Nightly comps_rollup job.
// POST rows from the Comps sheet (array of objects keyed by header name), the
// handler computes every comps_rollup column and upserts on artist_id.
//
//   POST /api/public/comps-rollup
//   Authorization: Bearer <MCP_SHARED_SECRET>
//   Body: { "rows": [ { "Artist": "...", "Authorship": "Autograph", ... } ] }
//         (a bare array is also accepted)

const REAL = 1.75
const THIN = 1.5
const RGATE = 0.95
const NGATE = 8
const MINEST = 200
const MINREALN = 5

const ROSTER = [
  { id: 'terrick-williams', m: 'terrick williams' },
  { id: 'james-kay', m: 'james kay' },
  { id: 'adrian-scott-stokes', m: 'adrian scott stokes' },
  { id: 'john-anthony-park', m: 'john anthony park' },
  { id: 'mary-mccrossan', m: 'mccrossan' },
  { id: 'william-logsdail', m: 'logsdail' },
  { id: 'elizabeth-forbes', m: 'elizabeth' },
  { id: 'ethel-walker', m: 'ethel walker' },
  { id: 'emily-beatrice-bland', m: 'bland' },
  { id: 'james-francis-danby', m: 'danby' },
  { id: 'frank-brangwyn', m: 'brangwyn' },
  { id: 'henry-scott-tuke', m: 'tuke' },
  { id: 'alfred-east', m: 'alfred east' },
  { id: 'arthur-melville', m: 'melville' },
  { id: 'clarkson-stanfield', m: 'stanfield' },
  { id: 'david-roberts', m: 'david roberts' },
  { id: 'edward-william-cooke', m: 'cooke' },
  { id: 'julius-olsson', m: 'olsson' },
  { id: 'edward-pritchett', m: 'pritchett' },
]

type Row = Record<string, unknown>

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? null : n
}
function med(a: number[]): number | null {
  if (!a.length) return null
  const s = a.slice().sort((x, y) => x - y)
  const h = Math.floor(s.length / 2)
  return s.length % 2 ? (s[h] as number) : (((s[h - 1] as number) + (s[h] as number)) / 2)
}
function str(r: Row, k: string): string {
  return String(r[k] ?? '').trim()
}
function T(r: Row): string {
  return str(r, 'VType_Resolved')
}
function isUK(r: Row): boolean {
  const t = T(r)
  return t === 'Exit_Strong' || t === 'Buy_Regional' || t === 'Straddle'
}
function isBuy(r: Row): boolean {
  const t = T(r)
  return t === 'Buy_Regional' || t === 'Straddle'
}

export function computeRollup(rows: Row[]) {
  const out: Record<string, unknown>[] = []

  for (const a of ROSTER) {
    const AO = rows.filter(
      (r) =>
        String(r['Artist'] ?? '').toLowerCase().includes(a.m) &&
        str(r, 'Authorship') === 'Autograph' &&
        str(r, 'Medium_Class') === 'Oil',
    )

    const soldUK = AO.filter(
      (r) => str(r, 'Status') === 'Sold' && isUK(r) && num(r['Hammer_Equiv_GBP']) !== null,
    )
    const exit = soldUK.filter((r) => T(r) === 'Exit_Strong')
    const reg = soldUK.filter((r) => isBuy(r))
    const exit_n = exit.length
    const reg_n = reg.length

    const exitMed = med(exit.map((r) => num(r['Hammer_Equiv_GBP']) as number))
    const regMed = med(reg.map((r) => num(r['Hammer_Equiv_GBP']) as number))
    const arb_edge_raw = exitMed !== null && regMed ? +(exitMed / regMed).toFixed(2) : null

    const median_uk_hammer_gbp = med(soldUK.map((r) => num(r['Hammer_Equiv_GBP']) as number))

    // PER-ROW median realisation: in-zone oil UK sold, est_mid >= 200
    const realArr: number[] = []
    for (const r of AO) {
      if (str(r, 'Status') !== 'Sold' || str(r, 'In_Zone') !== 'In' || !isUK(r)) continue
      const em = num(r['Est_Mid_GBP'])
      const he = num(r['Hammer_Equiv_GBP'])
      if (em !== null && em >= MINEST && he !== null) realArr.push(he / em)
    }
    const median_realisation = med(realArr)
    const realN = realArr.length

    // sell-through over UK autograph oils (Sold vs Not_Sold)
    const ukAll = AO.filter((r) => isUK(r))
    const soldC = ukAll.filter((r) => str(r, 'Status') === 'Sold').length
    const nsC = ukAll.filter((r) => str(r, 'Status') === 'Not_Sold').length
    const sell_through_pct = soldC + nsC > 0 ? +((100 * soldC) / (soldC + nsC)).toFixed(0) : null

    // matched spread: 2 size bands (<60 / >=60), in-zone + palette-hit, n>=8 both sides
    const cellRows = AO.filter(
      (r) =>
        str(r, 'Status') === 'Sold' &&
        num(r['Hammer_Equiv_GBP']) !== null &&
        str(r, 'In_Zone') === 'In' &&
        str(r, 'Palette_Pref_Hit') === 'Y',
    )
    function band(name: 'lt' | 'ge') {
      const inb = (r: Row) => {
        const L = num(r['Longest_cm'])
        return L !== null && (name === 'lt' ? L < 60 : L >= 60)
      }
      const ex = cellRows
        .filter((r) => T(r) === 'Exit_Strong' && inb(r))
        .map((r) => num(r['Hammer_Equiv_GBP']) as number)
      const rg = cellRows
        .filter((r) => isBuy(r) && inb(r))
        .map((r) => num(r['Hammer_Equiv_GBP']) as number)
      return { exN: ex.length, rgN: rg.length, exM: med(ex), rgM: med(rg) }
    }
    const b1 = band('lt')
    const b2 = band('ge')
    let mNum = 0
    let mDen = 0
    let matched_n: number | null = null
    for (const b of [b1, b2]) {
      if (b.exN >= NGATE && b.rgN >= NGATE && b.rgM) {
        const w = Math.min(b.exN, b.rgN)
        mNum += ((b.exM as number) / b.rgM) * w
        mDen += w
        matched_n = matched_n === null ? w : Math.min(matched_n, w)
      }
    }
    const matched_spread = mDen > 0 ? +(mNum / mDen).toFixed(2) : null

    // FLAG (median_realisation is the master gate)
    const exitConf =
      (arb_edge_raw !== null && arb_edge_raw >= REAL) ||
      (matched_spread !== null && matched_spread >= REAL)
    const exitConfThin =
      (arb_edge_raw !== null && arb_edge_raw >= THIN) ||
      (matched_spread !== null && matched_spread >= THIN)

    let buy_edge_flag: string
    if (
      median_realisation !== null &&
      median_realisation < RGATE &&
      realN >= MINREALN &&
      exit_n >= NGATE &&
      reg_n >= NGATE &&
      exitConf
    )
      buy_edge_flag = 'Real'
    else if (median_realisation !== null && median_realisation < 1.0 && exitConfThin)
      buy_edge_flag = 'Thin'
    else buy_edge_flag = 'None'

    const thin_exit_flag = exit_n < NGATE
    const data_confidence =
      exit_n >= NGATE && reg_n >= NGATE && realN >= NGATE ? 'High' : realN >= MINREALN ? 'Med' : 'Low'

    out.push({
      artist_id: a.id,
      median_uk_hammer_gbp: median_uk_hammer_gbp !== null ? +median_uk_hammer_gbp.toFixed(0) : null,
      exit_vs_regional_spread: arb_edge_raw, // DISPLAY only, never a trigger
      arb_edge_raw,
      matched_spread,
      matched_n,
      exit_strong_n: exit_n,
      n_exit_strong: exit_n,
      n_buy_regional: reg_n,
      n_uk_auto_oil: exit_n + reg_n,
      median_realisation: median_realisation !== null ? +median_realisation.toFixed(2) : null,
      in_zone_realisation: median_realisation !== null ? +median_realisation.toFixed(2) : null,
      sell_through_pct,
      thin_exit_flag,
      buy_edge_flag,
      data_confidence,
      updated_at: new Date().toISOString(),
    })
  }

  return out
}

function authOk(request: Request): boolean {
  const secret = process.env['MCP_SHARED_SECRET']
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  return header === `Bearer ${secret}`
}

export const Route = createFileRoute('/api/public/comps-rollup')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authOk(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorised' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
        }

        const rows = Array.isArray(body)
          ? (body as Row[])
          : Array.isArray((body as { rows?: unknown })?.rows)
            ? ((body as { rows: Row[] }).rows)
            : null

        const received = Array.isArray(rows) ? rows.length : 0
        if (!Array.isArray(rows) || rows.length < 1000) {
          return new Response(
            JSON.stringify({
              error: 'partial_read',
              received,
              min_expected: 1000,
              message: 'Too few Comps rows posted; skipping upsert to avoid overwriting comps_rollup with a partial read.',
            }),
            { status: 422, headers: { 'content-type': 'application/json' } },
          )
        }



        const computed = computeRollup(rows)

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { error } = await supabaseAdmin
          .from('comps_rollup')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(computed as any, { onConflict: 'artist_id' })

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          })
        }

        return new Response(
          JSON.stringify({ ok: true, rows_in: rows.length, artists_upserted: computed.length, results: computed }),
          { headers: { 'content-type': 'application/json' } },
        )
      },
    },
  },
})
