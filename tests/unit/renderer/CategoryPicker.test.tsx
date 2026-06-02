// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { CategoryPicker } from '@renderer/components/dashboard/CategoryPicker';
import type { CategoryDTO } from '@shared/types/category';

const CATS: CategoryDTO[] = [
  {
    id: 'cat-a',
    name: 'Alimentation',
    icon: 'shop',
    color: '#7AB890',
    parentId: null,
    isDefault: true,
    position: 1,
  },
  {
    id: 'cat-b',
    name: 'Transport',
    icon: 'car',
    color: '#6E9BC4',
    parentId: null,
    isDefault: true,
    position: 2,
  },
];

afterEach(() => {
  cleanup();
});

describe('CategoryPicker', () => {
  it('selects an existing category from the menu', () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    render(
      <CategoryPicker
        categories={CATS}
        current={{ name: 'Alimentation', color: '#7AB890' }}
        onSelect={onSelect}
        onCreate={onCreate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Alimentation/i })); // open
    fireEvent.click(screen.getByRole('button', { name: 'Transport' }));
    expect(onSelect).toHaveBeenCalledWith('cat-b');
  });

  it('creates a category on the fly and assigns it', async () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn().mockResolvedValue({
      id: 'cat-new',
      name: 'Animaux',
      icon: 'wallet',
      color: '#7AB890',
      parentId: null,
      isDefault: false,
      position: 17,
    } satisfies CategoryDTO);

    render(
      <CategoryPicker
        categories={CATS}
        current={{ name: 'Non catégorisé', color: '#6E6E78' }}
        onSelect={onSelect}
        onCreate={onCreate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Non catégorisé/i })); // open
    fireEvent.click(screen.getByRole('button', { name: /Nouvelle catégorie/i }));
    fireEvent.change(screen.getByPlaceholderText('Nom de la catégorie'), {
      target: { value: 'Animaux' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Créer et assigner/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Animaux', icon: 'wallet' }),
      );
    });
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith('cat-new');
    });
  });
});
