import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { cn } from '@renderer/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  /** Accessible name for the trigger + the option listbox. */
  ariaLabel: string;
  /** Extra classes for the trigger (sizing / min-width to match neighbours). */
  className?: string;
  align?: 'start' | 'end';
  disabled?: boolean;
  /** Optional icon rendered before the label in the trigger. */
  icon?: LucideIcon;
  /** When provided, the trigger displays this text instead of the selected option's label. */
  triggerLabel?: string;
}

const TRIGGER =
  'inline-flex h-7 items-center gap-1.5 rounded-md border border-line-2 bg-ink-2 pl-2.5 pr-2 font-sans text-xs text-paper outline-none transition-colors hover:border-line-3 focus-visible:ring-1 focus-visible:ring-brass data-[state=open]:border-line-3';

/**
 * Glass dropdown (replaces native <select>): a styled trigger + a Popover
 * listbox of options. Aurora look — no OS chrome, and avoids the WSLg
 * native-select input lag. Single-select, controlled.
 */
export function Select({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
  align = 'start',
  disabled,
  icon: Icon,
  triggerLabel,
}: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(TRIGGER, disabled && 'cursor-not-allowed opacity-50', className)}
      >
        {Icon !== undefined && (
          <Icon size={15} strokeWidth={1.7} className="shrink-0 text-paper-mute" />
        )}
        <span className="truncate">{triggerLabel ?? selected?.label ?? ''}</span>
        <ChevronDown size={13} strokeWidth={1.8} className="ml-auto shrink-0 text-paper-mute" />
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="max-h-[280px] min-w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1"
      >
        <div role="listbox" aria-label={ariaLabel} className="flex flex-col">
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onValueChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-sans text-xs transition-colors',
                  active
                    ? 'bg-brass-soft text-paper'
                    : 'text-paper-soft hover:bg-surface-2 hover:text-paper',
                )}
              >
                <span className="flex-1 truncate">{o.label}</span>
                {active ? (
                  <Check size={13} strokeWidth={2} className="shrink-0 text-brass" />
                ) : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
