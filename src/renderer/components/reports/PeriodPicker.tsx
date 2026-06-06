import { Chip } from '../ui/chip';
import { monthLabelFr } from '../../lib/dashboardCharts';
import type { ReportPeriod } from '../../lib/reports';

export interface PeriodPickerProps {
  period: ReportPeriod;
  available: { years: string[]; months: string[] };
  onChange: (period: ReportPeriod) => void;
}

function monthOptionLabel(value: string): string {
  return `${monthLabelFr(value)} ${value.slice(0, 4)}`;
}

/** Period selector: an Année/Mois granularity toggle plus a menu of the specific
 *  values present in the data. Switching granularity jumps to its latest value. */
export function PeriodPicker({ period, available, onChange }: PeriodPickerProps) {
  const values = period.granularity === 'year' ? available.years : available.months;

  function switchGranularity(granularity: 'year' | 'month'): void {
    if (granularity === period.granularity) return;
    const list = granularity === 'year' ? available.years : available.months;
    const first = list[0];
    if (first !== undefined) onChange({ granularity, value: first });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip
        active={period.granularity === 'year'}
        onClick={() => {
          switchGranularity('year');
        }}
      >
        Année
      </Chip>
      <Chip
        active={period.granularity === 'month'}
        onClick={() => {
          switchGranularity('month');
        }}
      >
        Mois
      </Chip>
      <select
        aria-label="Période"
        className="rounded-md border border-line-2 bg-ink-2 px-2.5 py-1.5 font-sans text-[13px] text-paper-soft"
        value={period.value}
        onChange={(e) => {
          onChange({ granularity: period.granularity, value: e.target.value });
        }}
      >
        {values.map((v) => (
          <option key={v} value={v}>
            {period.granularity === 'year' ? v : monthOptionLabel(v)}
          </option>
        ))}
      </select>
    </div>
  );
}
