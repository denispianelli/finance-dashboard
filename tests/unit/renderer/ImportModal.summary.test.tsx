// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@renderer/ipc/client', () => ({
  ipc: {
    invoke: vi.fn().mockResolvedValue({ accounts: [] }),
    onModelProgress: vi.fn().mockReturnValue(vi.fn()),
  },
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

// Drive the modal straight to a multi-file summary by stubbing the hook.
vi.mock('@renderer/hooks/useImport', () => ({
  useImport: () => ({
    state: {
      step: 'summary',
      results: [
        {
          fileName: 'a.ofx',
          status: 'imported',
          accountId: 'acc-a',
          insertedCount: 3,
          autoRouted: true,
        },
        { fileName: 'b.pdf', status: 'skipped', reason: 'Déjà importé — rien de nouveau.' },
        { fileName: 'c.txt', status: 'failed', error: 'Format non supporté' },
      ],
    },
    pickFiles: vi.fn(),
    startFromPaths: vi.fn(),
    chooseAccount: vi.fn(),
    learnBank: vi.fn(),
    toggleTx: vi.fn(),
    toggleAll: vi.fn(),
    setAcknowledgedCannotVerify: vi.fn(),
    confirm: vi.fn(),
    skipFile: vi.fn(),
    reset: vi.fn(),
  }),
}));

import { ImportModal } from '@renderer/components/ImportModal';

afterEach(() => {
  cleanup();
});

describe('ImportModal — summary view', () => {
  it('lists imported, skipped and failed files', () => {
    render(<ImportModal open onClose={vi.fn()} />);
    expect(screen.getByText('a.ofx')).toBeTruthy();
    expect(screen.getByText('b.pdf')).toBeTruthy();
    expect(screen.getByText('c.txt')).toBeTruthy();
    expect(screen.getByText(/Format non supporté/)).toBeTruthy();
  });
});
