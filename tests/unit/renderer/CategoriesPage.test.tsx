// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { CategoriesPage } from '@renderer/pages/CategoriesPage';
import type { CategoryDTO, RuleDTO } from '@shared/types/category';

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
const RULES: RuleDTO[] = [
  {
    id: 'cr-060',
    matchType: 'contains',
    matchValue: 'CARREFOUR',
    categoryId: 'cat-alimentation',
    categoryName: 'Alimentation',
    hitCount: 4,
  },
];

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(((channel: string) => {
    if (channel === 'categories:list') return Promise.resolve({ categories: CATEGORIES });
    if (channel === 'rules:list') return Promise.resolve({ rules: RULES });
    if (channel === 'rules:create') return Promise.resolve({ rule: RULES[0] });
    if (channel === 'categories:delete') return Promise.resolve({ uncategorizedCount: 0 });
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
  it('lists categories and rules loaded over IPC', async () => {
    renderPage();
    // 'CARREFOUR' is unique to the rule row; the rename buttons are unique per category.
    expect(await screen.findByText('CARREFOUR')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Renommer Alimentation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Renommer Logement/i })).toBeInTheDocument();
  });

  it('creates a rule from the add form', async () => {
    renderPage();
    await screen.findByText('CARREFOUR');

    fireEvent.change(screen.getByPlaceholderText(/Libellé contient/i), {
      target: { value: 'IKEA' },
    });
    fireEvent.change(screen.getByLabelText('Catégorie'), { target: { value: 'cat-logement' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('rules:create', {
        matchType: 'contains',
        matchValue: 'IKEA',
        categoryId: 'cat-logement',
      });
    });
  });

  it('deletes a category after inline confirmation', async () => {
    renderPage();
    await screen.findByText('CARREFOUR');
    fireEvent.click(screen.getByRole('button', { name: /Supprimer Alimentation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Supprimer$/ }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('categories:delete', { id: 'cat-alimentation' });
    });
  });

  it('deletes a rule', async () => {
    renderPage();
    await screen.findByText('CARREFOUR');
    fireEvent.click(screen.getByRole('button', { name: /Supprimer la règle CARREFOUR/i }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('rules:delete', { id: 'cr-060' });
    });
  });
});
