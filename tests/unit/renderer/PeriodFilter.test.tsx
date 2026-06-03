// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { PeriodFilter } from '@renderer/components/dashboard/PeriodFilter';

const TODAY = '2026-06-03';

afterEach(() => {
  cleanup();
});

describe('PeriodFilter', () => {
  it('renders Du and Au fields reflecting the value', () => {
    render(
      <PeriodFilter
        value={{ from: '2026-05-12', to: '2026-06-03' }}
        onChange={vi.fn()}
        today={TODAY}
      />,
    );
    expect(screen.getByLabelText('Du')).toHaveValue('12/05/2026');
    expect(screen.getByLabelText('Au')).toHaveValue('03/06/2026');
  });

  it('emits an updated lower bound when Du is edited', () => {
    const onChange = vi.fn();
    render(<PeriodFilter value={{ from: null, to: TODAY }} onChange={onChange} today={TODAY} />);
    const du = screen.getByLabelText('Du');
    fireEvent.change(du, { target: { value: '01/05/2026' } });
    fireEvent.blur(du);
    expect(onChange).toHaveBeenCalledWith({ from: '2026-05-01', to: TODAY });
  });

  it('emits an updated upper bound when Au is edited', () => {
    const onChange = vi.fn();
    render(
      <PeriodFilter value={{ from: '2026-05-01', to: null }} onChange={onChange} today={TODAY} />,
    );
    const au = screen.getByLabelText('Au');
    fireEvent.change(au, { target: { value: '31/05/2026' } });
    fireEvent.blur(au);
    expect(onChange).toHaveBeenCalledWith({ from: '2026-05-01', to: '2026-05-31' });
  });
});
