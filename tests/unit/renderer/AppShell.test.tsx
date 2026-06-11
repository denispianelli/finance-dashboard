// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { BackgroundCategorization } from '@renderer/hooks/useBackgroundCategorization';
import type { ModelStatusResponse } from '@shared/types/ipc';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));
vi.mock('@renderer/hooks/useBackgroundCategorization', () => ({
  useBackgroundCategorization: vi.fn(),
}));
vi.mock('@renderer/hooks/useModelStatus', () => ({ useModelStatus: vi.fn() }));
vi.mock('@renderer/hooks/useNetWorthSummary', () => ({
  useNetWorthSummary: () => ({ netWorth: 0, monthDelta: null }),
}));
vi.mock('@renderer/components/Sidebar', () => ({ Sidebar: () => <div /> }));
vi.mock('@renderer/components/model/ModelDownloadIndicator', () => ({
  ModelDownloadIndicator: () => null,
}));
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

import { ipc } from '@renderer/ipc/client';
import { useBackgroundCategorization } from '@renderer/hooks/useBackgroundCategorization';
import { useModelStatus } from '@renderer/hooks/useModelStatus';
import { AppShell } from '@renderer/components/AppShell';

const runMock = vi.fn(() => Promise.resolve());

const bg: BackgroundCategorization = {
  running: false,
  pending: 0,
  remaining: 0,
  refresh: vi.fn(() => Promise.resolve()),
  run: runMock,
};

beforeEach(() => {
  vi.mocked(useBackgroundCategorization).mockReturnValue(bg);
  vi.mocked(useModelStatus).mockReturnValue({ state: 'absent' } satisfies ModelStatusResponse);
  vi.mocked(ipc.invoke).mockImplementation(() => Promise.resolve({ value: false }));
  runMock.mockClear();
});

afterEach(() => {
  cleanup();
});

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<div />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell post-import categorization', () => {
  it('runs a background pass automatically after a successful import', async () => {
    renderShell();

    await userEvent.click(screen.getByRole('button', { name: 'Importer un relevé' }));
    await userEvent.click(screen.getByRole('button', { name: 'simulate-import-success' }));

    expect(runMock).toHaveBeenCalledTimes(1);
  });

  it('does not run a pass on mount', () => {
    renderShell();

    expect(runMock).not.toHaveBeenCalled();
  });
});
