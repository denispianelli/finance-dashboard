import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { ipc } from '@renderer/ipc/client';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Overline } from '../components/ui/overline';
import { Select } from '../components/ui/select';
import { AccountTabs } from '../components/dashboard/AccountTabs';
import { TxTableHeader, TxTableRow } from '../components/dashboard/TxTable';
import { PeriodFilter, type DateRangeValue } from '../components/dashboard/PeriodFilter';
import { RuleDialog, type RuleProposal } from '../components/categories/RuleDialog';
import { useDashboard } from '../hooks/useDashboard';
import { toAccount, toTxRow } from '../lib/dashboardMap';
import {
  filterTransactions,
  periodStart,
  toLocalISODate,
  type TxFilters,
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

const TYPES: { value: TxType; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'income', label: 'Revenus' },
  { value: 'expense', label: 'Dépenses' },
  { value: 'transfer', label: 'Transferts' },
  { value: 'refund', label: 'Remboursements' },
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
  const [ruleProposal, setRuleProposal] = useState<RuleProposal | null>(null);
  const {
    accounts,
    transactions,
    categories,
    selectedAccountId,
    selectAccount,
    reassign,
    refresh,
    createCategory,
    updateTransaction,
    deleteTransaction,
  } = useDashboard(refreshToken, {
    transactionLimit: FULL_HISTORY_LIMIT,
    onProposeRule: setRuleProposal,
  });

  const [editingId, setEditingId] = useState<string | null>(null);

  // Pre-select the account passed via ?account=… (e.g. clicking an account on the
  // dashboard navigates here), once per param value. The guard is essential:
  // `accounts` gets a new identity on every refetch (edit / delete / background
  // categorization), and without it the effect would re-fire and snap the view
  // back to the URL's account after the user manually switched tabs.
  const [searchParams] = useSearchParams();
  const accountParam = searchParams.get('account');
  const appliedAccountParam = useRef<string | null>(null);
  useEffect(() => {
    if (accountParam === null || appliedAccountParam.current === accountParam) return;
    if (accounts.some((a) => a.id === accountParam)) {
      appliedAccountParam.current = accountParam;
      selectAccount(accountParam);
    }
  }, [accountParam, accounts, selectAccount]);

  const [today] = useState(() => toLocalISODate(new Date()));
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: periodStart('30d', today),
    to: today,
  }));
  const [type, setType] = useState<TxType>('all');
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const filters: TxFilters = {
      from: range.from,
      to: range.to,
      type,
      query,
      categoryId: category === NONE ? null : category,
    };
    return filterTransactions(transactions, filters);
  }, [transactions, range, type, query, category]);

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
    // Fill the available viewport height so the page itself doesn't scroll (no outer
    // scrollbar); only the transaction list scrolls, inside its own container.
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <AccountTabs
        accounts={accounts.map(toAccount)}
        activeId={selectedAccountId ?? ''}
        onSelect={selectAccount}
      />

      <Card className="min-h-0 flex-1">
        <CardHeader>
          <div className="flex min-w-0 flex-col gap-1">
            <Overline>Activité</Overline>
            <CardTitle>Transactions</CardTitle>
          </div>
          <span className="font-mono text-xs text-paper-mute">
            {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
          </span>
        </CardHeader>

        <div className="flex flex-wrap items-center gap-3 pb-4">
          <PeriodFilter value={range} onChange={setRange} today={today} />
          <Segmented options={TYPES} value={type} onChange={setType} />
          <Select
            ariaLabel="Catégorie"
            value={category}
            onValueChange={setCategory}
            options={[
              { value: 'all', label: 'Toutes catégories' },
              { value: NONE, label: 'Sans catégorie' },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
            className="min-w-[150px]"
          />
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
          <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
            <div className="sticky top-0 z-10 bg-ink-2">
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
                        void reassign(txId, catId, t.labelClean);
                      }}
                      onCreateCategory={createCategory}
                      editing={editingId === t.id}
                      onStartEdit={(id) => {
                        setEditingId(id);
                      }}
                      onSaveEdit={(id, fields) => {
                        void updateTransaction({
                          transactionId: id,
                          date: fields.date,
                          label: fields.label,
                          amount: fields.amount,
                        });
                        setEditingId(null);
                      }}
                      onCancelEdit={() => {
                        setEditingId(null);
                      }}
                      onDelete={(id) => {
                        void deleteTransaction(id);
                      }}
                      onUnlinkLoan={(id) => {
                        void ipc
                          .invoke('patrimoine:unlinkPayment', { transactionId: id })
                          .then(() => {
                            refresh();
                          });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
      <RuleDialog
        proposal={ruleProposal}
        categories={categories}
        onClose={() => {
          setRuleProposal(null);
        }}
        onCreated={() => {
          refresh();
        }}
      />
    </div>
  );
}
