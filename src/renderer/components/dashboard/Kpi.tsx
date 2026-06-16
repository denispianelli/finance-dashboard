import { cn } from '@renderer/lib/utils';
import { Label } from '../ui/overline';

export interface KpiProps {
  label: string;
  value: string;
  sub?: string;
  delta?: string;
  deltaDir?: 'up' | 'down';
  ctx: string;
  spark?: string;
  sparkColor?: string;
}

export function Kpi({ label, value, sub, delta, deltaDir, ctx, spark, sparkColor }: KpiProps) {
  return (
    <div className="relative flex min-h-[130px] flex-col gap-2.5 overflow-hidden rounded-lg border border-line-2 bg-ink-2 px-5 py-[18px]">
      <Label>{label}</Label>
      <span className="whitespace-nowrap font-sans font-semibold text-[32px] leading-none tracking-[-0.02em] text-paper [font-variant-numeric:lining-nums_tabular-nums]">
        {value}
        {sub ? <span className="text-[20px] text-paper-mute">{sub}</span> : null}
      </span>
      <div className="flex items-center gap-2.5 font-sans text-xs text-paper-mute">
        {delta ? (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 font-medium',
              deltaDir === 'up' && 'text-sage',
              deltaDir === 'down' && 'text-coral',
            )}
          >
            {delta}
          </span>
        ) : null}
        <span>{ctx}</span>
      </div>
      {spark ? (
        <svg
          className="absolute right-[18px] top-[18px] h-6 w-16 opacity-60"
          viewBox="0 0 84 32"
          preserveAspectRatio="none"
        >
          <polyline
            points={spark}
            fill="none"
            stroke={sparkColor ?? 'var(--brass)'}
            strokeWidth="1.2"
          />
        </svg>
      ) : null}
    </div>
  );
}
