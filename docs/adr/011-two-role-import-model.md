# ADR-011 — Two-role import model and cross-source backfill clipping

- **Status** : Proposed
- **Date** : 2026-05-21
- **Category** : Data, Process

## Context

ADR-008 corrected a false premise of Epic #23 and established a two-role
import model: OFX is the primary ongoing path, PDF is relegated to one-time
historical backfill for transactions older than the OFX rolling window. It
froze the cross-source identity contract — `tx_hash` is source-specific and we
never attempt cross-source hash equality — and deferred the PDF backfill to a
later story (#75). This ADR governs that story.

The PDF import pipeline already exists and works end to end (#24–#31a,
deterministic extraction #27). Story #75 does not add "PDF import". It adds the
backfill **role semantics** and a guard against the one failure mode the frozen
contract leaves open.

**The failure mode.** A real transaction imported through both PDF and OFX
receives two different `tx_hash` values — PDF uses a content+order hash, OFX
uses `sha256(accountId | 'ofx' | fitid)`. The `UNIQUE (account_id, tx_hash)`
constraint cannot see them as the same row, so both persist: a **double
count**. Same-source re-import is already safe (identical hash dedups). The
only unprotected case is a PDF whose dates fall inside a period already covered
by OFX. A double count silently corrupts multi-year aggregates — precisely the
failure the north star (ADR-009) forbids.

**The constraint that shapes the fix.** Bank statements have fixed,
bank-issued boundaries (monthly for LCL). The OFX window is a rolling ~3-month
range starting on an arbitrary date. A monthly PDF statement therefore
routinely _straddles_ the OFX start date — part of it predates OFX coverage,
part of it does not. The user cannot choose where a statement ends.

## Decision

1. **The import role is derived from file format, not chosen by the user.**
   OFX = primary ongoing flux; PDF = historical backfill. (Recorded from
   ADR-008.)

2. **Cross-source overlap is handled by clipping at transaction granularity,
   with a mandatory report.** On a PDF import, transactions whose date falls
   inside a date range already covered by an OFX import on the same account are
   not persisted; the rest are. Every PDF import reports what was imported and
   what was skipped, with date ranges and the reason. Three cases fall out of
   one rule:
   - No overlap → all transactions imported.
   - Partial straddle → the pre-OFX-coverage portion is imported, the rest
     skipped.
   - Fully covered → nothing imported; the report states the period is already
     covered by OFX.

3. **Arithmetic verification (ADR-003) runs on the full extracted statement.**
   It proves extraction fidelity (`opening + Σcredits − Σdebits == closing`).
   The clip is a persistence-time filter applied _after_ verification,
   alongside the existing hash-dedup filter. Verify the whole, persist the new
   subset. The trust guarantee is unaffected.

4. **Overlap is reasoned at the date/period level, never by cross-source hash
   equality** — consistent with the frozen identity contract of ADR-008.

5. **Same-source overlap stays non-blocking.** PDF↔PDF and OFX↔OFX overlaps are
   already deduplicated by the `UNIQUE (account_id, tx_hash)` constraint and
   need no special handling.

6. **Backfill is LCL-only.** It reuses deterministic extraction (#27) and the
   seeded LCL column mapping (migration 002). LLM column mapping (#32) stays
   deferred; multi-bank backfill is out of scope.

## Alternatives considered

- **Hard reject on any overlap.** Rejected: bank statement boundaries are
  fixed, so a straddling monthly statement could never be imported at all —
  permanently losing its non-overlapping (pre-OFX) transactions. Telling the
  user to supply "a statement ending before <date>" asks for something they
  cannot control.

- **Warn and let the user override.** Rejected: a single click-through
  produces silently corrupted multi-year data — the precise failure the product
  cannot afford. ADR-005's mandatory human review exists to catch extraction
  errors, not to authorise a known double count.

- **Silent clip, no report.** Rejected: dropping transactions without telling
  the user violates verifiability. The report is what makes clipping
  acceptable — the user sees exactly what was skipped and why.

## Consequences

- A PDF backfill can never double-count against OFX, by construction.
- The user imports whatever statement the bank provides; the system takes the
  useful part and accounts for the rest.
- A new persistence-time filter (date-range clip) joins the existing
  hash-dedup filter — a small, well-bounded addition, not a pipeline rewrite.
- The import result gains a "skipped — already covered" report channel,
  surfaced in the backfill UI (Story #75, T3).
- No new `ImportError` code: a fully-covered statement is a normal
  zero-import outcome, not an error.
- Multi-bank backfill remains blocked on #32 — acceptable, LCL is the only
  real use case today.
- ADR-008's frozen identity contract is honoured unchanged.

> Promoted from Proposed to Accepted at Story #75, Task T5 (#105).
