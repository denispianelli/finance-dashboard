import type { PeriodVerdict } from '../../lib/reports';
import { Label } from '../ui/overline';
import { formatEuro, formatSignedEuro } from '../../lib/euro';
import { cn } from '../../lib/utils';

export type VerdictKind = 'income' | 'expense' | 'result';

export interface VerdictRowProps {
  verdict: PeriodVerdict;
  /** Click a pastille to drill into the transactions behind it. */
  onSelect?: (kind: VerdictKind) => void;
}

function Pastille({
  label,
  value,
  color,
  onClick,
}: {
  label: string;
  value: string;
  color?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: color ?? 'var(--paper)' }}
        />
        <Label>{label}</Label>
      </div>
      <span
        className="whitespace-nowrap font-serif text-[34px] italic leading-none tracking-[-0.02em] [font-variant-numeric:lining-nums_tabular-nums]"
        style={{ color: color ?? 'var(--paper)' }}
      >
        {value}
      </span>
    </>
  );
  const base = 'flex flex-1 flex-col gap-3 rounded-lg border border-line-2 bg-ink-2 px-[22px] py-5';
  if (onClick === undefined) return <div className={base}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(base, 'text-left transition-colors hover:border-brass/60')}
      title="Voir les transactions"
    >
      {content}
    </button>
  );
}

/** The hero: three pastilles — money in, money out, and the signed result (the verdict). */
export function VerdictRow({ verdict, onSelect }: VerdictRowProps) {
  const resultColor = verdict.positive ? 'var(--color-income)' : 'var(--color-expense)';

  return (
    <div className="flex flex-col gap-3.5 sm:flex-row">
      <Pastille
        label="Entrées"
        value={formatEuro(verdict.income)}
        color="var(--color-income)"
        onClick={
          onSelect
            ? () => {
                onSelect('income');
              }
            : undefined
        }
      />
      <Pastille
        label="Sorties"
        value={formatEuro(Math.abs(verdict.expense))}
        color="var(--color-expense)"
        onClick={
          onSelect
            ? () => {
                onSelect('expense');
              }
            : undefined
        }
      />
      <Pastille
        label="Résultat"
        value={formatSignedEuro(verdict.net)}
        color={resultColor}
        onClick={
          onSelect
            ? () => {
                onSelect('result');
              }
            : undefined
        }
      />
    </div>
  );
}
