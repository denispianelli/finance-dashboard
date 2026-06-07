import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ReportPeriod } from '../../lib/reports';

export interface PeriodPickerProps {
  period: ReportPeriod;
  available: { years: string[]; months: string[] };
  onChange: (period: ReportPeriod) => void;
}

// "Toute l'année" + the twelve months, as [value, label] pairs (kit order).
const MONTHS: [string, string][] = [
  ['all', "Toute l'année"],
  ['01', 'Janvier'],
  ['02', 'Février'],
  ['03', 'Mars'],
  ['04', 'Avril'],
  ['05', 'Mai'],
  ['06', 'Juin'],
  ['07', 'Juillet'],
  ['08', 'Août'],
  ['09', 'Septembre'],
  ['10', 'Octobre'],
  ['11', 'Novembre'],
  ['12', 'Décembre'],
];

const SELECT =
  'h-8 cursor-pointer appearance-none rounded-md border border-line-2 bg-ink-2 pl-3 pr-[30px] font-sans text-[13px] font-medium text-paper outline-none focus:ring-1 focus:ring-brass';

/** A compact native select styled like the kit, with a Lucide chevron overlay. */
function PeriodSelect({
  value,
  onChange,
  options,
  ariaLabel,
  minWidth,
}: {
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  ariaLabel: string;
  minWidth: number;
}) {
  return (
    <span className="relative inline-flex">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className={cn(SELECT)}
        style={{ minWidth }}
      >
        {options.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        strokeWidth={1.8}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-paper-mute"
      />
    </span>
  );
}

/** Period selector (kit): a month select ("Toute l'année" + the twelve months)
 *  and a year select. "Toute l'année" is the year view; any month narrows to it. */
export function PeriodPicker({ period, available, onChange }: PeriodPickerProps) {
  const year = period.granularity === 'year' ? period.value : period.value.slice(0, 4);
  const month = period.granularity === 'year' ? 'all' : period.value.slice(5, 7);

  function setMonth(m: string): void {
    onChange(
      m === 'all'
        ? { granularity: 'year', value: year }
        : { granularity: 'month', value: `${year}-${m}` },
    );
  }
  function setYear(y: string): void {
    onChange(
      month === 'all'
        ? { granularity: 'year', value: y }
        : { granularity: 'month', value: `${y}-${month}` },
    );
  }

  return (
    <div className="flex items-center gap-2">
      <PeriodSelect
        ariaLabel="Mois"
        value={month}
        onChange={setMonth}
        options={MONTHS}
        minWidth={132}
      />
      <PeriodSelect
        ariaLabel="Année"
        value={year}
        onChange={setYear}
        options={available.years.map((y) => [y, y])}
        minWidth={86}
      />
    </div>
  );
}
