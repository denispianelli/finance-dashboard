// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChartCard } from '@renderer/components/dashboard/ChartCard';

afterEach(() => {
  cleanup();
});

const baseProps = {
  line: '0,10 10,20',
  area: 'M0,10 L10,20 Z',
  range: '1y' as const,
  onRangeChange: vi.fn(),
};

describe('ChartCard', () => {
  it('renders the four range chips with the active one highlighted', () => {
    render(<ChartCard {...baseProps} />);
    for (const label of ['3M', '6M', '1A', 'MAX']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: '1M' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1A' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '3M' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the clicked range', async () => {
    const onRangeChange = vi.fn();
    render(<ChartCard {...baseProps} onRangeChange={onRangeChange} />);
    await userEvent.click(screen.getByRole('button', { name: '3M' }));
    expect(onRangeChange).toHaveBeenCalledWith('3m');
  });

  it('titles the chart after the selected range', () => {
    const { rerender } = render(<ChartCard {...baseProps} range="3m" />);
    expect(screen.getByText('Solde sur 3 mois')).toBeInTheDocument();
    rerender(<ChartCard {...baseProps} range="max" />);
    expect(screen.getByText('Solde — historique complet')).toBeInTheDocument();
  });

  it('keeps the empty state when there is no data', () => {
    render(<ChartCard {...baseProps} line="" area="" />);
    expect(screen.getByText('Pas encore de données — importez un relevé.')).toBeInTheDocument();
  });
});
