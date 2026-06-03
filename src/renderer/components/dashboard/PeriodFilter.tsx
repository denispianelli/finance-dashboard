import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { cn } from '@renderer/lib/utils';
import { toLocalISODate, type TxPeriod } from '@renderer/lib/filterTransactions';
import { Button } from '../ui/button';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

export type DateSel =
  | { kind: 'preset'; preset: TxPeriod }
  | { kind: 'range'; from: string; to: string };

const PRESETS: { preset: TxPeriod; label: string }[] = [
  { preset: 'all', label: 'Tout' },
  { preset: '30d', label: '30 derniers jours' },
  { preset: '3m', label: '3 derniers mois' },
  { preset: 'year', label: 'Cette année' },
];

const PRESET_LABEL: Record<TxPeriod, string> = {
  all: 'Tout',
  '30d': '30 derniers jours',
  '3m': '3 derniers mois',
  year: 'Cette année',
};

/** ISO `yyyy-mm-dd` → local-midnight Date (no UTC shift). */
function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function triggerLabel(value: DateSel): string {
  if (value.kind === 'preset') return PRESET_LABEL[value.preset];
  const from = format(isoToDate(value.from), 'd MMM', { locale: fr });
  const to = format(isoToDate(value.to), 'd MMM', { locale: fr });
  return `${from} – ${to}`;
}

export function PeriodFilter({
  value,
  onChange,
}: {
  value: DateSel;
  onChange: (v: DateSel) => void;
}) {
  const [open, setOpen] = useState(false);

  const selectedRange: DateRange | undefined =
    value.kind === 'range' ? { from: isoToDate(value.from), to: isoToDate(value.to) } : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm">
          {triggerLabel(value)}
          <ChevronDown size={14} strokeWidth={1.6} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto gap-2 p-2" align="start">
        <div className="flex w-44 flex-col gap-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.preset}
              type="button"
              onClick={() => {
                onChange({ kind: 'preset', preset: p.preset });
                setOpen(false);
              }}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-left font-sans text-xs text-paper-mute hover:bg-ink-3 hover:text-paper',
                value.kind === 'preset' && value.preset === p.preset && 'bg-ink-3 text-paper',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="border-l border-line-2 pl-2">
          <Calendar
            mode="range"
            selected={selectedRange}
            onSelect={(range) => {
              if (range?.from && range.to) {
                onChange({
                  kind: 'range',
                  from: toLocalISODate(range.from),
                  to: toLocalISODate(range.to),
                });
                setOpen(false);
              }
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
