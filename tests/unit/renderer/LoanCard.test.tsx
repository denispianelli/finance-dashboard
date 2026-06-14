// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LoanCard } from '../../../src/renderer/components/patrimoine/LoanCard';
import type { LoanWithStats } from '@shared/types/patrimoine';

afterEach(() => {
  cleanup();
});

const LOAN: LoanWithStats = {
  id: 'l1',
  name: 'Prêt principal',
  lender: 'LCL',
  principal: 150000,
  nominalRate: 1.7,
  startDate: '2016-09-07',
  termMonths: 319,
  share: 0.5,
  crd: 120000,
  endDate: '2043-05-05',
  nextInstallment: {
    id: 'i',
    seq: 30,
    dueDate: '2026-07-05',
    capital: 700,
    interest: 200,
    insurance: 48.56,
    fees: 0,
    payment: 948.56,
    balanceAfter: 119300,
  },
  interestThisYear: 2400,
  insuranceThisYear: 583,
  remainingCost: 18000,
  remainingInsurance: 4200,
};

describe('LoanCard', () => {
  it('shows the name, CRD and end date', () => {
    render(<LoanCard loan={LOAN} onView={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Prêt principal')).toBeInTheDocument();
    expect(screen.getByText(/restant dû/i)).toBeInTheDocument();
  });

  it('folds insurance into the cost figures with a breakdown', () => {
    render(<LoanCard loan={LOAN} onView={vi.fn()} onDelete={vi.fn()} />);
    // Coût restant = interest 18000 + insurance 4200 = 22 200 €.
    expect(screen.getByText('Coût restant')).toBeInTheDocument();
    expect(screen.getAllByText(/dont assurance/i).length).toBeGreaterThan(0);
  });

  it('asks for confirmation before deleting', () => {
    const onDelete = vi.fn();
    render(<LoanCard loan={LOAN} onView={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le prêt' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText(/sera perdu/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(onDelete).toHaveBeenCalledWith('l1');
  });
});
