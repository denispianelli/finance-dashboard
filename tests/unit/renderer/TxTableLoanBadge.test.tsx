// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { TxTableRow } from '@renderer/components/dashboard/TxTable';
import type { TxRow } from '@renderer/components/dashboard/TxTable';

afterEach(() => {
  cleanup();
});

const BASE_ROW: TxRow = {
  id: 'tx-loan-1',
  date: '14/05',
  icon: 'wallet',
  main: 'Remboursement prêt immobilier',
  sub: 'VIR SEPA CREDIT AGRICOLE',
  catColor: '#6E6E78',
  catName: 'Non catégorisé',
  amount: -948.56,
  amountKind: 'expense',
  edited: false,
  originalHint: null,
  editDate: '2026-05-14',
  editAmount: -948.56,
  editLabel: 'Remboursement prêt immobilier',
  loanSplit: { interestInsurance: 263.13, capital: 685.43 },
};

it('shows a loan badge with mensualité prêt text for a matched installment', () => {
  render(
    <table>
      <tbody>
        <tr>
          <TxTableRow row={BASE_ROW} />
        </tr>
      </tbody>
    </table>,
  );

  expect(screen.getByText(/mensualité prêt/i)).toBeInTheDocument();
});
