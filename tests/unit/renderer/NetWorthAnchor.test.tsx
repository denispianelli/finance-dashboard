// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { NetWorthAnchor } from '../../../src/renderer/components/NetWorthAnchor';

afterEach(() => {
  cleanup();
});

/** Strip every flavour of whitespace (incl. NBSP / narrow NBSP from fr-FR grouping). */
function squash(s: string | null | undefined): string {
  return (s ?? '').replace(/\s/g, '');
}

describe('NetWorthAnchor', () => {
  it('expanded + positive delta: serif figure, sage delta, navigates on click', () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <NetWorthAnchor
        netWorth={54748}
        monthDelta={1240}
        collapsed={false}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByText('Patrimoine net')).toBeTruthy();

    const figure = container.querySelector('.font-serif');
    expect(squash(figure?.textContent)).toBe('54748€');

    const delta = container.querySelector('.font-mono');
    expect(delta?.className).toContain('text-sage');
    expect(squash(delta?.textContent)).toBe('+1240€');

    fireEvent.click(screen.getByRole('button'));
    expect(onNavigate).toHaveBeenCalledWith('dashboard');
  });

  it('negative delta: coral colour and the true minus sign (U+2212, not a hyphen)', () => {
    const { container } = render(
      <NetWorthAnchor netWorth={54748} monthDelta={-820} collapsed={false} onNavigate={vi.fn()} />,
    );

    const delta = container.querySelector('.font-mono');
    expect(delta?.className).toContain('text-coral');
    const text = delta?.textContent ?? '';
    expect(text).toContain('−'); // U+2212
    expect(text).not.toContain('-'); // never a hyphen
    expect(squash(text)).toBe('−820€');
  });

  it('collapsed: the card is disabled (out of the tab order) while it slides away', () => {
    render(<NetWorthAnchor netWorth={54748} monthDelta={1240} collapsed onNavigate={vi.fn()} />);
    // The card stays mounted (so it can animate height→0 + fade) but is disabled.
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
