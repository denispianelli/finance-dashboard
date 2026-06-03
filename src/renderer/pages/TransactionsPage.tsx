import { useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Overline } from '../components/ui/overline';
import { AccountTabs } from '../components/dashboard/AccountTabs';
import { TxTableHeader, TxTableRow } from '../components/dashboard/TxTable';
import { useDashboard } from '../hooks/useDashboard';
import { toAccount, toTxRow } from '../lib/dashboardMap';
import {
  filterTransactions,
  toLocalISODate,
  type TxFilters,
  type TxPeriod,
  type TxType,
} from '../lib/filterTransactions';
import { cn } from '../lib/utils';
import type { AppOutletContext } from '../lib/outletContext';

/** Load the whole account history; the client-side filters do the rest. */
const FULL_HISTORY_LIMIT = 100000;
/** Sentinel select value mapping to "uncategorized" (null) in the filter. */
const NONE = '__none__';
/** Approximate rendered height of one row, used as the virtualizer's size estimate. */
const ROW_ESTIMATE = 57;

const PERIODS: { value: TxPeriod; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: '30d', label: '30 jours' },
  { value: '3m', label: '3 mois' },
  { value: 'year', label: 'Cette année' },
];

const TYPES: { value: TxType; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'income', label: 'Revenus' },
  { value: 'expense', label: 'Dépenses' },
];

const SEG_BTN = 'h-7 rounded-md px-2.5 font-sans text-xs font-medium transition-colors';
const FIELD = 'h-7 rounded-md border border-line-2 bg-ink-2 px-2 font-sans text-xs text-paper';

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex gap-1 rounded-lg border border-line-2 bg-ink-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => {
            onChange(o.value);
          }}
          className={cn(
            SEG_BTN,
            value === o.value ? 'bg-ink-3 text-paper' : 'text-paper-mute hover:text-paper',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TransactionsPage() {
  const { refreshToken } = useOutletContext<AppOutletContext>();
  const {
    accounts,
    transactions,
    categories,
    selectedAccountId,
    selectAccount,
    reassign,
    createCategory,
  } = useDashboard(refreshToken, { transactionLimit: FULL_HISTORY_LIMIT });

  const [today] = useState(() => toLocalISODate(new Date()));
  const [period, setPeriod] = useState<TxPeriod>('all');
  const [type, setType] = useState<TxType>('all');
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const filters: TxFilters = {
      period,
      today,
      type,
      query,
      categoryId: category === NONE ? null : category,
    };
    return filterTransactions(transactions, filters);
  }, [transactions, period, today, type, query, category]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // react-virtual's useVirtualizer returns non-memoizable functions, so React Compiler skips
  // memoizing this component — expected and safe for a leaf list view.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 8,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  return (
    <>
      <AccountTabs
        accounts={accounts.map(toAccount)}
        activeId={selectedAccountId ?? ''}
        onSelect={selectAccount}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3.5">
            <Overline>— III</Overline>
            <CardTitle>Transactions</CardTitle>
          </div>
          <span className="font-mono text-xs text-paper-mute">
            {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
          </span>
        </CardHeader>

        <div className="flex flex-wrap items-center gap-3 pb-4">
          <Segmented options={PERIODS} value={period} onChange={setPeriod} />
          <Segmented options={TYPES} value={type} onChange={setType} />
          <select
            aria-label="Catégorie"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
            }}
            className={FIELD}
          >
            <option value="all">Toutes catégories</option>
            <option value={NONE}>Sans catégorie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="search"
            aria-label="Rechercher"
            placeholder="Rechercher…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            className={cn(FIELD, 'min-w-[160px] flex-1 placeholder:text-paper-dim')}
          />
        </div>

        {transactions.length === 0 ? (
          <p className="py-8 text-center text-sm text-paper-mute">
            Aucune transaction — importez un relevé pour commencer.
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-paper-mute">
            Aucune transaction ne correspond à ces filtres.
          </p>
        ) : (
          <div ref={scrollRef} className="relative max-h-[70vh] overflow-y-auto">
            <div className="sticky top-0 z-10 bg-ink-1">
              <TxTableHeader />
            </div>
            {/* listRef sits below the sticky header, so scrollMargin = header height; each
                row is translated by (vi.start - scrollMargin) to land right under it. */}
            <div
              ref={listRef}
              className="relative"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {rowVirtualizer.getVirtualItems().map((vi) => {
                const t = filtered[vi.index];
                if (!t) return null;
                return (
                  <div
                    key={t.id}
                    data-index={vi.index}
                    ref={(el) => {
                      rowVirtualizer.measureElement(el);
                    }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${String(vi.start - rowVirtualizer.options.scrollMargin)}px)`,
                    }}
                  >
                    <TxTableRow
                      row={toTxRow(t)}
                      categories={categories}
                      onReassign={(txId, catId) => {
                        void reassign(txId, catId);
                      }}
                      onCreateCategory={createCategory}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
