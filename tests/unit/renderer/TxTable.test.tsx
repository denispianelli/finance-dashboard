// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TxTableRow, type TxRow } from '@renderer/components/dashboard/TxTable';

afterEach(() => {
  cleanup();
});

const baseRow: TxRow = {
  id: 't1',
  date: '14/05',
  icon: 'wallet',
  main: 'Carrefour',
  sub: 'CB CARREFOUR',
  catColor: '#6E6E78',
  catName: 'Courses',
  amount: -84.3,
  amountKind: 'expense',
  edited: false,
  originalHint: null,
  editDate: '2026-05-14',
  editAmount: -84.3,
  editLabel: 'Carrefour',
};

describe('TxTableRow', () => {
  it('calls onStartEdit when the pencil is clicked', () => {
    const onStartEdit = vi.fn();
    render(<TxTableRow row={baseRow} onStartEdit={onStartEdit} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Modifier'));
    expect(onStartEdit).toHaveBeenCalledWith('t1');
  });

  it('calls onDelete when the trash is clicked', () => {
    const onDelete = vi.fn();
    render(<TxTableRow row={baseRow} onStartEdit={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText('Supprimer'));
    expect(onDelete).toHaveBeenCalledWith('t1');
  });

  it('in edit mode, saves the parsed French amount and trimmed label', () => {
    const onSaveEdit = vi.fn();
    render(
      <TxTableRow
        row={baseRow}
        editing
        onSaveEdit={onSaveEdit}
        onCancelEdit={vi.fn()}
        onStartEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Montant'), { target: { value: '-90,5' } });
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: ' Carrefour Market ' } });
    fireEvent.click(screen.getByLabelText('Enregistrer'));
    expect(onSaveEdit).toHaveBeenCalledWith('t1', {
      date: '2026-05-14',
      label: 'Carrefour Market',
      amount: -90.5,
    });
  });

  it('blocks save on an invalid amount', () => {
    const onSaveEdit = vi.fn();
    render(
      <TxTableRow
        row={baseRow}
        editing
        onSaveEdit={onSaveEdit}
        onCancelEdit={vi.fn()}
        onStartEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Montant'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByLabelText('Enregistrer'));
    expect(onSaveEdit).not.toHaveBeenCalled();
  });

  it('shows the modified marker with the original hint', () => {
    render(
      <TxTableRow
        row={{ ...baseRow, edited: true, originalHint: 'extrait : -84,30 · 14/05' }}
        onStartEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('extrait : -84,30 · 14/05')).toBeInTheDocument();
  });
});
