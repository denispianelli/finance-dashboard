# 8. OFX primary, PDF relegated to historical backfill

Date: 2026-05-18
Status: Accepted

## Context

Epic #23 assumed "PDF is the only usable format (LCL no longer offers CSV
export)". This is false: LCL exports OFX, CSV and QIF over a ~3-month rolling
window, plus a 10-year PDF statement archive.

## Decision

OFX becomes the primary, ongoing import path (structured, bank-assigned
`<FITID>` per transaction, no column mapping). PDF is relegated to one-time
historical backfill for transactions older than the OFX window — a separate
later story. CSV/QIF are not implemented (OFX is strictly superior for the same
source and window). The LLM column-mapping (#32) is deferred indefinitely.

### Frozen cross-source identity contract

`UNIQUE (account_id, tx_hash)` is the dedup engine. One column cannot both match
across sources by content and distinguish true same-day duplicates, so we do
not attempt cross-source hash equality:

- OFX: `tx_hash = sha256(accountId | 'ofx' | fitid)`
- PDF: unchanged content+order hash
- Cross-source PDF↔OFX double-import is prevented by the existing
  `checkPeriodOverlap` warning plus procedure (backfill PDF only for the
  pre-OFX era), never by hash equality.

The future PDF-backfill story conforms to this contract without rework.

## Consequences

- Reliable ongoing imports; FITID makes re-import idempotent.
- Epic #23's strategy section is superseded; see Story #58.
- A nullable `fitid` column is added to `transactions` for traceability.
