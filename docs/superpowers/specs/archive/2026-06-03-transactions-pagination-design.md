# Design — Transactions page pagination

Date: 2026-06-03

## Problem

`TransactionsPage` loads the full account history and renders every filtered row into
`TxTable` at once. On an account with thousands of transactions this produces thousands of
DOM rows in a single pass (slow, heavy to scroll) and is uncomfortable to read.

## Goal

Paginate the filtered result client-side: render only the current page. This caps the DOM
regardless of history size (performance) and breaks the list into digestible chunks
(readability).

Non-goals: virtualization (the page cap already bounds the DOM — no dependency needed),
server-side paging (filtering is already client-side over a fully-loaded set), a page-size
selector or numbered page buttons (avoided to keep the UI control-light).

## Decision

Client-side pagination of the already-filtered array. Page size fixed at 25. Controls are
Previous / Next + a "Page X / Y" indicator. No new component or dependency — the markup is
inline (single use; extract only on a second consumer per the repo's anti-over-engineering
posture).

## Design — changes to `src/renderer/pages/TransactionsPage.tsx`

### State and derivation

- Module constant `const PAGE_SIZE = 25;`.
- `const [page, setPage] = useState(1);` (1-based).
- `const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));`
- `const safePage = Math.min(page, pageCount);` — guards against `page` pointing past the
  end after the result set shrinks.
- `const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);` — this
  replaces `filtered` as the input to `TxTable` (`rows={pageRows.map(toTxRow)}`).

### Page reset

- `useEffect(() => { setPage(1); }, [period, type, category, query, selectedAccountId]);`
  Resets to page 1 when any filter changes or the account changes.
- Deliberately NOT keyed on `transactions`: reclassifying a transaction bumps the internal
  refresh tick and refetches `transactions`; resetting on that would bounce the user back to
  page 1 after an inline reassign. `safePage` already keeps the view valid if a refetch
  changed the count.

### Controls (rendered only when `pageCount > 1`, below `TxTable`)

- `Button` (variant `ghost`, size `sm`) "Précédent" with a Lucide `ChevronLeft`, `disabled`
  when `safePage <= 1`, `onClick` → `setPage((p) => Math.max(1, p - 1))`.
- Centered indicator `Page {safePage} / {pageCount}` (mono, `text-paper-mute`).
- `Button` (ghost, sm) "Suivant" with a Lucide `ChevronRight`, `disabled` when
  `safePage >= pageCount`, `onClick` → `setPage((p) => Math.min(pageCount, p + 1))`.
- Lucide icons only — no emoji in chrome (matches CLAUDE.md).

### Unchanged

- The header result count keeps showing the TOTAL filtered count (`{filtered.length} résultats`),
  not the per-page count.
- Both empty states (import-empty, filtered-empty) are unchanged and take precedence over the
  table + controls.

## Testing — additions to `tests/unit/renderer/TransactionsPage.test.tsx`

- With a fixture of > 25 matching transactions: only 25 rows render, and "Page 1 / N" shows.
- Clicking "Suivant" advances to page 2 (a row that belongs to the second slice becomes
  visible; a first-page-only row disappears); "Précédent" becomes enabled.
- "Précédent" is disabled on page 1; "Suivant" is disabled on the last page.
- Changing a filter while on page 2 resets to page 1.
- With <= 25 results (the existing 3-transaction fixture): no pagination controls render.

## Definition of done

Lint clean, `tsc --noEmit` clean, unit tests green, `npm run build` succeeds.
