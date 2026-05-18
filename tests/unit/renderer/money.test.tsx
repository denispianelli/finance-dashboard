// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Money } from '@renderer/components/ui/money';

afterEach(() => {
  cleanup();
});

describe('Money', () => {
  it('formats income with + and sage class', () => {
    render(<Money value={3240} kind="income" />);
    const el = screen.getByText((t) => t.replace(/\s/g, ' ').includes('+ 3 240,00 €'));
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('text-sage');
  });

  it('formats expense with minus sign and coral class', () => {
    render(<Money value={-84.3} kind="expense" />);
    const el = screen.getByText((t) => t.includes('−') && t.includes('84,30'));
    expect(el.className).toContain('text-coral');
  });

  it('formats transfer with arrow and neutral class', () => {
    render(<Money value={500} kind="transfer" />);
    const el = screen.getByText((t) => t.includes('→') && t.includes('500,00'));
    expect(el.className).toContain('text-paper-soft');
  });

  it('plain kind has no sign prefix', () => {
    render(<Money value={12847.32} kind="plain" />);
    const el = screen.getByText((t) => t.includes('12 847,32'));
    expect(el.textContent).not.toMatch(/[+→]/);
  });
});
