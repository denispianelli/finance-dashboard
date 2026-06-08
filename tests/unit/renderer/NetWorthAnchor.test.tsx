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
  it('expanded + positive delta: serif figure and a sage, plus-signed delta', () => {
    const { container } = render(
      <NetWorthAnchor netWorth={54748} monthDelta={1240} collapsed={false} onNavigate={vi.fn()} />,
    );

    expect(screen.getByText('Patrimoine net')).toBeTruthy();

    const figure = container.querySelector('.font-serif');
    expect(squash(figure?.textContent)).toBe('54748€');

    const delta = container.querySelector('.font-mono');
    expect(delta?.className).toContain('text-sage');
    expect(squash(delta?.textContent)).toBe('+1240€');
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

  it('collapsed: clickable pictogram button labelled with the amount; click navigates', () => {
    const onNavigate = vi.fn();
    render(<NetWorthAnchor netWorth={54748} monthDelta={1240} collapsed onNavigate={onNavigate} />);

    // The label text is no longer inline (it moves to a hover tooltip), but the
    // accessible name still carries the figure for screen readers.
    expect(screen.queryByText('Patrimoine net')).toBeNull();
    const btn = screen.getByRole('button', { name: /Patrimoine net/i });
    expect(squash(btn.getAttribute('aria-label'))).toContain('54748');

    fireEvent.click(btn);
    expect(onNavigate).toHaveBeenCalledWith('dashboard');
  });
});
