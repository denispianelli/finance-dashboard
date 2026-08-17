import { Check } from 'lucide-react';
import { AccountIconTile } from '@renderer/lib/accountIcon';
import { formatEuroRounded } from '@renderer/lib/euro';
import { cn } from '@renderer/lib/utils';

export interface Account {
  id: string;
  name: string;
  bank: string;
  balance: string; // pre-formatted or "—" — kept for HeroBalanceTile / AccountsMiniTile
  balanceValue: number | null; // numeric value for AccountCard
  type: string;
}

/** Row of clickable account filter cards (Transactions). Flat `--surface` cards
 *  with a lime tint + check on the active one — distinct from the glass
 *  management cards on the Comptes page. */
export function AccountTabs({
  accounts,
  activeId,
  onSelect,
}: {
  accounts: Account[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {accounts.map((a) => {
        const active = a.id === activeId;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => {
              onSelect(a.id);
            }}
            className={cn(
              'flex min-w-[168px] flex-1 cursor-pointer flex-col gap-2.5 rounded-md border px-[18px] py-4 text-left transition-all duration-150',
              active
                ? 'bg-accent-soft border-accent-50'
                : 'border-line-2 bg-surface hover:bg-surface-2',
            )}
          >
            <div className="flex items-center gap-2.5">
              <AccountIconTile type={a.type} size={30} />
              <span
                className={cn(
                  'flex-1 truncate text-[12.5px]',
                  active ? 'text-paper' : 'text-paper-soft',
                )}
              >
                {a.name}
              </span>
              {active && <Check size={15} strokeWidth={2} className="shrink-0 text-brass" />}
            </div>
            <div className="font-mono text-[22px] font-semibold tracking-[-0.02em] tabular-nums text-paper">
              {a.balanceValue === null ? '—' : formatEuroRounded(a.balanceValue)}
            </div>
            <span className="text-[11px] text-paper-mute">{a.bank}</span>
          </button>
        );
      })}
    </div>
  );
}
