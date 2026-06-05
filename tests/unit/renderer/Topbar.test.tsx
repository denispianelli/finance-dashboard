// @vitest-environment jsdom
// tests/unit/renderer/Topbar.test.tsx
import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
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
