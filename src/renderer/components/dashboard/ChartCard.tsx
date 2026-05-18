import { useState } from 'react';
import { Overline } from '../ui/overline';
import { Chip } from '../ui/chip';

const RANGES = ['1M', '3M', '6M', '1A', 'MAX'] as const;

export function ChartCard() {
  const [range, setRange] = useState<string>('1A');
  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-line-2 bg-ink-2 px-[22px] pb-4 pt-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <Overline>— II</Overline>
          <span className="font-sans text-sm font-medium tracking-[-0.012em]">
            Solde sur 12 mois
          </span>
        </div>
        <div className="flex gap-1.5">
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
      <svg
        className="block h-[220px] w-full"
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
        <path
          d="M0,150 L50,128 L100,140 L150,108 L200,98 L250,114 L300,82 L350,68 L400,76 L450,52 L500,48 L550,38 L600,30 L600,220 L0,220 Z"
          fill="url(#dashFill)"
        />
        <polyline
          points="0,150 50,128 100,140 150,108 200,98 250,114 300,82 350,68 400,76 450,52 500,48 550,38 600,30"
          fill="none"
          stroke="#D4B062"
          strokeWidth="1.5"
        />
        <polyline
          points="0,160 50,150 100,144 150,132 200,122 250,112 300,100 350,90 400,78 450,68 500,58 550,48 600,38"
          fill="none"
          stroke="#8D7DC4"
          strokeWidth="1.2"
          strokeDasharray="3 4"
        />
        <circle cx="550" cy="38" r="3" fill="#D4B062" />
        <text x="558" y="32" fontFamily="var(--font-mono)" fontSize="10" fill="var(--paper)">
          12 847
        </text>
      </svg>
      <div className="flex gap-[18px] border-t border-line-2 pt-1.5">
        <div className="flex items-center gap-1.5 font-sans text-[11px] text-paper-mute">
          <span className="h-0.5 w-3.5" style={{ background: 'var(--brass)' }} />
          Solde réel
        </div>
        <div className="flex items-center gap-1.5 font-sans text-[11px] text-paper-mute">
          <span className="h-0.5 w-3.5" style={{ background: '#8D7DC4' }} />
          Projection
        </div>
        <div className="ml-auto flex items-center font-sans text-[11px] text-paper-dim">
          Mai 2026 · 4 comptes
        </div>
      </div>
    </div>
  );
}
