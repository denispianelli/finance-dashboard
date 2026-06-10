// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { SyncLaunchCheck } from '@shared/types/sync';

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock('@renderer/ipc/client', () => ({
  ipc: { invoke: vi.fn() },
}));

// Import after mocks
import { SyncLaunchGate } from '../../../src/renderer/components/sync/SyncLaunchGate';
import { ipc } from '@renderer/ipc/client';

const mockInvoke = vi.mocked(ipc.invoke);

beforeEach(() => {
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'sync:launchCheck')
      return Promise.resolve<SyncLaunchCheck>({ kind: 'disabled' });
    return Promise.resolve({ ok: true });
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SyncLaunchGate', () => {
  it('renders nothing when sync is disabled', async () => {
    render(<SyncLaunchGate />);
    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('sync:launchCheck', {});
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the restore dialog when a newer snapshot exists', async () => {
    mockInvoke.mockResolvedValueOnce({
      kind: 'restore_available',
      machineName: 'denis-mac',
      createdAt: '2026-06-09T22:14:00.000Z',
    } satisfies SyncLaunchCheck);
    render(<SyncLaunchGate />);
    expect(await screen.findByText(/Données plus récentes trouvées/i)).toBeTruthy();
    expect(screen.getAllByText(/denis-mac/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Restaurer/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ignorer/i })).toBeTruthy();
  });

  it('shows the conflict dialog with both choices', async () => {
    mockInvoke.mockResolvedValueOnce({
      kind: 'conflict',
      machineName: 'denis-mac',
      createdAt: '2026-06-09T22:14:00.000Z',
    } satisfies SyncLaunchCheck);
    render(<SyncLaunchGate />);
    expect(await screen.findByText(/Conflit de synchronisation/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Garder cette machine/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Prendre l'autre/i })).toBeTruthy();
  });

  it('shows the update-required message when the snapshot schema is newer', async () => {
    mockInvoke.mockResolvedValueOnce({
      kind: 'schema_too_new',
      machineName: 'denis-mac',
      createdAt: '2026-06-09T22:14:00.000Z',
    } satisfies SyncLaunchCheck);
    render(<SyncLaunchGate />);
    expect(await screen.findByText(/Mets à jour l'app/i)).toBeTruthy();
  });
});
