// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));
vi.mock('@renderer/ipc/client', () => ({
  ipc: {
    invoke: vi.fn(() => Promise.resolve({ state: 'absent' })),
    onModelProgress: vi.fn(() => () => undefined),
  },
}));

import { SettingsPage } from '@renderer/pages/SettingsPage';
import { ipc } from '@renderer/ipc/client';

afterEach(() => {
  cleanup();
});

describe('SettingsPage', () => {
  it('renders the three content sections', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Modèle LLM')).toBeInTheDocument();
    expect(screen.getByText('Données & Sauvegarde')).toBeInTheDocument();
    expect(screen.getByText('Apparence & divers')).toBeInTheDocument();
  });

  it('shows the dynamic model name and role copy', async () => {
    vi.mocked(ipc.invoke).mockResolvedValueOnce({
      state: 'ready',
      active: { id: 'qwen2.5-7b', label: 'Qwen2.5 7B', sizeBytes: 4683074240 },
    });
    render(<SettingsPage />);
    expect(await screen.findByText('Qwen2.5 7B')).toBeInTheDocument();
    expect(screen.getByText(/Ne dialogue jamais/)).toBeInTheDocument();
  });

  it('disables the "à venir" actions (recategorize, restore, reset)', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('button', { name: /Relancer la catégorisation/ })).toBeDisabled();
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
