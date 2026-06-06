import type { PeriodVerdict } from '../../lib/reports';
import { Label } from '../ui/overline';
import { formatEuro, formatSignedEuro } from '../../lib/euro';
import { cn } from '../../lib/utils';

export type VerdictKind = 'income' | 'expense' | 'result';

export interface VerdictRowProps {
  verdict: PeriodVerdict;
  /** Human label of the period, e.g. "2023" or "juin 2024". */
  periodLabel: string;
  /** Click a pastille to drill into the transactions behind it. */
  onSelect?: (kind: VerdictKind) => void;
}

function Pastille({
  label,
  value,
  color,
  sub,
  onClick,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
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
      {sub !== undefined && <span className="font-sans text-[11px] text-paper-mute">{sub}</span>}
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
export function VerdictRow({ verdict, periodLabel, onSelect }: VerdictRowProps) {
  const resultColor = verdict.positive ? 'var(--sage)' : 'var(--coral)';
  const bits = [verdict.positive ? 'positif' : 'négatif'];
  if (verdict.deltaPct !== null) {
    bits.push(
      `${verdict.deltaPct >= 0 ? '+' : '−'}${Math.abs(verdict.deltaPct).toFixed(0)} % vs N-1`,
    );
  }
  if (verdict.savingsRate !== null) bits.push(`épargne ${verdict.savingsRate.toFixed(0)} %`);

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Pastille
        label="Entrées"
        value={formatEuro(verdict.income)}
        color="var(--sage)"
        sub={periodLabel}
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
        color="var(--coral)"
        sub={periodLabel}
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
        sub={bits.join(' · ')}
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
