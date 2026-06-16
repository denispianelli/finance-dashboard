import { Check } from 'lucide-react';
import { Money } from '../ui/money';
import { AccountIconTile } from '../../lib/accountIcon';
import { cn } from '../../lib/utils';

export function AccountCard({
  type,
  name,
  balance,
  bank,
  active = false,
  onSelect,
  actions,
}: {
  type: string;
  name: string;
  balance: number | null;
  bank: string | null;
  active?: boolean;
  onSelect?: () => void;
  actions?: React.ReactNode;
}) {
  const rootClass = cn(
    'tile group flex min-h-[124px] flex-col gap-3 p-5 tile-hover',
    active && 'border-line-3 bg-surface-2',
  );

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <AccountIconTile type={type} size={36} />
          <span className="truncate font-sans text-sm text-paper">{name}</span>
        </div>
        <div className="shrink-0">
          {active ? <Check size={16} strokeWidth={2.2} className="shrink-0 text-brass" /> : actions}
        </div>
      </div>

      {balance === null ? (
        <span className="font-mono text-[24px] tabular-nums text-paper-dim">—</span>
      ) : (
        <Money
          value={balance}
          kind={balance < 0 ? 'expense' : 'plain'}
          className="text-[24px] font-semibold"
        />
      )}

      <span className="mt-auto truncate font-sans text-[12px] text-paper-mute">
        {bank ?? 'Sans banque'}
      </span>
    </>
  );

  if (onSelect !== undefined) {
    return (
      <button type="button" onClick={onSelect} className={cn(rootClass, 'w-full text-left')}>
        {inner}
      </button>
    );
  }

  return <div className={rootClass}>{inner}</div>;
}
