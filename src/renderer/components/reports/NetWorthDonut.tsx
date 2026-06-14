import type { NetWorth } from '@shared/types/dashboard';
import { accountComposition } from '../../lib/reports';
import { formatCompact } from '../../lib/euro';
import { DonutCard } from './DonutCard';

// On-palette only: sage / brass / coral plus category-swatch tokens (drift #7).
const PALETTE = [
  'var(--color-income)',
  'var(--brass)',
  'var(--cat-11)',
  'var(--color-expense)',
  'var(--cat-6)',
];

export interface NetWorthDonutProps {
  netWorth: NetWorth | null;
}

/** Net worth as a donut of account composition, with the total in the ring centre. */
export function NetWorthDonut({ netWorth }: NetWorthDonutProps) {
  const slices = accountComposition(netWorth);
  // The donut shows account composition only ("tous comptes"); its centre must be
  // the accounts subtotal so it reconciles with the slices. The full net worth
  // (incl. declared assets and loan CRD) is shown in the sidebar, not here.
  const accountsTotal = slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <DonutCard
      overline="— IV"
      title="Patrimoine · tous comptes"
      centerTop="Comptes"
      centerMain={formatCompact(accountsTotal)}
      emptyHint="Aucun solde connu — importez un relevé ou déclarez un solde."
      segments={slices.map((s, i) => ({
        key: s.name,
        label: s.name,
        value: s.value,
        color: PALETTE[i % PALETTE.length] ?? 'var(--brass)',
      }))}
    />
  );
}
