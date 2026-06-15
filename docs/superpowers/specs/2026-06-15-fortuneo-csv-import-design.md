# Fortuneo bourse-CSV import — design

**Date:** 2026-06-15
**Status:** Draft for maintainer review
**Scope anchor:** ADR-009 Amendment 3 (investment tracking). Builds on investment Phase A (#233).
**Privacy:** 100% local — a file the user already downloaded is parsed on the machine; no network.
The maintainer's real CSV lives only in `spike-fixtures/` (gitignored); tests use synthetic CSVs.

## Goal

Let the user drop their **Fortuneo "Historique des opérations bourse" CSV** and have the app
auto-create the wrapper's supports + every buy/sell **flow** + the **share** counts — removing the
manual flow entry that Phase A requires. The import produces the _flows_; _valuations_ are still
declared (or come later from the Phase B price feed).

## Data source (the CSV)

Confirmed against a real export (see memory `reference-fortuneo-bourse-csv`):

- ISO-8859-1, CRLF, `;`-delimited (trailing `;`), 11 columns:
  `libellé ; Opération ; Place ; Date ; Qté ; Prix d'éxé ; Montant brut ; Courtage/Prélèvement ;
Montant net ; Devise ;`
- `Date` = `DD/MM/YYYY`; numbers use `.` decimal.
- **No ISIN** — supports are matched by the `libellé` string.
- `Opération`: `Achat Comptant`, `Vente comptant` (trailing-padded → match by prefix
  `Achat`/`Vente`). Unknown types (dividend, OST…) are flagged for review, not silently imported.
- `Montant net` (incl. fees) is negative for a buy, positive for a sell.

## The key honesty: import gives flows, not valuations

The CSV is an **operations** export, not a portfolio **valuation**. After import:

- A **closed** support (cumulative shares = 0, e.g. a fully-sold ETF) is **performance-complete
  from flows alone** — its current value is 0.
- An **open** support (shares > 0) still needs its **current value** — declared by the user (one
  number) now, or computed by the Phase B price feed (shares × quote) later.

So this brick removes the _flow_-entry chore; the open-position _valuation_ is one declared number
(or Phase B).

## Data model (migration)

```sql
-- The raw imported operations: audit trail + share/price history (feeds Phase B), and the
-- source the imported flows derive from.
CREATE TABLE support_operations (
  id          TEXT PRIMARY KEY,
  support_id  TEXT NOT NULL REFERENCES investment_supports(id) ON DELETE CASCADE,
  op_date     TEXT NOT NULL,              -- ISO yyyy-mm-dd
  kind        TEXT NOT NULL,              -- 'buy' | 'sell'  (extensible later)
  quantity    REAL NOT NULL,              -- shares, always > 0 (direction via kind)
  unit_price  REAL,                       -- Prix d'éxé
  gross       REAL,                       -- Montant brut
  fees        REAL,                       -- Courtage/Prélèvement (<= 0)
  net         REAL NOT NULL,              -- Montant net (signed: buy < 0, sell > 0)
  currency    TEXT NOT NULL DEFAULT 'EUR',
  raw_label   TEXT NOT NULL,              -- the original libellé (match key + audit)
  op_hash     TEXT NOT NULL,              -- idempotent-import dedup key
  source      TEXT NOT NULL DEFAULT 'fortuneo_csv',
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_support_operations_hash ON support_operations(op_hash);

-- A flow can now originate from an operation (cascade-deleted with it) or be manual (NULL).
ALTER TABLE support_flows ADD COLUMN operation_id TEXT REFERENCES support_operations(id) ON DELETE CASCADE;

-- Immutable match key so re-imports find the right support even if the user renamed it.
ALTER TABLE investment_supports ADD COLUMN import_label TEXT;
```

**Why operations _and_ flows (not one):** the performance math (`performance.ts`) already reads
**`support_flows`** — keeping the imported flows in that same table means **the perf code is
unchanged**. The `support_operations` table is the richer audit/shares layer the imported flows
derive from. `op_hash` makes re-import idempotent; `operation_id` keeps the two in sync (deleting
an op cascade-deletes its flow). Manual flows (e.g. an AV contribution) keep `operation_id = NULL`.

`op_hash = sha(op_date | raw_label | kind | quantity | net)` — stable across re-exports of an
overlapping period.

## Import pipeline (`src/main/investment/importBourseCsv.ts`)

Given the CSV text + a **target wrapper id** (the user picks/creates it — the CSV doesn't name
the envelope):

1. **Decode** ISO-8859-1 → UTF-8; split on CRLF; parse `;` rows (skip the header + blank lines).
2. **Per row** → a parsed op: map `Opération` prefix → `kind`; parse `DD/MM/YYYY` → ISO;
   `quantity = |Qté|`; `net`, `gross`, `fees`, `unit_price` parsed as floats; `raw_label = libellé`.
   Unknown `Opération` → collect into a **`skipped`** list (reported, not imported).
3. **Resolve support**: in the target wrapper, find the support with `import_label = raw_label`;
   else create one (`name = raw_label`, `import_label = raw_label`).
4. **Dedup**: compute `op_hash`; if it already exists → **skip** (already imported). Else insert
   the operation **and** a `support_flow` (`flow_date = op_date`, `amount = −net`, `operation_id`).
   (`amount = −net`: buy net<0 → +contribution; sell net>0 → −withdrawal.)
5. **Opening + closing valuations** (so performance computes — see next section):
   - Ensure an **opening valuation of 0** at the support's earliest operation date.
   - If the support's **cumulative shares = 0** (closed), ensure a **valuation of 0** at the last
     operation date.
6. Return a summary: `{ created: Support[], operationsImported, skippedRows, supportsTouched }`
   for a **review banner** (mirrors the statement-import review pattern).

Idempotent + additive: re-importing an overlapping export adds only new operations.

## One required tweak to `performance.ts`

A support built purely from imported operations starts at **0** and its first operation is a real
contribution. But Phase A's opening rule excludes a flow dated on the opening valuation date
(because a manual "value = flow same day" entry already embodies it). That rule must **only apply
when the opening value is non-zero**:

> exclude opening-date flows from `netInvested`/TRI **only if `openingValue !== 0`**.

This keeps the manual case correct (opening 5000 with a same-day 5000 flow → excluded) **and**
makes the imported case correct (opening 0 at the first op date → the first buy counts). A unit
test covers both. With this, an imported support with an opening-0 valuation + a declared current
value (or 0 for a closed one) yields correct TRI/TTWROR with no further entry.

## UI

- An **"Importer un relevé (CSV)"** button on the Placements card (and/or per wrapper). It opens a
  main-process file picker (like the loan-PDF import), reads the file, asks for the **target
  wrapper** (pick existing or create), runs the import, and shows a **review banner**:
  «N opérations importées · M ignorées (types non gérés) · P déjà présentes». Created supports
  appear in the card.
- After import, **open** supports with no declared current value show a clear prompt
  «déclare la valeur actuelle» (reusing the existing update flow). Closed supports already read 0.
- The support **detail** view gains an **operations table** (date, type, qté, prix, frais, net) —
  the audit/verification surface, alongside the existing valuations + flows.

## Verification path (north star)

Every figure traces to a CSV row: the operations table shows each imported line; a flow = `−net`
of its operation; the share count = Σ signed quantities. The user can reconcile the imported
flows against the CSV to the cent, and the TRI/TTWROR against the flows + the declared value.

## Privacy

The CSV is a local file the user already downloaded; parsing is 100% local, no network. The real
file is used only as a `spike-fixtures/` dev fixture (gitignored, never committed); unit tests use
small **synthetic** CSVs with the same format.

## Out of scope (this brick)

- The **price feed** (auto valuation of open positions) — Phase B, ADR-018.
- Dividends / OST / coupon operation types — flagged & skipped in v1 (add when a real one appears).
- Other brokers' formats — this parser targets the Fortuneo bourse CSV; a second format is a later
  brick (the operations table is broker-agnostic).
- AV supports (fonds €, UC) — no Fortuneo CSV; stay manual/declared.

## Open questions for the maintainer

1. **Target wrapper on import** — pick-existing-or-create in the import dialog (proposed). OK, or
   should the import always create a new wrapper named e.g. "PEA Fortuneo"?
2. **Fees in the flow** — the flow uses `Montant net` (incl. brokerage), so fees count as invested
   capital (they reduce your return — arguably correct). Acceptable, or track fees separately and
   base the flow on `Montant brut`?
3. **Auto opening/closing 0-valuations** — proposed so performance computes without extra entry.
   Acceptable, or would you rather the support stay "no perf yet" until you declare a value?
