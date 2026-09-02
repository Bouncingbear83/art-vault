import { createFileRoute } from '@tanstack/react-router'

// The roster, for the radar flow.
//
//   GET /api/public/roster
//   Authorization: Bearer <COMPS_SHARED_SECRET>
//
// WHY THIS EXISTS. The nightly comps workflow once carried a hardcoded 19-name
// table and silently orphaned every name added after it was written. A filter
// list inside an n8n Code node is the same defect waiting to happen: the roster
// moves, the node does not, and the failure is invisible because a dropped name
// looks exactly like a quiet week. So the flow asks the database who is tracked,
// every run, and holds no names of its own.
//
// Returns one row per tracked artist:
//   { artist_id, display_name, mutualart_url, min_longest_cm, paper_ceiling_gbp }
//
// mutualart_url is the BrowserAct entry point and is constraint-checked in the
// database against the canonical /Artist/<name>/<16-hex> form, so a null here
// means the name genuinely has no page recorded, not that the URL is malformed.

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

export const Route = createFileRoute('/api/public/roster')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const json = (b: unknown, status: number) =>
          new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })

        if (!authOk(request)) return json({ error: 'Unauthorised' }, 401)

        const { supabaseAdmin: sb } = await import('@/integrations/supabase/client.server')

        const [artistsRes, configRes] = await Promise.all([
          sb.from('artists').select('artist_id, display_name, mutualart_url, tracked').eq('tracked', true),
          sb.from('artist_desk_config').select('artist_id, min_longest_cm, paper_ceiling_gbp'),
        ])
        if (artistsRes.error) return json({ error: artistsRes.error.message }, 500)

        const cfg = new Map(
          ((configRes.data ?? []) as unknown as Record<string, unknown>[]).map((c) => [
            String(c['artist_id']),
            c,
          ]),
        )

        const roster = ((artistsRes.data ?? []) as unknown as Record<string, unknown>[]).map((a) => {
          const c = cfg.get(String(a['artist_id']))
          return {
            artist_id: String(a['artist_id']),
            display_name: String(a['display_name']),
            mutualart_url: (a['mutualart_url'] as string | null) ?? null,
            min_longest_cm: c ? ((c['min_longest_cm'] as number | null) ?? null) : null,
            paper_ceiling_gbp: c ? ((c['paper_ceiling_gbp'] as number | null) ?? null) : null,
          }
        })

        return json(
          {
            ok: true,
            count: roster.length,
            with_mutualart_url: roster.filter((r) => r.mutualart_url).length,
            roster,
          },
          200,
        )
      },
    },
  },
})
