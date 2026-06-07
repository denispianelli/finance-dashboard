// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PeriodPicker } from '@renderer/components/reports/PeriodPicker';
import type { ReportPeriod } from '@renderer/lib/reports';

afterEach(() => {
  cleanup();
});

const available = { years: ['2026', '2025'], months: ['2026-05', '2024-06'] };

describe('PeriodPicker', () => {
  it('lists the available years in the year select', () => {
    render(
      <PeriodPicker
        period={{ granularity: 'year', value: '2026' }}
        available={available}
        onChange={() => undefined}
      />,
    );
    const year = screen.getByLabelText<HTMLSelectElement>('Année');
    expect([...year.options].map((o) => o.value)).toEqual(['2026', '2025']);
    // The month select defaults to "Toute l'année" in the year view.
    const monthSel = screen.getByLabelText<HTMLSelectElement>('Mois');
    expect(monthSel.value).toBe('all');
  });

  it('emits a month period when a month is chosen', () => {
    const onChange = vi.fn<(p: ReportPeriod) => void>();
    render(
      <PeriodPicker
        period={{ granularity: 'year', value: '2026' }}
        available={available}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Mois'), { target: { value: '05' } });
    expect(onChange).toHaveBeenCalledWith({ granularity: 'month', value: '2026-05' });
  });

  it('returns to the year view when "Toute l\'année" is chosen', () => {
    const onChange = vi.fn<(p: ReportPeriod) => void>();
    render(
      <PeriodPicker
        period={{ granularity: 'month', value: '2026-05' }}
        available={available}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Mois'), { target: { value: 'all' } });
    expect(onChange).toHaveBeenCalledWith({ granularity: 'year', value: '2026' });
  });

  it('keeps the selected month when the year changes', () => {
    const onChange = vi.fn<(p: ReportPeriod) => void>();
    render(
      <PeriodPicker
        period={{ granularity: 'month', value: '2026-05' }}
        available={available}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Année'), { target: { value: '2025' } });
    expect(onChange).toHaveBeenCalledWith({ granularity: 'month', value: '2025-05' });
  });
});
