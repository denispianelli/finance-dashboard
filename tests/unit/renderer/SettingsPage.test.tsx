// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
// The sync and backup sections talk IPC on mount and have their own test files —
// stub them here so this test stays about the page structure.
vi.mock('@renderer/components/sync/SyncSettingsSection', () => ({
  SyncSettingsSection: () => null,
}));
vi.mock('@renderer/components/backup/BackupSettingsSection', () => ({
  BackupSettingsSection: () => null,
}));
vi.mock('@renderer/components/patrimoine/QuoteSettingsSection', () => ({
  QuoteSettingsSection: () => null,
}));
vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));

import { SettingsPage } from '@renderer/pages/SettingsPage';

afterEach(() => {
  cleanup();
});

describe('SettingsPage', () => {
  it('renders the four content sections and no model section', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Synchronisation')).toBeInTheDocument();
    expect(screen.getByText('Données & Sauvegarde')).toBeInTheDocument();
    expect(screen.getByText('Cours de marché')).toBeInTheDocument();
    expect(screen.getByText('Apparence & divers')).toBeInTheDocument();
    expect(screen.queryByText('Modèle LLM')).not.toBeInTheDocument();
  });

  it('disables the "à venir" actions (reset)', () => {
    render(<SettingsPage />);
    // "Restaurer" moved into BackupSettingsSection (stubbed here); only "Tout réinitialiser" stays.
    expect(screen.getByRole('button', { name: /Tout réinitialiser/ })).toBeDisabled();
  });

  it('keeps the live-worthy export actions enabled', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('button', { name: 'CSV' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'JSON' })).toBeEnabled();
    // "Sauvegarder maintenant" moved into BackupSettingsSection (stubbed here).
  });
});
