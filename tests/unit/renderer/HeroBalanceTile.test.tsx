// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { HeroBalanceTile } from '@renderer/components/dashboard/HeroBalanceTile';
import type { Account } from '@renderer/lib/dashboardMap';

const accounts: Account[] = [
  { id: 'a', name: 'Compte courant', bank: 'LCL', balance: '3 240 €', type: 'checking' },
  { id: 'b', name: 'Livret A', bank: 'LCL', balance: '18 600 €', type: 'savings' },
];

describe('HeroBalanceTile', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the eyebrow, the balance figure and an account row per account', () => {
    render(<HeroBalanceTile balance={21840} series={[100, 120, 140, 160]} accounts={accounts} />);
    expect(screen.getByText(/Solde net · comptes/i)).toBeInTheDocument();
    expect(screen.getByText('Compte courant')).toBeInTheDocument();
    expect(screen.getByText('Livret A')).toBeInTheDocument();
    // the formatted hero figure contains the grouped integer part
    expect(screen.getByText(/21\s?840/)).toBeInTheDocument();
  });

  it('caps the account list at 4 rows', () => {
    const many: Account[] = Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      name: `Compte ${String(i)}`,
      bank: 'LCL',
      balance: '0 €',
      type: 'checking',
    }));
    render(<HeroBalanceTile balance={0} series={[0]} accounts={many} />);
    expect(screen.getByText('Compte 0')).toBeInTheDocument();
    expect(screen.queryByText('Compte 4')).toBeNull();
  });
});
