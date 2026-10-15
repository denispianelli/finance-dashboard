// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PeriodPicker } from '@renderer/components/reports/PeriodPicker';
import type { ReportPeriod } from '@renderer/lib/reports';

afterEach(() => {
  cleanup();
});

const available = { years: ['2026', '2025'], months: ['2026-05', '2024-06'] };

describe('PeriodPicker', () => {
  it('lists the available years and defaults the month to "Toute l\'année"', async () => {
    const user = userEvent.setup();
    render(
      <PeriodPicker
        period={{ granularity: 'year', value: '2026' }}
        available={available}
        onChange={() => undefined}
      />,
    );
    // The month trigger reads "Toute l'année" in the year view.
    expect(screen.getByLabelText('Mois')).toHaveTextContent("Toute l'année");
    // Opening the year dropdown lists the available years in order.
    await user.click(screen.getByLabelText('Année'));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['2026', '2025']);
  });

  it('emits a month period when a month is chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(p: ReportPeriod) => void>();
    render(
      <PeriodPicker
        period={{ granularity: 'year', value: '2026' }}
        available={available}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Mois'));
    await user.click(screen.getByRole('option', { name: 'Mai' }));
    expect(onChange).toHaveBeenCalledWith({ granularity: 'month', value: '2026-05' });
  });

  it('returns to the year view when "Toute l\'année" is chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(p: ReportPeriod) => void>();
    render(
      <PeriodPicker
        period={{ granularity: 'month', value: '2026-05' }}
        available={available}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Mois'));
    await user.click(screen.getByRole('option', { name: "Toute l'année" }));
    expect(onChange).toHaveBeenCalledWith({ granularity: 'year', value: '2026' });
  });

  it('keeps the selected month when the year changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(p: ReportPeriod) => void>();
    render(
      <PeriodPicker
        period={{ granularity: 'month', value: '2026-05' }}
        available={available}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByLabelText('Année'));
    await user.click(screen.getByRole('option', { name: '2025' }));
    expect(onChange).toHaveBeenCalledWith({ granularity: 'month', value: '2025-05' });
  });
});
