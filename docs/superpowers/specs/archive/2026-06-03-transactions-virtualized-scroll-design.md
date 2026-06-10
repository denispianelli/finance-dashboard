# Design — Transactions list: virtualized continuous scroll (replaces pagination)

Date: 2026-06-03

## Problem

The Transactions page uses bottom-anchored pagination (25/page, Précédent/Suivant). Changing
page means scrolling to the bottom to reach the controls, clicking, then scrolling back up —
clunky. The desired UX is a single continuous, fluid scroll with no page controls.

## Goal

Replace pagination with a virtualized continuous list: the whole filtered history scrolls in
one view, but only the visible rows are rendered (windowing), so performance stays good at
thousands of rows. No page controls, no "change page" action.

Non-goals: server-side paging (filtering stays client-side over the fully-loaded set),
infinite/lazy fetch (the full account history is already loaded), keeping pagination.

## Decision

Use `@tanstack/react-virtual` (`useVirtualizer`) over the already-filtered array, inside a
height-capped scroll container with a sticky column header. This requires refactoring
`TxTable` away from its single shared CSS grid (rows in `display: contents`, which cannot be
positioned) to a per-row grid model that can be virtualized.

## Design

### 1. `TxTable` refactor — `src/renderer/components/dashboard/TxTable.tsx`

Today the component is one CSS grid whose rows use `display: contents`; the `max-content`
columns size against all rows together. Virtualization needs each row to be an independently
positionable box, so rows become **self-contained grids** sharing one fixed-width column
template (description stays `1fr`) so columns still align across rows.

- New exported column template:
  ```
  TX_GRID =
    'grid-cols-[72px_24px_1fr_160px_96px] ' +
    'xl:grid-cols-[84px_28px_1fr_180px_110px_56px_24px]'
  ```
  (date, icon, description `1fr`, category, amount | xl adds: confidence, kebab.)
- Extract and export `TxTableHeader` (the header row) and `TxRow` (one data row), both using
  `TX_GRID` with `grid items-center gap-x-3 xl:gap-x-3.5`.
- `TxRow` is one `<div>` box: row-level `border-b border-line-1` and `hover:bg-ink-3` (moved
  off the individual cells, which previously needed per-cell hover because `contents` rows had
  no box). Cell contents (date, `CategoryIcon`, main/sub labels, category cell with the inline
  `CategoryPicker` when `categories`+`onReassign`+`onCreateCategory` are provided, `Money`,
  confidence, `MoreHorizontal`) are unchanged.
- `TxTable` becomes `<div>{<TxTableHeader/>}{rows.map((r) => <TxRow key={r.id} .../>)}</div>`.
  Its public props (`rows`, `categories?`, `onReassign?`, `onCreateCategory?`) are **unchanged**,
  so `DashboardPage` is unaffected. `key` moves from array index to `row.id`.
- Visual delta: the previously `max-content` columns become fixed-width; widths are chosen to
  match current rendering closely (tunable). This affects the dashboard table too.

### 2. `TransactionsPage` — virtualized list, pagination removed

- Remove all pagination: the `page`/`storedKey`/`keyChanged` state, the during-render reset,
  `PAGE_SIZE`, `safePage`/`pageCount`/`pageRows`, and the Précédent/Suivant controls (and the
  `ChevronLeft`/`ChevronRight`/`Button` imports if otherwise unused).
- Add `@tanstack/react-virtual`. Build the list as:
  ```
  const parentRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null); // the inner list wrapper, for scrollMargin
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 57,
    overscan: 8,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });
  ```
- Markup (only in the non-empty branch):
  ```
  <div ref={parentRef} className="relative max-h-[70vh] overflow-y-auto">
    <div className="sticky top-0 z-10 bg-ink-1">
      <TxTableHeader />
    </div>
    <div ref={listRef} style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
      {rowVirtualizer.getVirtualItems().map((vi) => {
        const t = filtered[vi.index];
        if (!t) return null;
        return (
          <div
            key={t.id}
            data-index={vi.index}
            ref={rowVirtualizer.measureElement}
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%',
              transform: `translateY(${vi.start - rowVirtualizer.options.scrollMargin}px)`,
            }}
          >
            <TxRow row={toTxRow(t)} categories={categories}
                   onReassign={(id, cat) => { void reassign(id, cat); }}
                   onCreateCategory={createCategory} />
          </div>
        );
      })}
    </div>
  </div>
  ```
  The sticky header keeps column labels visible; `scrollMargin` aligns the virtualizer under it.
- The card-header result count keeps showing the full filtered total (`{filtered.length} résultats`).
- Both empty states (import-empty, filtered-empty) unchanged and take precedence over the list.

### 3. Testing

- **jsdom infra** (`tests/setup/renderer.ts`): jsdom has no layout, so the virtualizer would
  render nothing. Add a `ResizeObserver` stub and a fake measurement so a deterministic window
  renders: stub `Element.prototype.getBoundingClientRect` (height ~700 for the scroll element,
  ~57 for rows) and/or `HTMLElement.prototype.offsetHeight`. Keep it minimal and global.
- **`TransactionsPage.test.tsx`:** remove the 5 pagination tests. Keep/adapt: renders rows by
  default, requests full history (`limit: 100000`), search filter, type filter, category
  filter, filtered-empty, import-empty. Add one virtualization test: with a 30-row fixture,
  fewer than 30 rows are in the DOM (windowing) while "Op 00" is visible.
- **`DashboardPage.test.tsx`:** must stay green unchanged (TxTable API preserved) — verify; the
  preview still caps at 10 and the "Tout voir" link still resolves.

### 4. Definition of done

Lint clean, `tsc --noEmit` clean, unit tests green, `npm run build` succeeds.

## Risks / notes

- The `TxTable` fixed-column widths are the main visual risk; verify the dashboard table still
  looks right and tune widths if needed.
- Sticky-header vs scrollbar-gutter alignment: the header lives inside the scroll container
  (same width context as rows), so no scrollbar-width mismatch.
- React 19 + `@tanstack/react-virtual` v3 are compatible.
