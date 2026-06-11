// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { CategoriesPage } from '@renderer/pages/CategoriesPage';
import type { CategoryDTO } from '@shared/types/category';

const mockInvoke = vi.mocked(ipc.invoke);

const CATEGORIES: CategoryDTO[] = [
  {
    id: 'cat-alimentation',
    name: 'Alimentation',
    icon: 'shop',
    color: '#7AB890',
    parentId: null,
    isDefault: true,
    position: 3,
  },
  {
    id: 'cat-logement',
    name: 'Logement',
    icon: 'home',
    color: '#8AA8C7',
    parentId: null,
    isDefault: true,
    position: 1,
  },
];

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(((channel: string) => {
    if (channel === 'categories:list') return Promise.resolve({ categories: CATEGORIES });
    if (channel === 'categories:create') return Promise.resolve({ category: CATEGORIES[0] });
    if (channel === 'categories:delete') return Promise.resolve({ uncategorizedCount: 0 });
    if (channel === 'categories:rename') return Promise.resolve({ categories: CATEGORIES });
    if (channel === 'rules:list') return Promise.resolve({ rules: [] });
    return Promise.resolve({ ok: true });
  }) as typeof ipc.invoke);
});

afterEach(() => {
  cleanup();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <CategoriesPage />
    </MemoryRouter>,
  );
}

describe('CategoriesPage', () => {
  it('lists categories loaded over IPC', async () => {
    renderPage();
    // Each category shows in its row and as an <option> of the rules-section filter.
    expect(await screen.findAllByText('Alimentation')).not.toHaveLength(0);
    expect(screen.getAllByText('Logement')).not.toHaveLength(0);
  });

  it('shows the rules audit section (ADR-019: rules are the engine)', async () => {
    renderPage();
    await screen.findAllByText('Alimentation');
    expect(screen.getByText('Règles')).toBeInTheDocument();
  });

  it('creates a category from the form', async () => {
    renderPage();
    await screen.findAllByText('Alimentation');
    fireEvent.click(screen.getByRole('button', { name: /Nouvelle catégorie/i }));
    fireEvent.change(screen.getByPlaceholderText('Nom de la catégorie'), {
      target: { value: 'Animaux' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Créer la catégorie/i }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'categories:create',
        expect.objectContaining({ name: 'Animaux' }),
      );
    });
  });

  it('deletes a category after inline confirmation', async () => {
    renderPage();
    await screen.findAllByText('Alimentation');
    fireEvent.click(screen.getByRole('button', { name: /Supprimer Alimentation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Supprimer$/ }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('categories:delete', { id: 'cat-alimentation' });
    });
  });
});
