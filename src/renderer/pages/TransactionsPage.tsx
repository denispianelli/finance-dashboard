import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Calendar, Search, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { ipc } from '@renderer/ipc/client';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CardTitle } from '../components/ui/card';
import { Overline } from '../components/ui/overline';
import { Select } from '../components/ui/select';
import { AccountTabs } from '../components/dashboard/AccountTabs';
import { TxRowFull } from '../components/dashboard/TxRowFull';
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
import { formatEuroRounded, formatSignedEuro, MINUS } from '../lib/euro';
import { cn } from '../lib/utils';
import type { AppOutletContext } from '../lib/outletContext';

/** Load the whole account history; the client-side filters do the rest. */
const FULL_HISTORY_LIMIT = 100000;
/** Sentinel select value mapping to "uncategorized" (null) in the filter. */
const NONE = '__none__';
/** Approximate rendered height of one rich row. */
const ROW_ESTIMATE = 76;

const TYPES: { value: TxType; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'income', label: 'Revenus' },
  { value: 'expense', label: 'Dépenses' },
];

/** Canonical FIELD control from the handoff: 42px tall, r-sm (12px) radius, glass
 *  surface, 13.5px text. (`rounded-sm` = 12px in this repo's overridden scale.) */
const FIELD =
  'h-[42px] rounded-sm border border-line-2 bg-surface px-3.5 text-[13.5px] text-paper outline-none';

type PeriodPreset = 'all' | 'month' | '30d' | '90d' | 'year';

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 'all', label: 'Toute la période' },
  { value: 'month', label: 'Ce mois-ci' },
  { value: '30d', label: '30 derniers jours' },
  { value: '90d', label: '3 derniers mois' },
  { value: 'year', label: 'Cette année' },
];

const SEG_BTN =
  'h-[30px] whitespace-nowrap rounded-full px-3.5 font-sans text-[12.5px] font-medium transition-colors';

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
    <div className="inline-flex gap-0.5 rounded-full border border-line-2 bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => {
            onChange(o.value);
          }}
          className={cn(
            SEG_BTN,
            value === o.value ? 'bg-brass text-accent-ink' : 'text-paper-mute hover:text-paper',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Compute {from, to} for a period preset, anchored on the latest transaction
 * date rather than today. This way preset filters are coherent for real bank
 * data that doesn't extend to the current day.
 */
function presetToRange(
  preset: PeriodPreset,
  anchor: string,
): { from: string | null; to: string | null } {
  if (preset === 'all') return { from: null, to: null };
  const to = anchor;
  let from: string;
  switch (preset) {
    case 'month':
      from = `${anchor.slice(0, 7)}-01`;
      break;
    case 'year':
      from = `${anchor.slice(0, 4)}-01-01`;
      break;
    case '30d':
      from = periodStart('30d', anchor) ?? '1900-01-01';
      break;
    case '90d':
      from = periodStart('3m', anchor) ?? '1900-01-01';
      break;
  }
  return { from, to };
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

  const [type, setType] = useState<TxType>('all');
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<PeriodPreset>('all');

  // Anchor: the latest transaction date (or today if none).
  const anchor = useMemo(() => {
    if (transactions.length === 0) return toLocalISODate(new Date());
    const first = transactions[0];
    return transactions.reduce((max, t) => (t.date > max ? t.date : max), first?.date ?? '');
  }, [transactions]);

  const { from, to } = useMemo(() => presetToRange(period, anchor), [period, anchor]);

  const filtered = useMemo(() => {
    const filters: TxFilters = {
      from,
      to,
      type,
      query,
      categoryId: category === NONE ? null : category,
    };
    return filterTransactions(transactions, filters);
  }, [transactions, from, to, type, query, category]);

  // Live totals from the filtered set.
  const { totalIn, totalOut } = useMemo(() => {
    let inSum = 0;
    let outSum = 0;
    for (const t of filtered) {
      if (t.amount > 0) inSum += t.amount;
      else outSum += t.amount;
    }
    return { totalIn: inSum, totalOut: outSum };
  }, [filtered]);

  // Whether any filter is active (for the Reset button). The account is always
  // auto-selected by useDashboard (the view is per-account, not an all-accounts
  // aggregate), so it is NOT treated as a clearable filter here.
  const anyFilterActive = type !== 'all' || query !== '' || category !== 'all' || period !== 'all';

  function resetFilters() {
    setType('all');
    setQuery('');
    setCategory('all');
    setPeriod('all');
  }

  // Eyebrow: selected account name or fallback.
  const acctName = useMemo(() => {
    if (!selectedAccountId) return 'Tous les comptes';
    const found = accounts.find((a) => a.id === selectedAccountId);
    return found?.name ?? 'Tous les comptes';
  }, [selectedAccountId, accounts]);

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
      {/* Account filter cards (one row, wraps) */}
      <AccountTabs
        accounts={accounts.map(toAccount)}
        activeId={selectedAccountId ?? ''}
        onSelect={selectAccount}
      />

      {/* Container card — flat --surface panel, dropdowns portal out so it needs no
          overflow handling. */}
      <div className="flex min-h-0 flex-1 flex-col rounded-[20px] border border-line-2 bg-surface p-6 shadow-glass">
        {/* Header: eyebrow + title · live Entrées / Sorties totals */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Overline>{acctName}</Overline>
            <CardTitle>Transactions</CardTitle>
          </div>
          <div className="flex gap-[22px]">
            <div className="flex flex-col gap-[3px]">
              <span className="text-[11px] text-paper-mute">Entrées</span>
              <span className="font-mono text-base font-semibold tabular-nums text-income">
                + {formatEuroRounded(totalIn)}
              </span>
            </div>
            <div className="flex flex-col gap-[3px]">
              <span className="text-[11px] text-paper-mute">Sorties</span>
              <span className="font-mono text-base font-semibold tabular-nums text-expense">
                {MINUS} {formatEuroRounded(Math.abs(totalOut))}
              </span>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="mb-2 mt-5 flex flex-wrap items-center gap-3">
          <Segmented options={TYPES} value={type} onChange={setType} />

          {/* Search input with icon */}
          <span className="relative flex min-w-[200px] flex-1 items-center">
            <span className="pointer-events-none absolute left-3.5 flex text-paper-mute">
              <Search size={16} strokeWidth={1.8} />
            </span>
            <input
              type="search"
              aria-label="Rechercher une transaction"
              placeholder="Rechercher une transaction…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              className={cn(FIELD, 'w-full pl-10 placeholder:text-paper-dim focus:border-line-3')}
            />
          </span>

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
            icon={SlidersHorizontal}
            triggerLabel={category === 'all' ? 'Catégorie' : undefined}
          />

          <Select
            ariaLabel="Période"
            value={period}
            onValueChange={(v) => {
              setPeriod(v as PeriodPreset);
            }}
            options={PERIOD_OPTIONS}
            className="min-w-[160px]"
            icon={Calendar}
          />

          {anyFilterActive && (
            <button
              type="button"
              onClick={resetFilters}
              className={cn(FIELD, 'inline-flex cursor-pointer items-center gap-2 text-paper-mute')}
            >
              <X size={15} strokeWidth={1.8} />
              Réinitialiser
            </button>
          )}
        </div>

        {transactions.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-[52px] text-center text-sm text-paper-mute">
            Aucune transaction — importez un relevé pour commencer.
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-[52px] text-center text-sm text-paper-mute">
            <SearchX size={28} strokeWidth={1.5} className="mb-2.5 text-paper-dim" />
            <div>Aucune transaction ne correspond à ces filtres.</div>
          </div>
        ) : (
          <div className="mt-1 flex min-h-0 flex-1 flex-col">
            <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto px-3.5">
              {/* listRef sits below the top of the scroll container; scrollMargin = offsetTop so
                  each row is translated by (vi.start - scrollMargin). */}
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
                      <TxRowFull
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
            {/* Footer: result count + net balance */}
            <div className="flex items-center justify-between pt-4 text-[12.5px] text-paper-mute">
              <span>
                {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
              </span>
              <span>
                Solde net{' '}
                <span className="ml-1.5 font-mono tabular-nums text-paper">
                  {formatSignedEuro(totalIn + totalOut)}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>
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
