# Price feed (investment Phase B) — design

- **Date:** 2026-06-15
- **Status:** Accepted (brainstorm validated by maintainer)
- **Related:** ADR-018 (network policy: opt-in price feed), ADR-002 Amendment 2026-06-15,
  ADR-009 Amendment 3, investment Phase A (#233), Fortuneo CSV import (#234).

## Goal

Auto-value the open securities the maintainer holds (e.g. an MSCI World ETF on a PEA) by fetching
their public market price, instead of typing each value by hand every month. This makes the TRI
real and lets a quote-based valuation series accumulate over time (→ meaningful TTWROR going
forward). The feed is **opt-in and off by default**; the app stays fully functional offline on
declared values.

## Scope

**In:** an opt-in, main-process-only price feed that, for a support with an ISIN and a positive
net share count, resolves the ISIN to a EUR exchange ticker, fetches the latest price, and writes
`value = net shares × price` as a `quote`-sourced valuation. Auto-refresh on app open (non-blocking,
offline-tolerant) plus a manual refresh button. A settings surface to enable/disable the feed and
state exactly what is transmitted.

**Out (YAGNI / later):** historical price backfill (we only fetch the _latest_ price; the series
builds forward as the app is opened over time); non-EUR instruments / FX conversion; intraday
refresh cadence; provider fallback chains beyond a single documented fallback note; auto-resolving
which exchange to use beyond "prefer XETR, else first EUR market".

## Verified provider chain

Both hosts were confirmed live (HTTP 200) **from the maintainer's machine** on 2026-06-15. The old
Portfolio Report price host `api.portfolio-report.net` is **dead** (HTTP 000 from two networks) —
PP migrated to `api.portfolio-performance.info`; do not use the `.net` host.

### 1. ISIN → EUR ticker (resolution, runs once per support)

`GET https://api.portfolio-performance.info/v1/search?q={ISIN}` — keyless. Response (trimmed real
example for `IE00B4L5Y983`):

```json
[
  {
    "description": "ISHARES CORE MSCI WORLD",
    "isin": "IE00B4L5Y983",
    "markets": [
      { "currency": "EUR", "exchange": "XETR", "symbol": "EUNL.DE" },
      { "currency": "EUR", "exchange": "XAMS", "symbol": "IWDA.AS" },
      { "currency": "USD", "exchange": "XLON", "symbol": "IWDA.L" }
    ],
    "provider": "PP",
    "type": "ETP"
  }
]
```

Resolution rule: take the first result whose `isin` matches; from its `markets`, pick the entry
with `currency === "EUR"`, preferring `exchange === "XETR"`, else the first EUR market. Store its
`symbol` as the support's cached `quote_symbol`. If no EUR market exists, the support is **not**
quotable (stays on declared values).

### 2. Ticker → latest EUR price (refresh, runs each refresh)

`GET https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=5d&interval=1d` — keyless;
send a browser-like `User-Agent`. Response (trimmed real example for `EUNL.DE`):

```json
{
  "chart": {
    "result": [
      {
        "meta": {
          "currency": "EUR",
          "symbol": "EUNL.DE",
          "regularMarketPrice": 124.27,
          "regularMarketTime": 1781537751
        }
      }
    ]
  }
}
```

Read `chart.result[0].meta`. **Require `currency === "EUR"`** — if not, discard (no FX). Use
`regularMarketPrice` as the unit price and `regularMarketTime` (epoch seconds, UTC) → `as_of` date.
On `chart.error` non-null, HTTP error, or missing fields → treat as a fetch failure for that support.

### Privacy posture (ADR-018)

Every request sends **only an instrument identifier** (the ISIN to `.info`, then the ticker to
Yahoo) plus the unavoidable IP/User-Agent. No balances, quantities, account names, or amounts ever
transit. Both calls are main-process only; the renderer CSP stays `'self'`. The feed is off by
default; enabling it is the user's explicit, reversible consent, and the consent is what authorizes
auto-refresh on open.

## Data model — migration 028

`028_quote_feed.sql`:

```sql
-- Phase B: cache the resolved EUR exchange ticker per support so refresh only hits the quote host.
ALTER TABLE investment_supports ADD COLUMN quote_symbol TEXT;
```

- `support_valuations.source` already exists (migration 027) with values `'declared'` / `'auto'`.
  Phase B adds a third value **`'quote'`**, written by the feed. No schema change needed for it.
- `investment_supports.valuation_mode` (default `'declared'`, migration 025) flips to `'quoted'`
  when a support has a `quote_symbol` and the feed is enabled. It is informational/UI-facing; the
  authoritative "is this support quotable" check is `quote_symbol IS NOT NULL AND net shares > 0`.

### Valuation write rule

For each quotable support on a refresh:

1. `shares = Σ (buy − sell) quantity` from `support_operations` (existing query in the handler).
   If `shares <= 1e-6`, skip (closed/empty position).
2. `value = shares × regularMarketPrice`, rounded to the cent.
3. `as_of` = the date of `regularMarketTime` (UTC → `yyyy-mm-dd`).
4. **Upsert at most one `quote` valuation per support per `as_of` date**: if a `source='quote'`
   row already exists for `(support_id, as_of)`, update its `value`; else insert. This prevents
   table spam when the app is opened several times a day. **Never** modify `declared` or `auto`
   rows.
5. **Declared wins on its own date:** if a `source='declared'` valuation already exists for the
   same `(support_id, as_of)`, **skip** the quote for that support entirely — do not write a quote
   row for that date. This guarantees a same-day declared value is never shadowed by a quote in the
   latest-by-`as_of` ordering. Across _different_ dates, the latest date still wins (a fresh quote
   today legitimately supersedes a declared value from last month — the user can re-declare if they
   want the official figure).

A `quote` valuation is a real market value, so it participates in **both** TRI and TTWROR (the
`source !== 'auto'` filter in `performance.ts` already includes it — `'quote'` is not `'auto'`).

## North-star honesty

A `quote` value (`shares × Yahoo price`) is a **market estimate**, not the broker's official
to-the-cent valuation. Therefore:

- `quote` valuations are labelled in the UI as an automatic market quote (with the "dernière mise à
  jour" timestamp), visually distinct from declared values.
- **A declared valuation always wins on its own date** as the verification anchor: the feed never
  writes or overwrites a quote for a date that already has a declared value (see write rule §5), so
  a declared value is authoritative the day it is entered. The verification path stays intact —
  "compare to your broker; if it differs, declare the exact value."
- Concretely: a support's "current value" used everywhere = its latest valuation by `as_of` (a
  declared value dated today outranks an older quote; a fresh quote is used when no newer declared
  value exists). This is already how `current_value` is computed (latest by `as_of`, then
  `created_at`); the feed just contributes dated `quote` rows into that ordering.

## Main-process modules

- `src/main/investment/quoteProvider.ts` — pure-ish network client. Two functions:
  - `resolveSymbol(isin: string): Promise<string | null>` — calls `.info/v1/search`, applies the
    EUR/XETR resolution rule, returns the ticker or `null`.
  - `fetchLatestQuote(symbol: string): Promise<{ price: number; asOf: string } | null>` — calls
    Yahoo, validates `currency === 'EUR'`, returns `{ price, asOf }` or `null` on any failure.
  - Uses Electron `net` (main process) or `fetch` with a 15 s timeout; no third-party HTTP lib.
- `src/main/investment/quoteState.ts` — settings helpers mirroring `sync/state.ts`:
  `getQuotesEnabled()`, `setQuotesEnabled(bool)`, `getLastQuoteRefreshAt()`,
  `setLastQuoteRefreshAt(iso)` over `app_settings` keys `quotes.enabled` / `quotes.lastRefreshAt`.
- `src/main/investment/refreshQuotes.ts` — orchestrator: `refreshAllQuotes(db): Promise<RefreshResult>`.
  Loads quotable supports; for each, resolves `quote_symbol` if missing (and caches it), fetches the
  quote, upserts the `quote` valuation; collects per-support outcome (ok / skipped / failed).
  Records `quotes.lastRefreshAt` on completion. Network failures are caught per support and reported,
  never thrown out of the orchestrator (one dead ticker must not abort the batch).

## IPC additions

New channels (typed in `src/shared/types/ipc.ts`, registered in `register.ts`):

- `investment:getQuoteSettings` → `{ enabled: boolean; lastRefreshAt: string | null }`.
- `investment:setQuotesEnabled` `{ enabled: boolean }` → `{ ok: true }`. When toggled **on**, does
  not itself fetch; the next refresh (manual or app-open) does the work.
- `investment:refreshQuotes` → `{ result: RefreshResult }` where
  `RefreshResult = { refreshed: number; skipped: number; failed: number; lastRefreshAt: string }`.

`refreshQuotes` is async (network). All handlers stay main-process only.

## Refresh orchestration

- **App open:** the renderer's investment view, on mount, if `getQuoteSettings().enabled`, fires
  `investment:refreshQuotes` **without awaiting it for render** — the list renders immediately from
  the DB, and when the refresh resolves the view reloads wrappers. The main process never blocks
  startup on the network.
- **Manual:** a "Rafraîchir les cours" button on the Placements card calls the same channel and
  shows a spinner + the resulting "dernière mise à jour" timestamp.
- **Offline / failure:** `fetch` rejects or times out → that support keeps its last known valuation;
  the UI shows the previous timestamp and (if all failed) a quiet "cours indisponibles" note. No
  modal, no crash.

## UI surfaces

All French, sentence case, `<Money>` / `formatEuro`, Lucide icons, existing dialog/primitives.

- **Settings (opt-in):** a section in the existing settings surface — toggle "Activer les cours de
  marché (opt-in)", with body text stating exactly what is sent (l'ISIN puis le ticker, jamais de
  montant ni de quantité) and to whom (portfolio-performance.info, Yahoo Finance), and that it is
  off by default. Disabling it stops all calls; cached `quote_symbol`/valuations remain.
- **Placements card:** when the feed is on, a "Rafraîchir les cours" button + "dernière mise à jour
  le …" line. Quoted supports show their value with a small "cours auto" marker.
- **Support dialog (ISIN):** unchanged entry; when the feed is on and an ISIN is present but
  unresolved, the next refresh resolves and caches the ticker (no extra UI needed). Optionally show
  the resolved ticker read-only once known.

## Error handling

- Resolution returns `null` (no EUR market / ISIN unknown) → support stays declared; not an error.
- Quote fetch fails (network, non-EUR, malformed) → per-support `failed`, last valuation kept.
- The orchestrator always resolves; it never rejects the IPC call on a single provider failure.
- Timeouts: 15 s per request. The whole batch is small (a handful of supports).

## Testing

- `quoteProvider` unit tests (`// @vitest-environment node`): feed canned `.info` and Yahoo JSON
  (fixtures captured from the real responses above, anonymised to the public MSCI World ISIN only —
  no personal holdings); assert EUR/XETR resolution, EUR-currency enforcement, `null` on errors,
  epoch→`as_of` date conversion. Mock `fetch`; **no real network in tests.**
- `refreshQuotes` integration test (`tests/integration/`): seed a wrapper + support with operations
  (net shares) + an ISIN, stub the provider, run the orchestrator, assert one `quote` valuation with
  `value = shares × price`, idempotent re-run upserts (no duplicate per `as_of`), declared rows
  untouched, a failing ticker is reported and skipped without aborting the batch.
- `performance.ts`: a test that a `quote` valuation drives TRI and TTWROR (i.e. is treated as a real
  valuation, not an `auto` sentinel).
- Renderer tests for the settings toggle and the refresh button (jsdom + explicit `afterEach(cleanup)`).

## ADR-018 addendum (same PR)

Append a short addendum to `docs/adr/018-network-policy-price-feed.md` recording the **finalised
provider choice** (the ADR explicitly deferred it to build time): ISIN→ticker via
`api.portfolio-performance.info/v1/search`, ticker→price via Yahoo Finance `v8/finance/chart`; note
that the originally-illustrative `api.portfolio-report.net` host is dead and unused. Restate that
only instrument identifiers are sent. Update README / "privé par défaut" copy in the same PR to
state that an opt-in price feed exists and precisely what it transmits.

## Validation script (end of brick)

1. Build, all tests green, lint + `tsc --noEmit` clean.
2. In-app, feed **OFF** (default): Placements behaves exactly as today; no network traffic (verify
   with the app's network inactivity — no outbound to the two hosts).
3. Enable the feed in settings; confirm the settings text states what is sent.
4. On a wrapper imported from Fortuneo with an open MSCI World support, set its ISIN
   (`IE00B4L5Y983`); click "Rafraîchir les cours". Expect: a value ≈ `net shares × ~124 €` appears,
   labelled "cours auto", with a "dernière mise à jour" timestamp; TRI now shows.
5. Declare an exact value for that support → it overrides the quote (declared wins); re-refresh does
   not overwrite the declared value for that date.
6. Turn the feed OFF → no further calls; existing values persist.
