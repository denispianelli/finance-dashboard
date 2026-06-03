import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { format, isValid, parse } from 'date-fns';
import type { Matcher } from 'react-day-picker';
import { cn } from '@renderer/lib/utils';
import { toLocalISODate } from '@renderer/lib/filterTransactions';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

const DISPLAY = 'dd/MM/yyyy';

/** ISO `yyyy-mm-dd` → local-midnight Date (no UTC shift). */
function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function isoToDisplay(iso: string | null): string {
  return iso ? format(isoToDate(iso), DISPLAY) : '';
}

export interface DateInputProps {
  value: string | null; // ISO yyyy-mm-dd
  onChange: (iso: string | null) => void;
  min?: string; // ISO inclusive
  max?: string; // ISO inclusive
  ariaLabel: string;
}

export function DateInput({ value, onChange, min, max, ariaLabel }: DateInputProps) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const [open, setOpen] = useState(false);

  // Keep the text field in sync when `value` changes externally (preset fill / cross-field),
  // using React's "store info from previous renders" pattern (no effect).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(isoToDisplay(value));
  }

  const revert = () => {
    setText(isoToDisplay(value));
  };

  const commit = () => {
    const raw = text.trim();
    if (raw === '') {
      onChange(null);
      return;
    }
    const parsed = parse(raw, DISPLAY, new Date());
    if (!isValid(parsed)) {
      revert();
      return;
    }
    const iso = toLocalISODate(parsed);
    if ((min !== undefined && iso < min) || (max !== undefined && iso > max)) {
      revert();
      return;
    }
    onChange(iso);
  };

  const selected = value ? isoToDate(value) : undefined;
  const disabled: Matcher[] = [];
  if (min !== undefined) disabled.push({ before: isoToDate(min) });
  if (max !== undefined) disabled.push({ after: isoToDate(max) });

  return (
    <div className={cn('inline-flex h-7 items-center rounded-md border border-line-2 bg-ink-2')}>
      <input
        aria-label={ariaLabel}
        value={text}
        placeholder="jj/mm/aaaa"
        onChange={(e) => {
          setText(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        className="h-full w-[88px] bg-transparent px-2 font-mono text-xs text-paper placeholder:text-paper-dim focus:outline-none"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${ariaLabel} — ouvrir le calendrier`}
            className="flex h-full items-center px-1.5 text-paper-mute hover:text-paper"
          >
            <CalendarDays size={14} strokeWidth={1.6} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            disabled={disabled}
            onSelect={(d) => {
              if (d) {
                onChange(toLocalISODate(d));
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
