// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { AccountSummary } from '@shared/types/dashboard';

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { AccountManager } from '@renderer/components/accounts/AccountManager';

const invoke = vi.mocked(ipc.invoke);

const account: AccountSummary = {
  id: 'acc-1',
  name: 'Compte courant',
  type: 'checking',
  bankId: 'LCL',
  currency: 'EUR',
  balance: 2081,
  balanceSource: 'statement',
  txCount: 0,
};

beforeEach(() => {
  invoke.mockImplementation((channel: string) => {
    if (channel === 'dashboard:getAccounts') return Promise.resolve({ accounts: [account] });
    if (channel === 'accounts:delete') return Promise.resolve({ deletedTransactions: 0 });
    throw new Error(`unexpected channel ${channel}`);
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AccountManager', () => {
  it('notifies the shell after a confirmed account deletion (sidebar net worth refresh)', async () => {
    const onMutated = vi.fn();
    render(<AccountManager onMutated={onMutated} />);

    await screen.findByText('Compte courant');
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer Compte courant' }));
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer le compte' }));

    expect(invoke).toHaveBeenCalledWith('accounts:delete', { id: 'acc-1' });
    expect(onMutated).toHaveBeenCalled();
  });
});
