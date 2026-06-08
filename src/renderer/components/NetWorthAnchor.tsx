import { cn } from '@renderer/lib/utils';
import { NBSP, MINUS } from '@renderer/lib/euro';

interface NetWorthAnchorProps {
  /** Net worth (sum of every account's balance), in euros. */
  netWorth: number;
  /** Current-month change in euros; its sign drives the sage/coral colour. */
  monthDelta: number;
  /** Collapsed sidebar → the card slides up and fades out. */
  collapsed: boolean;
  /** Click handler; the Sidebar maps it to the dashboard route. */
  onNavigate: (view: string) => void;
}

/** French integer grouping, no decimals — a glanceable summary figure (the precise,
 *  two-decimal amounts live on the dashboard; this anchor is a quick read). */
function formatWhole(amount: number): string {
  return Math.round(amount).toLocaleString('fr-FR');
}

/**
 * Sidebar summary anchor: the brand-signature net-worth figure (Instrument Serif
 * italic) plus the month's delta in sage/coral. Presentational only — every number
 * arrives via props. On collapse the card's vertical space animates to 0 (grid-rows
 * 1fr→0fr) and fades, so the rail's icons slide up smoothly instead of jumping; the
 * button is disabled while hidden so it leaves the tab order.
 */
export function NetWorthAnchor({
  netWorth,
  monthDelta,
  collapsed,
  onNavigate,
}: NetWorthAnchorProps) {
  const positive = monthDelta >= 0;
  // Explicit, spaced sign with the true minus (U+2212), never a hyphen.
  const deltaText = `${positive ? '+' : MINUS}${NBSP}${formatWhole(Math.abs(monthDelta))}${NBSP}€`;

  return (
    <div
      className={cn(
        'grid px-2 transition-[grid-template-rows,opacity] duration-200 ease-in-out',
        collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
      )}
    >
      <div className="overflow-hidden">
        <button
          type="button"
          disabled={collapsed}
          onClick={() => {
            onNavigate('dashboard');
          }}
          className="mb-2 mt-1 flex w-full flex-col gap-1.5 rounded-lg border border-line-2 bg-ink-1 px-3.5 py-3 text-left transition-colors hover:border-line-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brass"
        >
          <span className="font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-paper-mute">
            Patrimoine net
          </span>

          <span className="whitespace-nowrap font-serif text-[26px] italic leading-none tracking-figure tabular-nums text-paper">
            {formatWhole(netWorth)}
            <span className="text-[16px] text-paper-mute">{NBSP}€</span>
          </span>

          <span className="inline-flex items-center gap-1.5 font-sans text-[11px] text-paper-mute">
            <span className={cn('font-mono font-medium', positive ? 'text-sage' : 'text-coral')}>
              {deltaText}
            </span>
            ce mois
          </span>
        </button>
      </div>
    </div>
  );
}
