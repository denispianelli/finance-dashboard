// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountsMiniTile } from '@renderer/components/dashboard/AccountsMiniTile';
import type { Account } from '@renderer/lib/dashboardMap';

const accounts: Account[] = [
  {
    id: 'a',
    name: 'Compte courant',
    bank: 'LCL',
    balance: '3 240 €',
    balanceValue: 3240,
    type: 'checking',
  },
  {
    id: 'b',
    name: 'Livret A',
    bank: 'LCL',
    balance: '18 600 €',
    balanceValue: 18600,
    type: 'savings',
  },
];

describe('AccountsMiniTile', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the title and a row per account', () => {
    render(<AccountsMiniTile accounts={accounts} onManage={vi.fn()} />);
    expect(screen.getByText('Mes comptes')).toBeInTheDocument();
    expect(screen.getByText('Compte courant')).toBeInTheDocument();
    expect(screen.getByText('Livret A')).toBeInTheDocument();
    expect(screen.getByText('3 240 €')).toBeInTheDocument();
  });

  it('calls onManage when the manage button is clicked', async () => {
    const onManage = vi.fn();
    const user = userEvent.setup();
    render(<AccountsMiniTile accounts={accounts} onManage={onManage} />);
    await user.click(screen.getByRole('button', { name: /gérer les comptes/i }));
    expect(onManage).toHaveBeenCalledOnce();
  });
});
