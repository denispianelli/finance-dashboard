# ADR-015 — Learned account routing for multi-file import

- **Status** : Accepted
- **Date** : 2026-06-03
- **Category** : Data, UI, Process
- **Related** : ADR-002 (privacy-first local), ADR-004 (LLM is batch classifier only), ADR-007 (Electron security / typed IPC), ADR-008 (OFX primary / PDF backfill, frozen identity contract), ADR-009 (north star, LLM scope), ADR-011 (two-role import)

## Context

Import is single-file: the user picks one statement, and an account must be
chosen **before** extraction because `accountId` feeds `tx_hash`, deduplication
and period-overlap (ADR-006, ADR-008). A user with a year of monthly statements
repeats pick → choose account → review → confirm once per file.

Two gaps to close, decided with the maintainer:

1. **Multi-file** — select or drag several statements and process them in one
   pass.
2. **Account routing** — stop asking which account a statement belongs to when
   the file itself already identifies it. OFX carries `<BANKID>`/`<ACCTID>` in
   `<BANKACCTFROM>`; French PDF statements print an IBAN/RIB in the header. The
   identifier is in the file; today it is discarded (`ACCTID` falls through the
   OFX token switch) and `accounts` has no column to match it against.

Constraints that shape the decision:

- **The LLM stays a background batch classifier (ADR-009).** Reading an account
  number is deterministic parsing — an OFX field, a header regex — not
  reasoning. It must not grow the classifier's role.
- **`accountId` is needed before the hash step.** Auto-routing therefore
  requires reading the identifier from the file _before_ full extraction, which
  means the current "choose account first" flow must change.
- **A wrong auto-route is corrupting** — it files transactions under the wrong
  account. Routing must be high-precision and user-correctable.
- **100% local (ADR-002).** Matching is local SQLite; no network.

## Decision

1. **Account routing is learned implicitly, mirroring the "learn bank" pattern.**
   The first time an identifier is seen, the user confirms the account (existing
   or created inline); that mapping is recorded and every later statement with
   the same identifier routes silently. One question per account, ever — never
   repeated. This reuses the codebase's established learn-once-then-automatic
   shape (`bank_column_mappings`) and matches the maintainer's smart-by-default
   preference.

2. **Routes live in a dedicated `account_identifiers` table, not a column on
   `accounts`.** `identifier TEXT PRIMARY KEY → account_id REFERENCES accounts(id)
ON DELETE CASCADE`. A table supports the real shape — one account can be known
   by several identifiers (an OFX key _and_ an IBAN key) — and deleting an
   account drops its routes by cascade. The mapping is upserted at confirm time,
   as a side effect of a successful import; no separate "learn route" UI.

3. **Identifiers are normalized, source-specific keys; no cross-source
   reconciliation.** OFX → `ofx:<bankid>:<acctid>`; PDF → `iban:<digits>` (IBAN
   stripped of spaces, upper-cased). The same physical account imported once via
   OFX and once via PDF learns two keys that both point to it — correct, if
   mildly redundant. We deliberately do **not** parse the account number out of
   an IBAN to match it against an OFX `ACCTID`: that reconciliation is fragile
   and unnecessary, since the user confirms once per key and the result is
   correct either way.

4. **A lightweight `import:resolveAccount(path)` reads the identifier before
   extraction.** It reads only what identifies the account (OFX: tokens up to
   `BANKACCTFROM`; PDF: page-1 header text + IBAN/RIB regex), looks up the route
   table, and returns `{ identifier | null, matchedAccountId | null, sourceType,
detectedBank? }`. The existing `import:extract` / `import:confirm` then run
   **unchanged** with the resolved `accountId`. Full extraction still happens
   exactly once.

5. **Multi-file is renderer-side orchestration over the unchanged per-file
   pipeline.** `import:pickFile` gains `multiSelections` and returns
   `paths: string[]`; a drop zone resolves absolute paths via
   `webUtils.getPathForFile` exposed through the preload (renderer does no file
   I/O — ADR-002/007 intact). The queue runs resolve → extract → review →
   confirm per file; one file's failure is recorded and never aborts the batch.

6. **No LLM involvement.** Identifier extraction is deterministic. The classifier
   scope of ADR-009 is unchanged.

## Alternatives considered

- **An `account_number` / `iban` column on `accounts`.** Rejected: a single
  column cannot hold both an OFX key and an IBAN key for the same account, and
  it conflates the user-facing account record with its matching keys. A join
  table is the honest model and cascades cleanly on delete.

- **LLM-extracted account identity.** Rejected: violates ADR-009 (classifier
  only) for a problem that is plain parsing — an OFX field and a header regex.
  Slower and less reliable than the deterministic read.

- **Per-file manual account picker (pre-filled with the previous file's
  account).** Considered and rejected by the maintainer: it still asks on every
  file. Learned routing asks at most once per account.

- **Reconcile IBAN ↔ OFX `ACCTID` into one canonical key.** Rejected:
  French-IBAN-to-account-number parsing is brittle and buys only the removal of
  a one-time confirmation on the second source. Per-source keys are simpler and
  equally correct.

- **One account for the whole batch (no routing).** Rejected by the maintainer
  in favour of true auto-routing; kept here only as the trivial fallback the
  queue degrades to when no identifier is readable.

## Consequences

- New persistent concept: a learned identifier→account map. Small, well-bounded
  (`account_identifiers`, migration 010), cascading on account delete.
- The import flow inverts at the front: account is resolved _from_ the file, not
  chosen _before_ it. The per-file extraction/dedup/overlap internals are
  untouched — the change is a new `resolveAccount` step plus a confirm-time
  upsert, not a pipeline rewrite.
- First import of any account still asks once (route unknown) — expected, and the
  inline create-account path already exists.
- **PDF without a readable IBAN** → `identifier: null` → the file falls back to a
  manual account pick and cannot be learned; every such file asks again.
  Acceptable, surfaced, and self-improving once any identifier-bearing source for
  that account is imported.
- **Wrong-route risk** is mitigated by construction: a route is only created by
  the user confirming a real import, and the resolved account is shown and
  editable in review before persistence.
- Multi-file is purely additive orchestration; single-file import is the N=1
  case of the same queue.
- `PickFileResponse` changes shape (`path` → `paths`); its previously-computed
  `type`/`hash`/`size`/`alreadyImported` fields were unused by the renderer and
  are dropped.
- Privacy unchanged: identifier reads happen in main, matching is local SQLite,
  no network.

> Not reflected in the README (stack/engine/model unchanged) — no README update
> needed. Accepted: the implementation landed (migration 010, `resolveAccount`,
> renderer queue, confirm-time upsert) with the design spec's Definition of Done
> met — lint/tsc/build clean, unit + integration tests green.
