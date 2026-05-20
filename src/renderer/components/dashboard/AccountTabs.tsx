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
      {/* Same mechanism as the KPI grid below: a CSS grid of equal
          minmax(0,1fr) columns + one fixed "Ajouter" column. Columns
          shrink together and never clip or collapse — every account
          stays visible at any window width. At very narrow widths
          (≥5 accounts on a 1024px window) the strip falls back to a
          horizontal scroll so labels remain readable. */}
      <div
        className="grid min-w-full items-stretch overflow-x-auto"
        style={{
          gridTemplateColumns: `repeat(${String(accounts.length)}, minmax(140px, 1fr)) auto`,
        }}
      >
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
                'flex min-w-0 flex-col gap-1 border-r border-line-2 px-4 py-3 text-left',
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
        <div
          aria-label="Ajouter un compte"
          className="flex flex-col items-center justify-center gap-1 px-4 py-3 text-paper-dim"
        >
          <Plus size={16} strokeWidth={1.6} />
          <span className="hidden font-sans text-[9px] xl:inline">Ajouter</span>
        </div>
      </div>
    </div>
  );
}
