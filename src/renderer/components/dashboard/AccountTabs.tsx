import { Check } from 'lucide-react';
import { cn } from '@renderer/lib/utils';
import { NBSP } from '@renderer/lib/euro';
import { AccountIconTile } from '@renderer/lib/accountIcon';

export interface Account {
  id: string;
  name: string;
  bank: string;
  balance: string; // pre-formatted or "—"
  type: string;
}

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
    <div className="flex flex-wrap gap-4">
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
              'flex min-w-[168px] flex-1 flex-col gap-2.5 rounded-md border p-[16px_18px] text-left transition-colors',
              active
                ? 'border-[rgb(var(--accent-glow)/0.5)] bg-[rgb(var(--accent-glow)/0.08)]'
                : 'border-line-2 bg-surface hover:bg-surface-2',
            )}
          >
            <div className="flex items-center gap-2.5">
              <AccountIconTile type={a.type} size={30} />
              <span
                className={cn(
                  'flex-1 truncate font-sans text-[12.5px]',
                  active ? 'text-paper' : 'text-paper-soft',
                )}
              >
                {a.name}
              </span>
              {active && <Check size={15} strokeWidth={2} className="shrink-0 text-brass" />}
            </div>
            <span className="font-sans text-[22px] font-semibold tracking-[-0.02em] text-paper">
              {a.balance === '—' ? '—' : `${a.balance}${NBSP}€`}
            </span>
            <span className="truncate font-sans text-[11px] text-paper-mute">{a.bank}</span>
          </button>
        );
      })}
    </div>
  );
}
