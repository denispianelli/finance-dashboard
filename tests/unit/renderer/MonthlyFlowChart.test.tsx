// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MonthlyFlowChart } from '@renderer/components/reports/MonthlyFlowChart';

afterEach(() => {
  cleanup();
});

describe('MonthlyFlowChart', () => {
  it('renders the head, the legend and the chart container when there is data', () => {
    const { container } = render(
      <MonthlyFlowChart
        title="Entrées et sorties · par mois"
        data={[{ label: 'janv', income: 100, expense: 50 }]}
      />,
    );
    expect(screen.getByText('Entrées et sorties · par mois')).toBeInTheDocument();
    expect(screen.getByText('Entrées')).toBeInTheDocument();
    expect(screen.getByText('Sorties')).toBeInTheDocument();
    // recharts mounts its responsive container (the chart itself needs a real
    // layout box, which jsdom doesn't provide — the kit wrapper is the seam).
    expect(container.querySelector('[data-chart]')).toBeInTheDocument();
  });

  it('falls back to the empty state when every bucket is zero', () => {
    const { container } = render(
      <MonthlyFlowChart
        title="Entrées et sorties · par mois"
        data={[{ label: 'janv', income: 0, expense: 0 }]}
      />,
    );
    expect(screen.getByText('Pas de données sur cette période.')).toBeInTheDocument();
    expect(container.querySelector('[data-chart]')).not.toBeInTheDocument();
  });
});
