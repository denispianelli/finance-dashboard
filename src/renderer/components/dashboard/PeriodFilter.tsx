import { DateInput } from './DateInput';

export interface DateRangeValue {
  from: string | null; // ISO yyyy-mm-dd
  to: string | null;
}

/**
 * Two cross-constrained date fields ("Du" / "Au") that emit a `{from, to}` range.
 * Deliberately minimal — preset shortcuts can be layered back on later if needed.
 */
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
  );
}
