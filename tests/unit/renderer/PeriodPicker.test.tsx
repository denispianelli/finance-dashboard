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
  it('lists the available year values in the select', () => {
    render(
      <PeriodPicker
        period={{ granularity: 'year', value: '2026' }}
        available={available}
        onChange={() => undefined}
      />,
    );
    const select = screen.getByLabelText<HTMLSelectElement>('Période');
    expect([...select.options].map((o) => o.value)).toEqual(['2026', '2025']);
  });

  it('switches to the latest month when the Mois toggle is clicked', () => {
    const onChange = vi.fn<(p: ReportPeriod) => void>();
    render(
      <PeriodPicker
        period={{ granularity: 'year', value: '2026' }}
        available={available}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('Mois'));
    expect(onChange).toHaveBeenCalledWith({ granularity: 'month', value: '2026-05' });
  });

  it('emits the chosen value on select change', () => {
    const onChange = vi.fn<(p: ReportPeriod) => void>();
    render(
      <PeriodPicker
        period={{ granularity: 'year', value: '2026' }}
        available={available}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Période'), { target: { value: '2025' } });
    expect(onChange).toHaveBeenCalledWith({ granularity: 'year', value: '2025' });
  });
});
