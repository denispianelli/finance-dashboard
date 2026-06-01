import { useState } from 'react';
import { Overline } from '../ui/overline';
import { Chip } from '../ui/chip';

const RANGES = ['1M', '3M', '6M', '1A', 'MAX'] as const;

export interface ChartCardProps {
  /** Polyline points for the balance line (`"x,y x,y …"`). Empty → empty state. */
  line: string;
  /** Filled area path under the line. */
  area: string;
  /** Caption shown bottom-right, e.g. `"mai 2026 · 1 compte"`. */
  caption?: string;
}

export function ChartCard({ line, area, caption }: ChartCardProps) {
  const [range, setRange] = useState<string>('1A');
  const hasData = line.length > 0;

  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-line-2 bg-ink-2 px-[22px] pb-4 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex min-w-0 items-center gap-3.5">
          <Overline>— II</Overline>
          <span className="truncate font-sans text-sm font-medium tracking-[-0.012em]">
            Solde sur 12 mois
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <Chip
              key={r}
              active={r === range}
              onClick={() => {
                setRange(r);
              }}
            >
              {r}
            </Chip>
          ))}
        </div>
      </div>
      {hasData ? (
        <svg
          className="block aspect-[600/220] min-h-[160px] w-full xl:h-[220px]"
          viewBox="0 0 600 220"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="dashFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#D4B062" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#D4B062" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 22, 44, 88, 132, 176].map((y) => (
            <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="var(--line-1)" strokeWidth="1" />
          ))}
          <path d={area} fill="url(#dashFill)" />
          <polyline points={line} fill="none" stroke="#D4B062" strokeWidth="1.5" />
        </svg>
      ) : (
        <div className="flex aspect-[600/220] min-h-[160px] w-full items-center justify-center text-sm text-paper-mute xl:h-[220px]">
          Pas encore de données — importez un relevé.
        </div>
      )}
      <div className="flex gap-[18px] border-t border-line-2 pt-1.5">
        <div className="flex items-center gap-1.5 font-sans text-[11px] text-paper-mute">
          <span className="h-0.5 w-3.5 bg-brass" />
          Solde réel
        </div>
        {caption !== undefined && (
          <div className="ml-auto flex items-center font-sans text-[11px] text-paper-dim">
            {caption}
          </div>
        )}
      </div>
    </div>
  );
}
