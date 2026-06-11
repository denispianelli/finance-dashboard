// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { MappingAssistantView } from '@renderer/components/ImportModal';

afterEach(() => {
  cleanup();
});

const SUGGESTED = { date: 1, valeur: null, label: 2, debit: 3, credit: 4, balance: null };

describe('MappingAssistantView', () => {
  it('pre-fills the column slots from the suggestion and shows the header line', () => {
    render(
      <MappingAssistantView
        suggested={SUGGESTED}
        headerTokens={['Date', 'Libellé', 'Débit', 'Crédit']}
        mappingError={false}
        onLearn={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/Date · Libellé · Débit · Crédit/)).toBeTruthy();
    expect(screen.getByLabelText('Colonne 1')).toHaveProperty('value', 'date');
    expect(screen.getByLabelText('Colonne 2')).toHaveProperty('value', 'label');
    expect(screen.getByLabelText('Colonne 3')).toHaveProperty('value', 'debit');
    expect(screen.getByLabelText('Colonne 4')).toHaveProperty('value', 'credit');
    expect(screen.getByLabelText('Colonne 5')).toHaveProperty('value', '');
  });

  it('submits the composed order with the bank name', async () => {
    const onLearn = vi.fn();
    render(
      <MappingAssistantView
        suggested={SUGGESTED}
        headerTokens={['Date', 'Libellé', 'Débit', 'Crédit']}
        mappingError={false}
        onLearn={onLearn}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByPlaceholderText(/Nom de la banque/), 'Société Générale');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer cette banque' }));

    expect(onLearn).toHaveBeenCalledWith('Société Générale', {
      date: 1,
      valeur: null,
      label: 2,
      debit: 3,
      credit: 4,
      balance: null,
    });
  });

  it('blocks submit and explains when the composition is invalid', async () => {
    const onLearn = vi.fn();
    render(
      <MappingAssistantView
        suggested={null}
        headerTokens={[]}
        mappingError={false}
        onLearn={onLearn}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByPlaceholderText(/Nom de la banque/), 'X Bank');
    await userEvent.selectOptions(screen.getByLabelText('Colonne 1'), 'date');
    // no label, no amount yet
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer cette banque' }));

    expect(onLearn).not.toHaveBeenCalled();
    expect(screen.getByText(/libellé et au moins un montant/i)).toBeTruthy();
  });

  it('shows the backend rejection inline', () => {
    render(
      <MappingAssistantView
        suggested={SUGGESTED}
        headerTokens={['Date', 'Libellé', 'Débit', 'Crédit']}
        mappingError
        onLearn={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/Colonnes introuvables/)).toBeTruthy();
  });
});
