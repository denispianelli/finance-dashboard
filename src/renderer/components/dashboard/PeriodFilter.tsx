import { cn } from '@renderer/lib/utils';
import { periodStart, type TxPeriod } from '@renderer/lib/filterTransactions';
import { DateInput } from './DateInput';

export interface DateRangeValue {
  from: string | null; // ISO yyyy-mm-dd
  to: string | null;
}

const PRESETS: { preset: TxPeriod; label: string }[] = [
  { preset: 'all', label: 'Tout' },
  { preset: '30d', label: '30 jours' },
  { preset: '3m', label: '3 mois' },
  { preset: 'year', label: 'Cette année' },
];

/** Bounds for a preset relative to `today`. 'all' clears both bounds. */
function presetBounds(preset: TxPeriod, today: string): DateRangeValue {
  if (preset === 'all') return { from: null, to: null };
  return { from: periodStart(preset, today), to: today };
}

function isActive(value: DateRangeValue, bounds: DateRangeValue): boolean {
  return value.from === bounds.from && value.to === bounds.to;
}

const CHIP = 'h-7 rounded-md px-2.5 font-sans text-xs font-medium transition-colors';

export function PeriodFilter({
  value,
  onChange,
  today,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  today: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex gap-1 rounded-lg border border-line-2 bg-ink-2 p-1">
        {PRESETS.map((p) => {
          const bounds = presetBounds(p.preset, today);
          return (
            <button
              key={p.preset}
              type="button"
              onClick={() => {
                onChange(bounds);
              }}
              className={cn(
                CHIP,
                isActive(value, bounds)
                  ? 'bg-ink-3 text-paper'
                  : 'text-paper-mute hover:text-paper',
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="inline-flex items-center gap-1.5">
        <span className="font-sans text-xs text-paper-mute">Du</span>
        <DateInput
          ariaLabel="Du"
          value={value.from}
          max={value.to ?? today}
          onChange={(from) => {
            onChange({ from, to: value.to });
          }}
        />
        <span className="font-sans text-xs text-paper-mute">au</span>
        <DateInput
          ariaLabel="Au"
          value={value.to}
          min={value.from ?? undefined}
          max={today}
          onChange={(to) => {
            onChange({ from: value.from, to });
          }}
        />
      </div>
    </div>
  );
}
