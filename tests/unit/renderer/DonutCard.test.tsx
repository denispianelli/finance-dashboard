// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DonutCard } from '@renderer/components/reports/DonutCard';

afterEach(() => {
  cleanup();
});

const segments = [
  { key: 'a', label: 'Alimentation', value: 300, color: 'hsl(10 50% 50%)' },
  { key: 'b', label: 'Transports', value: 100, color: 'hsl(120 50% 50%)' },
];

function renderCard() {
  return render(
    <DonutCard
      overline="— II"
      title="Dépenses par catégorie"
      segments={segments}
      centerTop="Sorties"
      emptyHint="Rien sur cette période."
    />,
  );
}

describe('DonutCard hover tooltip', () => {
  it('shows label, amount and share when hovering a slice, and hides on leave', () => {
    const { container } = renderCard();
    // circle 0 is the track; slices follow in segment order.
    const slices = container.querySelectorAll('circle');
    const first = slices[1];
    expect(first).toBeDefined();
    if (!first) return;

    fireEvent.mouseMove(first, { clientX: 40, clientY: 40 });
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Alimentation');
    expect(tip).toHaveTextContent('300,00');
    expect(tip).toHaveTextContent('75%');

    fireEvent.mouseLeave(first);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('keeps the legend rows with their amounts', () => {
    renderCard();
    expect(screen.getByText('Transports')).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
