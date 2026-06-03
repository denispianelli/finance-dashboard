import { type ComponentProps } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { fr } from 'react-day-picker/locale';
import { type ChevronProps } from 'react-day-picker';
import { cn } from '@renderer/lib/utils';

export type CalendarProps = ComponentProps<typeof DayPicker>;

function CalendarChevron({ orientation }: ChevronProps) {
  return orientation === 'left' ? (
    <ChevronLeft size={16} strokeWidth={1.6} />
  ) : (
    <ChevronRight size={16} strokeWidth={1.6} />
  );
}

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      locale={fr}
      showOutsideDays={showOutsideDays}
      className={cn('p-1', className)}
      classNames={{
        months: 'flex flex-col',
        month: 'space-y-3',
        month_caption: 'relative flex h-8 items-center justify-center',
        caption_label: 'font-sans text-[13px] font-medium capitalize text-paper',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        button_previous:
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-paper-mute hover:bg-ink-3 hover:text-paper',
        button_next:
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-paper-mute hover:bg-ink-3 hover:text-paper',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-[10px] font-medium uppercase tracking-[0.08em] text-paper-dim',
        week: 'mt-1 flex w-full',
        day: 'h-9 w-9 p-0 text-center',
        day_button:
          'inline-flex h-9 w-9 items-center justify-center rounded-md font-mono text-xs tabular-nums text-paper hover:bg-ink-3',
        selected: 'rounded-md bg-brass text-ink-1',
        range_start: 'rounded-l-md bg-brass text-ink-1',
        range_end: 'rounded-r-md bg-brass text-ink-1',
        range_middle: 'rounded-none bg-brass-soft text-paper',
        today: 'text-brass',
        outside: 'text-paper-dim opacity-50',
        disabled: 'text-paper-dim opacity-30',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: CalendarChevron,
      }}
      {...props}
    />
  );
}
