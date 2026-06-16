import { cn } from '@renderer/lib/utils';
import { CategoryIconTile } from '@renderer/lib/categoryIcon';
import { Money } from '../ui/money';
import type { TxRow } from './TxTable';

/**
 * Dashboard recent-transactions list — the reference's rich "TxLine" rows
 * (40px category tile · two-line label/category · right-aligned amount + date).
 * Display-only: reassigning/editing lives on the Transactions page.
 */
export function RecentTxList({ rows }: { rows: TxRow[] }) {
  return (
    <div className="flex flex-col">
      {rows.map((t, i) => (
        <div
          key={t.id}
          className={cn(
            '-mx-3 flex items-center gap-3.5 rounded-md px-3 py-[11px] transition-colors hover:bg-surface',
            i < rows.length - 1 && 'border-b border-line-2',
          )}
        >
          <CategoryIconTile name={t.icon} color={t.catColor} size={40} />

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-sans text-sm text-paper">{t.main}</span>
              {t.edited && (
                <span
                  title={t.originalHint ?? 'Modifié à la main'}
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-flag"
                />
              )}
            </span>
            <span className="inline-flex items-center gap-[7px] font-sans text-xs text-paper-mute">
              <span
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ background: t.catColor }}
              />
              {t.catName}
            </span>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <Money value={t.amount} kind={t.amountKind} className="text-sm font-medium" />
            <span className="font-mono text-[11px] text-paper-dim">{t.date}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
