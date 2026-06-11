// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router-dom';
import type { AppOutletContext } from '@renderer/lib/outletContext';

vi.mock('@renderer/hooks/useNetWorthSummary', () => ({
  useNetWorthSummary: () => ({ netWorth: 0, monthDelta: null }),
}));
vi.mock('@renderer/components/Sidebar', () => ({ Sidebar: () => <div /> }));
vi.mock('@renderer/components/accounts/CreateAccountModal', () => ({
  CreateAccountModal: () => null,
}));
vi.mock('@renderer/hooks/useSidebarCollapse', () => ({
  useSidebarCollapse: () => ({ collapsed: false, toggle: vi.fn() }),
}));
// The modal is replaced by a button that reports a successful import directly.
vi.mock('@renderer/components/ImportModal', () => ({
  ImportModal: ({ open, onImported }: { open: boolean; onImported: () => void }) =>
    open ? (
      <button type="button" onClick={onImported}>
        simulate-import-success
      </button>
    ) : null,
}));

import { AppShell } from '@renderer/components/AppShell';

afterEach(() => {
  cleanup();
});

function TokenProbe() {
  const { refreshToken } = useOutletContext<AppOutletContext>();
  return <div data-testid="token">{refreshToken}</div>;
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<TokenProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell', () => {
  it('bumps the refresh token after a successful import', async () => {
    renderShell();
    expect(screen.getByTestId('token').textContent).toBe('0');

    await userEvent.click(screen.getByRole('button', { name: 'Importer un relevé' }));
    await userEvent.click(screen.getByRole('button', { name: 'simulate-import-success' }));

    expect(screen.getByTestId('token').textContent).toBe('1');
  });
});
