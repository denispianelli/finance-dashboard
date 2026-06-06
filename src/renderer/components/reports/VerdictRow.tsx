import type { PeriodVerdict } from '../../lib/reports';
import { Label } from '../ui/overline';
import { formatBalance } from '../../lib/dashboardMap';

export interface VerdictRowProps {
  verdict: PeriodVerdict;
  /** Human label of the period, e.g. "2023" or "juin 2024". */
  periodLabel: string;
}

function Pastille({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-2 rounded-lg border border-line-2 bg-ink-2 px-5 py-[18px]">
      <Label>{label}</Label>
      <span
        className="font-serif text-[28px] italic leading-none tracking-[-0.02em]"
        style={{ color: color ?? 'var(--paper)' }}
      >
        {value}
      </span>
      {sub !== undefined && <span className="font-sans text-[11px] text-paper-mute">{sub}</span>}
    </div>
  );
}

/** The hero: three pastilles — money in, money out, and the signed result (the verdict). */
export function VerdictRow({ verdict, periodLabel }: VerdictRowProps) {
  const sign = verdict.net >= 0 ? '+ ' : '− ';
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
        value={`${formatBalance(verdict.income)} €`}
        color="var(--sage)"
        sub={periodLabel}
      />
      <Pastille
        label="Sorties"
        value={`${formatBalance(Math.abs(verdict.expense))} €`}
        color="var(--coral)"
        sub={periodLabel}
      />
      <Pastille
        label="Résultat"
        value={`${sign}${formatBalance(Math.abs(verdict.net))} €`}
        color={resultColor}
        sub={bits.join(' · ')}
      />
    </div>
  );
}
