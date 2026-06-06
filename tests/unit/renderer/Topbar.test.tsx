// @vitest-environment jsdom
// tests/unit/renderer/Topbar.test.tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Topbar } from '@renderer/components/Topbar';

afterEach(() => {
  cleanup();
});

function renderTopbar(props: Partial<Parameters<typeof Topbar>[0]> = {}) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Topbar onImport={() => undefined} {...props} />
    </MemoryRouter>,
  );
}

describe('Topbar categorization chip', () => {
  it('shows the chip with the remaining count when categorizing', () => {
    renderTopbar({ categorizing: true, categorizeRemaining: 7 });
    expect(screen.getByText(/Catégorisation IA… \(7\)/)).toBeInTheDocument();
  });

  it('hides the chip when not categorizing', () => {
    renderTopbar({ categorizing: false, categorizeRemaining: 0 });
    expect(screen.queryByText(/Catégorisation IA…/)).not.toBeInTheDocument();
  });

  it('omits the chip by default', () => {
    renderTopbar();
    expect(screen.queryByText(/Catégorisation IA…/)).not.toBeInTheDocument();
  });
});

describe('Topbar categorize trigger button', () => {
  it('shows a "Catégoriser (N)" button when there is a residual and no pass is running', () => {
    renderTopbar({ pendingCount: 4, onCategorize: () => undefined });
    expect(screen.getByRole('button', { name: /Catégoriser 4 transactions/i })).toBeInTheDocument();
  });

  it('runs the pass on click', async () => {
    const onCategorize = vi.fn();
    renderTopbar({ pendingCount: 4, onCategorize });
    await userEvent.click(screen.getByRole('button', { name: /Catégoriser 4 transactions/i }));
    expect(onCategorize).toHaveBeenCalledTimes(1);
  });

  it('hides the button when nothing is pending', () => {
    renderTopbar({ pendingCount: 0, onCategorize: () => undefined });
    expect(screen.queryByText(/Catégoriser \(/)).not.toBeInTheDocument();
  });

  it('shows the running chip (not the button) while a pass is in flight', () => {
    renderTopbar({
      categorizing: true,
      categorizeRemaining: 3,
      pendingCount: 3,
      onCategorize: () => undefined,
    });
    expect(screen.getByText(/Catégorisation IA… \(3\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Catégoriser \(/)).not.toBeInTheDocument();
  });
});
