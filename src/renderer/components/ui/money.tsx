import { cn } from '@renderer/lib/utils';
import { formatEuro, MINUS, NBSP } from '@renderer/lib/euro';

export type MoneyKind = 'income' | 'expense' | 'transfer' | 'plain';

const KIND_CLASS: Record<MoneyKind, string> = {
  income: 'text-sage',
  expense: 'text-coral',
  transfer: 'text-paper-soft',
  plain: 'text-paper-soft',
};

export function Money({
  value,
  kind = 'plain',
  className,
}: {
  value: number;
  kind?: MoneyKind;
  className?: string;
}) {
  const abs = Math.abs(value);
  let prefix = '';
  if (kind === 'income') prefix = `+${NBSP}`;
  else if (kind === 'expense') prefix = `${MINUS}${NBSP}`;
  else if (kind === 'transfer') prefix = `→${NBSP}`;

  return (
    <span className={cn('font-mono tabular-nums tracking-[-0.005em]', KIND_CLASS[kind], className)}>
      {prefix}
      {formatEuro(abs)}
    </span>
  );
}
