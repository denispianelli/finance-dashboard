// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BackupStatusView } from '@shared/types/backup';

vi.mock('../../../src/renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { BackupSettingsSection } from '../../../src/renderer/components/backup/BackupSettingsSection';
import { ipc } from '../../../src/renderer/ipc/client';

const invoke = vi.mocked(ipc.invoke);

/** First element, narrowed for noUncheckedIndexedAccess (getAllByRole throws when empty). */
function first(elements: HTMLElement[]): HTMLElement {
  const el = elements[0];
  if (el === undefined) throw new Error('expected at least one element');
  return el;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span>{label}</span>
      {children}
    </div>
  );
}

const status: BackupStatusView = {
  folderPath: '/home/denis/.config/finance-dashboard/backups',
  backups: [
    {
      fileName: 'finance-2026-06-12_0900.sqlite',
      createdAt: '2026-06-12T09:00:00',
      sizeBytes: 204800,
    },
    {
      fileName: 'finance-2026-06-11_0900.sqlite',
      createdAt: '2026-06-11T09:00:00',
      sizeBytes: 102400,
    },
  ],
  lastError: null,
};

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation((channel: string) => {
    if (channel === 'backup:getStatus') return Promise.resolve(status);
    if (channel === 'backup:create')
      return Promise.resolve({ ok: true, fileName: 'finance-2026-06-12_1010.sqlite' });
    return Promise.resolve({ ok: true });
  });
  Object.defineProperty(window, 'location', {
    value: { reload: vi.fn() },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
});

describe('BackupSettingsSection', () => {
  it('lists snapshots with formatted dates', async () => {
    render(<BackupSettingsSection Row={Row} />);
    expect(await screen.findByText(/12 juin 2026/)).toBeTruthy();
    expect(screen.getByText(/11 juin 2026/)).toBeTruthy();
  });

  it('« Sauvegarder maintenant » invokes backup:create and refreshes', async () => {
    render(<BackupSettingsSection Row={Row} />);
    await screen.findByText(/12 juin 2026/);
    await userEvent.click(screen.getByRole('button', { name: /sauvegarder maintenant/i }));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('backup:create', {});
    });
  });

  it('restore requires an explicit confirmation dialog before invoking backup:restore', async () => {
    render(<BackupSettingsSection Row={Row} />);
    await screen.findByText(/12 juin 2026/);
    await userEvent.click(first(screen.getAllByRole('button', { name: /^restaurer$/i })));
    expect(invoke).not.toHaveBeenCalledWith('backup:restore', expect.anything());
    await userEvent.click(screen.getByRole('button', { name: /confirmer/i }));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('backup:restore', {
        fileName: 'finance-2026-06-12_0900.sqlite',
      });
    });
  });
});
