# Art Vault

Art360 — Base Lovable Prompt

Paste this as the opening prompt in a new Lovable project. Connect the project to a fresh GitHub repo and to the art360 Supabase (schema already applied) before generating.

Build a solo-user web app called Art360: a private research vault and analytics surface for a UK art dealer running a systematic buy-resell arbitrage book in sunlit British-Impressionist, marine and continental oils. It sits beside, never inside, a separate scoring app. Art360 is the judgement layer: verdicts, triggers, flags, learnings, shown next to per-artist auction analytics.

Who uses it

One person. Simplest possible auth: Supabase Auth, single account, email magic-link. No public sign-up, no roles, no team features. Mobile-responsive: the dealer checks flags on a phone before a sale.

Data (already exists in the connected Supabase — build UI against it, never recreate)

Tables and view: artists, notes, note_tags, vocab_note_tag, comps_rollup, view artist_360.

Read for display: artist_360 (artist + quant + open-flag count), comps_rollup.

Write: insert into notes (+ note_tags); update notes.action_status; edit a note.

All controlled fields are Postgres enums or the vocab_note_tag table; every dropdown is sourced from the DB and must reject invalid values.

The app displays judgement; it never computes buy/skip. No scoring logic in the app.

Aesthetic: "catalogue raisonné meets a trading desk"

Editorial gallery, not SaaS. Museum wall-label typography over a warm plaster wall, with dense mono numeric strips for the quant. Borrow MutualArt's information structure (artist landing pages, result cards, filterable feeds) but re-skin entirely: warm, printed, curatorial.

Palette (light, warm, sunlit-harbour):

Wall / background #F7F3EC

Card surface #FFFFFF, hairline border #E7DFD2

Ink / text #2A2622

Sunlit accent (primary, positive, buy) ochre #C8862F

Harbour accent (data-good, sell-through) teal #2E6E6A

Flag P1 burnt sienna #A6482E, P2 ochre #C8862F, P3 slate #6B7B82

Type:

Display, artist names, titles: Fraunces (editorial serif, slight optical age)

UI labels, body: Inter

All numbers and data strips: IBM Plex Mono (trading-desk feel)

Motifs: artist cards read like gallery wall labels; flags render as condition-report tags; the note form reads like a catalogue index card. Thin rules, generous warm whitespace, no decorative drop-shadows.

Screens (build in this order)

1. Debt register (home)

The open-flags to-do list, the most-used screen. Query notes where note_type = 'Flag' and action_status = 'Open', across all scopes (Artist, Venue, System). Sort by priority P1 to P3. Each row: priority tag (sienna/ochre/slate), scope, artist or entity_key, one-line body, source_ref, age in days. One tap marks the flag Actioned (updates action_status, row leaves the list). Style as a "conservation log": tabular, calm, restrained.

2. Artist 360

A gallery grid of artist cards from artist_360. Card = serif name + dates, play-type chip, palette-pref swatch, a mono micro-strip (median UK hammer GBP, sell-through %, n UK oils), and an open-flags badge (ochre dot + count). Click through to the artist page:

Wall-label header (tombstone style): name, dates, tier, ARR status.

Quant strip (mono): all comps_rollup fields. Render n_uk_auto_oil in amber when below ~8; show data_confidence as a chip.

Tabs: Verdict (latest note_type=Verdict, current only), Triggers, Flags (open), All notes (filter by type / tag / status), History (supersede chain, newest first).

Expired notes (valid_to in the past) render greyed with a "refresh" tag.

3. Note capture

A form matching the note facets: note_type, scope, artist (searchable, nullable), entity_key, decision, play_type, confidence, priority (shown only when note_type = Flag), valid_from, valid_to, supersedes (searchable note picker), source_ref, tags (multi-select from vocab_note_tag), body (markdown). Every controlled field is a DB-sourced dropdown; reject invalid. On save, insert the note and its note_tags in one transaction.

Rules

Read-only everywhere except: create note, edit note, change action_status.

Notes are advisory and time-bound: always surface valid_to; grey out expired notes.

Never render or compute a buy/skip decision; that lives in the source sheet.

Start with auth plus the debt register wired to live data, then Artist 360, then the capture form.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d3cd5cbb-dc10-41a9-835c-9247d557b9ea).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
