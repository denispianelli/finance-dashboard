import { MoreHorizontal } from 'lucide-react';
import { cn } from '@renderer/lib/utils';
import { CategoryIcon } from '@renderer/lib/categoryIcon';
import { Money, type MoneyKind } from '../ui/money';

export interface TxRow {
  date: string;
  icon: string;
  main: string;
  sub: string;
  catColor: string;
  catName: string;
  amount: number;
  amountKind: MoneyKind;
  conf: string;
  confLow?: boolean;
}

const HEAD =
  'font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-paper-mute pb-2.5 border-b border-line-2';
const CELL = 'py-[11px] border-b border-line-1';

export function TxTable({ rows }: { rows: TxRow[] }) {
  return (
    <div className="grid grid-cols-[84px_28px_1fr_max-content_max-content_max-content_24px] items-center gap-x-3.5">
      <span className={HEAD} />
      <span className={HEAD} />
      <span className={HEAD}>Description</span>
      <span className={HEAD}>Catégorie</span>
      <span className={cn(HEAD, 'text-right')}>Montant</span>
      <span className={cn(HEAD, 'text-right')}>Conf.</span>
      <span className={HEAD} />
      {rows.map((t, i) => (
        <div key={i} className="group contents">
          <span
            className={cn(
              CELL,
              'font-mono text-xs tabular-nums text-paper-mute group-hover:bg-ink-3',
            )}
          >
            {t.date}
          </span>
          <span className={cn(CELL, 'group-hover:bg-ink-3')}>
            <CategoryIcon name={t.icon} />
          </span>
          <span className={cn(CELL, 'flex min-w-0 flex-col gap-0.5 group-hover:bg-ink-3')}>
            <span className="truncate font-sans text-[13px] font-medium leading-tight text-paper">
              {t.main}
            </span>
            <span className="font-mono text-[11px] tracking-[0.02em] text-paper-dim">{t.sub}</span>
          </span>
          <span className={cn(CELL, 'group-hover:bg-ink-3')}>
            <span className="inline-flex items-center gap-1.5 font-sans text-[11px] font-medium text-paper-soft">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.catColor }} />
              {t.catName}
            </span>
          </span>
          <span className={cn(CELL, 'text-right group-hover:bg-ink-3')}>
            <Money value={t.amount} kind={t.amountKind} className="text-[13px] font-medium" />
          </span>
          <span
            className={cn(
              CELL,
              'text-right font-mono text-[11px] font-medium group-hover:bg-ink-3',
              t.confLow ? 'text-flag' : 'text-paper-mute',
            )}
          >
            {t.conf}
          </span>
          <span className={cn(CELL, 'flex justify-center text-paper-dim group-hover:bg-ink-3')}>
            <MoreHorizontal size={14} strokeWidth={1.6} />
          </span>
        </div>
      ))}
    </div>
  );
}
