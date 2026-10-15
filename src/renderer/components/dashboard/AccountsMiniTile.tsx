import { Landmark, Settings2 } from 'lucide-react';
import { Overline } from '@renderer/components/ui/overline';
import { Button } from '@renderer/components/ui/button';
import { Tile } from '@renderer/components/dashboard/Bento';
import type { Account } from '@renderer/lib/dashboardMap';

export interface AccountsMiniTileProps {
  accounts: Account[];
  onManage: () => void;
}

export function AccountsMiniTile({ accounts, onManage }: AccountsMiniTileProps) {
  return (
    <Tile span={4} className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <Overline>Comptes</Overline>
          <span className="font-sans text-sm font-semibold text-paper">Mes comptes</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onManage} aria-label="Gérer les comptes">
          <Settings2 size={15} />
        </Button>
      </div>

      {/* Account rows */}
      <div className="flex flex-col">
        {accounts.map((account, i) => (
          <div
            key={account.id}
            className={
              i === 0
                ? 'flex items-center gap-3 py-2'
                : 'flex items-center gap-3 py-2 border-t border-line-2'
            }
          >
            {/* Icon chip */}
            <span
              className="flex h-9 w-9 flex-none items-center justify-center rounded-lg"
              style={{ background: `var(--cat-${String((i % 15) + 1)})` }}
            >
              <Landmark size={16} className="text-paper" />
            </span>

            {/* Name / bank */}
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-sans text-sm text-paper">{account.name}</span>
              <span className="truncate font-sans text-xs text-paper-mute">{account.bank}</span>
            </div>

            {/* Balance */}
            <span className="font-mono text-sm text-paper tabular-nums">{account.balance}</span>
          </div>
        ))}
      </div>
    </Tile>
  );
}
