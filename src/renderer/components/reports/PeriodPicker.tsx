import { Select, type SelectOption } from '../ui/select';
import type { ReportPeriod } from '../../lib/reports';

export interface PeriodPickerProps {
  period: ReportPeriod;
  available: { years: string[]; months: string[] };
  onChange: (period: ReportPeriod) => void;
}

// "Toute l'année" + the twelve months, as glass-select options (kit order).
const MONTH_OPTIONS: SelectOption[] = [
  { value: 'all', label: "Toute l'année" },
  { value: '01', label: 'Janvier' },
  { value: '02', label: 'Février' },
  { value: '03', label: 'Mars' },
  { value: '04', label: 'Avril' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Juin' },
  { value: '07', label: 'Juillet' },
  { value: '08', label: 'Août' },
  { value: '09', label: 'Septembre' },
  { value: '10', label: 'Octobre' },
  { value: '11', label: 'Novembre' },
  { value: '12', label: 'Décembre' },
];

const TRIGGER = 'h-8 text-[13px] font-medium';

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
      <Select
        ariaLabel="Mois"
        value={month}
        onValueChange={setMonth}
        options={MONTH_OPTIONS}
        className={`${TRIGGER} min-w-[132px]`}
      />
      <Select
        ariaLabel="Année"
        value={year}
        onValueChange={setYear}
        options={available.years.map((y) => ({ value: y, label: y }))}
        align="end"
        className={`${TRIGGER} min-w-[86px]`}
      />
    </div>
  );
}
