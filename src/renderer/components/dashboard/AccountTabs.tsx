import { Plus } from 'lucide-react';
import { cn } from '@renderer/lib/utils';

export interface Account {
  id: string;
  name: string;
  bank: string;
  balance: string; // pre-formatted or "—"
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
    <div className="overflow-hidden rounded-lg border border-line-2 bg-ink-2">
      {/* Tabs flex-shrink to fit the available width so every account stays
          visible at any window size — never clipped, never scrolled away. */}
      <div className="flex items-stretch">
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
                'flex min-w-0 flex-1 flex-col gap-1 border-r border-line-2 px-4 py-3 text-left last:border-r-0',
                active && 'bg-ink-3',
              )}
            >
              <span
                className={cn(
                  'truncate font-sans text-[11px] font-medium uppercase tracking-[0.06em]',
                  active ? 'text-brass' : 'text-paper-mute',
                )}
              >
                {a.name}
              </span>
              <span className="truncate font-mono text-base font-medium tabular-nums text-paper">
                {a.balance === '—' ? '—' : `${a.balance} €`}
              </span>
              <span className="truncate font-sans text-[9px] tracking-[0.06em] text-paper-dim">
                {a.bank}
              </span>
            </button>
          );
        })}
        <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-4 py-3 text-paper-dim">
          <Plus size={16} strokeWidth={1.6} />
          <span className="font-sans text-[9px]">Ajouter</span>
        </div>
      </div>
    </div>
  );
}
