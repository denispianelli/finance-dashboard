// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { DateInput } from '@renderer/components/dashboard/DateInput';

afterEach(() => {
  cleanup();
});

describe('DateInput', () => {
  it('shows the value formatted as jj/mm/aaaa', () => {
    render(<DateInput value="2026-05-12" onChange={vi.fn()} ariaLabel="Du" />);
    expect(screen.getByLabelText('Du')).toHaveValue('12/05/2026');
  });

  it('emits ISO on a valid typed date (commit on blur)', () => {
    const onChange = vi.fn();
    render(<DateInput value={null} onChange={onChange} ariaLabel="Du" />);
    const input = screen.getByLabelText('Du');
    fireEvent.change(input, { target: { value: '03/06/2026' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('2026-06-03');
  });

  it('emits null when cleared', () => {
    const onChange = vi.fn();
    render(<DateInput value="2026-05-12" onChange={onChange} ariaLabel="Du" />);
    const input = screen.getByLabelText('Du');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('reverts a typed date beyond max without emitting it', () => {
    const onChange = vi.fn();
    render(<DateInput value="2026-05-12" onChange={onChange} max="2026-06-03" ariaLabel="Du" />);
    const input = screen.getByLabelText('Du');
    fireEvent.change(input, { target: { value: '01/01/2027' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalledWith('2027-01-01');
    expect(input).toHaveValue('12/05/2026');
  });

  it('reverts an unparseable input', () => {
    const onChange = vi.fn();
    render(<DateInput value="2026-05-12" onChange={onChange} ariaLabel="Du" />);
    const input = screen.getByLabelText('Du');
    fireEvent.change(input, { target: { value: 'not a date' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('12/05/2026');
  });
});
