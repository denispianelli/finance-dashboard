// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { PeriodFilter, type DateSel } from '@renderer/components/dashboard/PeriodFilter';

// Radix Popover needs a couple of jsdom APIs that aren't implemented by jsdom.
// We unconditionally override to stubs — harmless in tests.
beforeEach(() => {
  Element.prototype.hasPointerCapture = () => false;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
});

describe('PeriodFilter', () => {
  it('shows the preset label on the trigger', () => {
    render(<PeriodFilter value={{ kind: 'preset', preset: 'all' }} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Tout/ })).toBeInTheDocument();
  });

  it('shows a formatted range label on the trigger', () => {
    render(
      <PeriodFilter
        value={{ kind: 'range', from: '2026-05-12', to: '2026-06-03' }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /mai.*juin/ })).toBeInTheDocument();
  });

  it('calls onChange with a preset when a preset is clicked', () => {
    const onChange = vi.fn();
    render(<PeriodFilter value={{ kind: 'preset', preset: 'all' }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Tout/ }));
    fireEvent.click(screen.getByText('30 derniers jours'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'preset', preset: '30d' });
  });

  it('calls onChange with a range after two calendar days are picked', () => {
    const onChange = vi.fn<(v: DateSel) => void>();
    render(<PeriodFilter value={{ kind: 'preset', preset: 'all' }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Tout/ }));
    const dayButtons = screen
      .getAllByRole('button')
      .filter((b) => /^\d{1,2}$/.test(b.textContent.trim()));
    expect(dayButtons.length).toBeGreaterThan(1);
    const day3 = dayButtons[3];
    const day8 = dayButtons[8];
    if (day3) fireEvent.click(day3);
    if (day8) fireEvent.click(day8);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'range' }));
  });
});
