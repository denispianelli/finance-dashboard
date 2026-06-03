# Editable transactions — inline edit + delete with audit trail

- **Date**: 2026-06-03
- **Status**: Draft — pending implementation plan
- **Author**: Denis (PO/Tech Lead) + Claude
- **Related**: ADR-003 (deterministic extraction), ADR-005 (mandatory human review),
  ADR-007 (electron security / IPC pattern), proposed ADR-012 (editable
  transactions with audit trail), Epic #71 (reconciliation — not started)

## 1. Context & problem

The transactions table (`src/renderer/components/dashboard/TxTable.tsx`) ends each
row with a decorative `MoreHorizontal` (`⋯`) icon that does nothing, and the
date column has no header label. Two gaps:

1. There is **no way to correct a transaction** after import. A wrong figure from
   a bad extraction (OCR on a scanned PDF, a mis-detected column), a clearer
   label, or a stray duplicate that deduplication missed all have to be lived
   with.
2. The `⋯` looks actionable but isn't — dishonest UI chrome.

This spec adds **inline edit** (date / label / amount) and **delete** of a
transaction, plus a real "Date" header.

### The verifiability tension

ADR-003 and the arithmetic check (master design spec §5.1) rest on a principle:
the **figures** (amount, date) come _exclusively_ from deterministic extraction
and are never touched by hand. That is what lets the app claim a statement
reconciles to the bank's closing balance — the product's core "you can verify"
promise.

Letting the user edit an amount or date breaks that immutability. The resolution
(see §8 and the proposed ADR-012) is to move verifiability **from immutability to
transparency**: edits are allowed, but the originally-extracted figure is
preserved and the row is visibly marked as manually modified, so nothing is ever
silently overwritten.

## 2. Goals / non-goals

**Goals**

- Inline edit of a transaction's `date`, `label` and `amount`, one row at a time.
- Delete a transaction, with a transient undo.
- Preserve the originally-extracted figures when a row is edited (audit trail).
- Mark edited rows visibly ("modifié manuellement") with the original values on
  hover.
- Add a "Date" column header.
- Record the decision in ADR-012 and amend ADR-003 / ADR-005.

**Non-goals (YAGNI)**

- **No reconciliation engine.** Epic #71 is not started. We only _preserve_ the
  audit data so a future reconciliation can read it; we build no reconciliation
  UI or balance re-check here.
- **No soft delete.** Delete is a hard `DELETE` (see §4.2 for why); undo is held
  in renderer memory for the toast window only — no `deleted_at` column, no
  per-query filter tax.
- **No multi-edit history.** A single "as extracted" snapshot per row is enough;
  no `transaction_edits` log table.
- **No bulk edit / multi-select.**

## 3. Data model — migration `009`

Three nullable, additive columns on `transactions`:

```sql
ALTER TABLE transactions ADD COLUMN original_date TEXT;    -- ISO yyyy-mm-dd as extracted
ALTER TABLE transactions ADD COLUMN original_amount REAL;  -- amount as extracted
ALTER TABLE transactions ADD COLUMN edited_at TEXT;        -- ISO timestamp of last manual edit
```

Semantics:

- **Snapshot once.** On the _first_ manual edit of a row, if `original_date` /
  `original_amount` are `NULL`, copy the current `date` / `amount` into them.
  Subsequent edits do not overwrite the snapshot — it always holds the
  _extracted_ value, not an intermediate one.
- `edited_at` is set on every manual field edit; `NULL` means "never edited by
  hand". It also sets `user_modified = 1` (the existing flag, already set on
  category reassignment — see `src/main/categorize/manage.ts`).
- **Two distinct signals, deliberately:**
  - `edited_at IS NOT NULL` → UX marker "modifié manuellement" (any hand edit,
    including a label-only change).
  - `original_amount IS NOT NULL OR original_date IS NOT NULL` → the **figures**
    changed; this is the signal a future reconciliation keys off.

### Why no `original_label`

`label_raw` already holds the raw extracted label and is **never edited** — only
`label_clean` (the human-readable label shown as the row's main line) is editable.
`label_raw` is already rendered as the row's sub-line, so the original label stays
visible for free. No extra column needed.

### Alternative considered

A normalized `transaction_edits(transaction_id, field, old, new, edited_at)` log
giving full edit history. **Rejected**: overkill for a single-user app — a single
"as extracted" snapshot covers both the audit tooltip and future reconciliation.

## 4. Behaviour

### 4.1 Edit

- One row editable at a time (`editingId` held in `TransactionsPage`).
- The row swaps its date / label / amount cells for inputs, with ✓ (save) / ✕
  (cancel). Category stays its existing inline picker; icon/actions hidden while
  editing.
- **Validation** (client-side, before the IPC call):
  - date: a valid `yyyy-mm-dd`.
  - amount: a parseable number (French input `-84,30` → `-84.30`); sign kept.
  - label: non-empty after trim.
  - Invalid input blocks save and shows an inline error; ✕ always cancels.
- On save → `transactions:update`. The handler snapshots originals (if first
  edit), writes the changed fields, sets `edited_at` + `user_modified = 1`.

### 4.2 Delete

- Trash → a small confirm (inline confirm on the row, not a full modal) → hard
  `DELETE` via `transactions:delete`.
- A toast "Transaction supprimée · Annuler" holds the deleted row **in renderer
  memory** for its lifetime. "Annuler" re-inserts it via `transactions:restore`
  (same `id`, `import_id`, fields, and any `original_*` / `edited_at`), so undo
  is faithful. Once the toast expires the deletion is permanent.

**Why hard delete, not soft delete.** Concretely, a `deleted_at` column buys
almost nothing: undo is transient (held in memory, above), and a future
reconciliation detects "this statement no longer balances" by comparing the sum
of its transactions to the import's closing balance — it does not need the dead
row. Against that, soft delete taxes _every_ transaction query forever with a
`WHERE deleted_at IS NULL`; a single forgotten filter leaks a deleted row into a
total → a wrong figure, which is worse than the gap it closes. Deleting a real
movement _should_ make the statement stop reconciling — that is the honest
outcome, and it needs no preserved row.

### 4.3 "Modifié manuellement" marker

A subtle indicator on edited rows (`edited_at IS NOT NULL`) — a small dot/pill —
with a tooltip showing the original figures (`extrait : -84,30 · 14/05`). This is
the only honesty surface for now; reconciliation (#71) will consume the same
data later.

## 5. IPC contract

Mirrors the existing `transactions:setCategory` mutation
(`src/main/ipc/handlers/categories.ts` → `setTransactionCategory` in
`src/main/categorize/manage.ts`), following ADR-007 end-to-end typing.

| Channel                | Payload                                                                     | Response                                             |
| ---------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------- |
| `transactions:update`  | `{ transactionId: string; date?: string; label?: string; amount?: number }` | `{ ok: true }`                                       |
| `transactions:delete`  | `{ transactionId: string }`                                                 | `{ ok: true; snapshot: DeletedTransactionSnapshot }` |
| `transactions:restore` | `{ transaction: DeletedTransactionSnapshot }`                               | `{ ok: true }`                                       |

`transactions:delete` reads the full row **before** deleting and returns it as
`snapshot`. The renderer stashes that snapshot for the undo toast and passes it
back verbatim to `transactions:restore` — so the renderer never needs to know the
hidden columns (`tx_hash`, `fitid`, `import_id`).

- New types in `src/shared/types/` (e.g. `transaction.ts`), added to `IpcContract`
  in `src/shared/types/ipc.ts`, channel constants in
  `src/main/ipc/channels.ts`, handlers in a new
  `src/main/ipc/handlers/transactions.ts`, registered in
  `src/main/ipc/register.ts`.
- DB-layer functions (new `src/main/transactions/mutate.ts` or extend
  `categorize/manage.ts`): `updateTransaction`, `deleteTransaction`,
  `restoreTransaction`, each `(db, input) => void`, single transaction, throwing
  on a missing id.
- `transactions:update` only accepts the three editable fields; it can never
  touch `account_id`, `import_id`, `tx_hash`, `category_id` (category has its own
  channel).
- `DeletedTransactionSnapshot` carries every column needed to re-insert faithfully
  (id, account_id, import_id, tx_hash, date, amount, label_raw, label_clean,
  category_id, is_internal_transfer, user_modified, fitid, original_date,
  original_amount, edited_at).

### Renderer wiring

`useDashboard` (`src/renderer/hooks/useDashboard.ts`) gains `updateTransaction`,
`deleteTransaction`, `restoreTransaction`, each invoking the channel, bumping the
refresh tick, and toasting success/failure (matching the existing `reassign`).

## 6. Query impact

Adding columns is additive — existing reads keep working — but the new fields must
flow to the renderer where needed:

- `getTransactions` (`src/main/dashboard/queries.ts`): select `original_date`,
  `original_amount`, `edited_at`; map them to the `DashboardTransaction` DTO
  (`src/shared/types/dashboard.ts`) as `originalDate: string | null`,
  `originalAmount: number | null`, `editedAt: string | null`. The renderer derives
  the marker as `editedAt !== null`; the tooltip uses `originalDate` /
  `originalAmount`. No separate `isEdited` field — keep the DTO minimal.
- No `deleted_at` filter anywhere (hard delete) — this is the whole point of §4.2:
  **zero** change to `getAccountSummaries`, dashboard aggregates, or the history
  cascade.

## 7. UI changes (`TxTable` / `TransactionsPage`)

- **Header**: add `Date` over column 1; the category-icon column (2) stays
  header-less.
- **Actions column**: replace the dead `⋯` with **pencil + trash**, shown on row
  hover. Today the action cell is `xl`-only; make it available at all
  breakpoints (rework `TX_GRID` so the base grid carries a slim action column).
- **Edit mode**: `TransactionsPage` owns `editingId`; `TxTableRow` renders inputs
  when its id matches, else the read-only row. Inline validation per §4.1.
- **Marker**: edited rows show the §4.3 indicator with an original-values tooltip.
- **Delete**: trash → inline confirm → delete → undo toast.

## 8. ADR / docs impact

- **New ADR-012 — "Editable transactions with audit trail."** Records the reversal
  of ADR-003's "figures are never touched by hand": verifiability shifts from
  _immutability_ to _transparency_ (original figures preserved, edits marked,
  hard-delete honest-by-construction). Amends ADR-003 and ADR-005 by reference.
- **Amend ADR-003**: note that post-import manual edits are allowed but tracked
  (see ADR-012); figures are still _extracted_ deterministically — editing is an
  explicit, audited user override, not an LLM/automatic mutation.
- **Amend ADR-005**: the Review gate is unchanged; post-import editing is a
  separate, audited path.
- **Master design spec**: note editability in the transactions/table section.

## 9. Testing

- **DB layer (unit)**: `updateTransaction` snapshots originals exactly once
  (second edit keeps the first snapshot), sets `edited_at` + `user_modified`,
  rejects unknown id, never touches non-editable columns; `deleteTransaction`
  removes the row; `restoreTransaction` re-inserts faithfully (including
  `original_*` / `edited_at`).
- **IPC handlers (unit)**: payload → DB-call mapping, like the existing
  `tests/unit/ipc/` suite.
- **Queries (unit)**: `getTransactions` returns the new fields / derived
  `isEdited`.
- **Renderer (unit, jsdom)**: enter edit mode, validate (good + bad input),
  cancel, save; marker + tooltip render on edited rows; delete confirm + undo
  re-inserts.
- **Integration**: import → edit an amount → originals preserved and figures
  signal set; import → delete → row gone → restore → row back.

## 10. Open questions

None blocking. Resolved during design: hard delete (not soft), 3-column snapshot
(not an edits log), inline edit (not a popover), new ADR-012 (not just an
amendment), actions visible at all breakpoints.
