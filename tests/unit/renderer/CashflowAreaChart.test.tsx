// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CashflowAreaChart } from '@renderer/components/reports/CashflowAreaChart';
import type { NetPoint } from '@renderer/lib/reports';

// Recharts' ResponsiveContainer needs ResizeObserver, absent in jsdom.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe(): void {
      return undefined;
    }
    unobserve(): void {
      return undefined;
    }
    disconnect(): void {
      return undefined;
    }
  };
});

afterEach(() => {
  cleanup();
});

const data: NetPoint[] = [
  { label: 'janv', net: 100 },
  { label: 'févr', net: -50 },
];

describe('CashflowAreaChart', () => {
  it('renders the title and a chart when there is data', () => {
    const { container } = render(<CashflowAreaChart data={data} title="Gains et pertes · 2026" />);
    expect(screen.getByText('Gains et pertes · 2026')).toBeTruthy();
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });

  it('shows an empty state when every period is zero', () => {
    render(<CashflowAreaChart data={[{ label: 'janv', net: 0 }]} title="Gains et pertes · 2099" />);
    expect(screen.getByText(/pas de données sur cette période/i)).toBeTruthy();
  });
});
