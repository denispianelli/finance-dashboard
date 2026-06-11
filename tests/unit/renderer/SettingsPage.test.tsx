// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));
// The sync body talks IPC on mount and has its own test file — stub it here so
// this test stays about the page structure.
vi.mock('@renderer/components/sync/SyncSettingsSection', () => ({
  SyncSettingsSection: () => null,
}));

import { SettingsPage } from '@renderer/pages/SettingsPage';

afterEach(() => {
  cleanup();
});

describe('SettingsPage', () => {
  it('renders the three content sections and no model section', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Synchronisation')).toBeInTheDocument();
    expect(screen.getByText('Données & Sauvegarde')).toBeInTheDocument();
    expect(screen.getByText('Apparence & divers')).toBeInTheDocument();
    expect(screen.queryByText('Modèle LLM')).not.toBeInTheDocument();
  });

  it('disables the "à venir" actions (restore, reset)', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('button', { name: /Restaurer/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Tout réinitialiser/ })).toBeDisabled();
  });

  it('keeps the live-worthy export/backup actions enabled', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('button', { name: 'CSV' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'JSON' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Sauvegarder' })).toBeEnabled();
  });
});
