import { cn } from '@renderer/lib/utils';
import { formatEuro } from '@renderer/lib/euro';
import { splitEuro, sparkPoints } from '@renderer/lib/dashboardCharts';
import type { Account } from '@renderer/components/dashboard/AccountTabs';
import { Overline } from '@renderer/components/ui/overline';
import { Tile } from '@renderer/components/dashboard/Bento';

export interface HeroBalanceTileProps {
  balance: number;
  series: number[];
  accounts: Account[];
  monthDelta?: { delta: string; dir: 'up' | 'down' };
  monthAmount?: number; // signed € change "ce mois"
}

const TILE_BG = 'linear-gradient(155deg, rgb(var(--accent-glow) / 0.16), var(--surface) 46%)';

/** Up to 4 account rows with deterministic dot colours from the category palette. */
const MAX_ACCOUNTS = 4;

export function HeroBalanceTile({
  balance,
  series,
  accounts,
  monthDelta,
  monthAmount,
}: HeroBalanceTileProps) {
  const { value, sub } = splitEuro(balance);
  const spark = sparkPoints(series);
  const visibleAccounts = accounts.slice(0, MAX_ACCOUNTS);

  return (
    <Tile
      span={4}
      rowSpan={2}
      style={{ background: TILE_BG }}
      className="flex flex-col gap-3 self-stretch"
    >
      {/* Eyebrow */}
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 flex-none rounded-full bg-brass" />
        <Overline>Solde net · comptes</Overline>
      </div>

      {/* Hero figure */}
      <span className="whitespace-nowrap font-sans font-semibold text-hero leading-figure tracking-figure text-paper [font-variant-numeric:lining-nums_tabular-nums]">
        {value}
        <span className="text-[0.46em] font-medium text-paper-mute">{sub}</span>
      </span>

      {/* Delta chip + monthly amount */}
      {(monthDelta !== undefined || monthAmount !== undefined) && (
        <div className="flex items-center gap-2 font-sans text-xs text-paper-mute">
          {monthDelta !== undefined && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold',
                monthDelta.dir === 'up' && 'bg-sage/10 text-sage',
                monthDelta.dir === 'down' && 'bg-coral/10 text-coral',
              )}
            >
              {monthDelta.delta}
            </span>
          )}
          {monthAmount !== undefined && (
            <span>
              <span className="font-medium text-sage">{formatEuro(monthAmount)}</span>
              {' ce mois'}
            </span>
          )}
        </div>
      )}

      {/* Spacer pushes sparkline + accounts to bottom */}
      <div className="flex-1" />

      {/* Sparkline — line + area fill fading down to the baseline (matches the
          big balance chart). */}
      {spark.length > 0 && (
        <svg
          className="h-9 w-full"
          viewBox="0 0 84 32"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="heroSparkFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-income)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-income)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <polygon points={`${spark} 84,32 0,32`} fill="url(#heroSparkFill)" stroke="none" />
          <polyline points={spark} fill="none" stroke="var(--color-income)" strokeWidth="1.4" />
        </svg>
      )}

      {/* Divider */}
      <div className="border-t border-line-2" />

      {/* Account rows */}
      <div className="flex flex-col gap-2">
        {visibleAccounts.map((account, i) => (
          <div key={account.id} className="flex items-center gap-2 min-w-0">
            <span
              className="h-2 w-2 flex-none rounded-full"
              style={{ background: `var(--cat-${String((i % 15) + 1)})` }}
            />
            <span className="flex-1 truncate font-sans text-xs text-paper">{account.name}</span>
            <span className="font-mono text-xs text-paper tabular-nums">{account.balance}</span>
          </div>
        ))}
      </div>
    </Tile>
  );
}
