// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CategoryDTO } from '@shared/types/category';
import type { RuleDTO } from '@shared/types/rules';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { RulesSection } from '@renderer/components/categories/RulesSection';

const mockInvoke = vi.mocked(ipc.invoke);

const CATEGORIES: CategoryDTO[] = [
  {
    id: 'cat-alimentation',
    name: 'Alimentation',
    icon: null,
    color: '#22c55e',
    parentId: null,
    isDefault: true,
    position: 1,
  },
  {
    id: 'cat-loisirs',
    name: 'Loisirs',
    icon: null,
    color: '#3b82f6',
    parentId: null,
    isDefault: true,
    position: 2,
  },
];

const RULES: RuleDTO[] = [
  {
    id: 'cr-001',
    matchType: 'contains',
    matchValue: 'NETFLIX',
    categoryId: 'cat-loisirs',
    hitCount: 12,
    createdAt: '2026-05-15 10:00:00',
  },
  {
    id: 'r-user',
    matchType: 'exact',
    matchValue: 'ZZZ EXACT',
    categoryId: 'cat-alimentation',
    hitCount: 0,
    createdAt: '2026-06-11 09:00:00',
  },
];

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((channel) => {
    if (channel === 'rules:list') return Promise.resolve({ rules: RULES });
    if (channel === 'rules:delete') return Promise.resolve({ ok: true as const });
    return Promise.resolve({
      ok: true as const,
      rule: RULES[1],
      applied: 0,
    });
  });
});

afterEach(() => {
  cleanup();
});

describe('RulesSection', () => {
  it('lists rules with value, category, hit count and creation date', async () => {
    render(<RulesSection categories={CATEGORIES} />);
    expect(await screen.findByText('NETFLIX')).toBeTruthy();
    expect(screen.getByText('Loisirs')).toBeTruthy();
    expect(screen.getByText('12 ×')).toBeTruthy();
    expect(screen.getByText('ZZZ EXACT')).toBeTruthy();
    expect(screen.getByText('2026-05-15')).toBeTruthy();
  });

  it('deletes a rule after the confirmation step', async () => {
    render(<RulesSection categories={CATEGORIES} />);
    await screen.findByText('NETFLIX');

    const deleteButtons = screen.getAllByRole('button', { name: 'Supprimer la règle' });
    await userEvent.click(deleteButtons[0] ?? deleteButtons[deleteButtons.length - 1]);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));

    expect(mockInvoke).toHaveBeenCalledWith('rules:delete', { id: 'cr-001' });
  });

  it('edits a rule inline', async () => {
    render(<RulesSection categories={CATEGORIES} />);
    await screen.findByText('NETFLIX');

    const editButtons = screen.getAllByRole('button', { name: 'Modifier la règle' });
    await userEvent.click(editButtons[0] ?? editButtons[editButtons.length - 1]);
    const valueInput = screen.getByLabelText('Valeur de la règle');
    await userEvent.clear(valueInput);
    await userEvent.type(valueInput, 'NETFLIX FR');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la règle' }));

    expect(mockInvoke).toHaveBeenCalledWith('rules:update', {
      id: 'cr-001',
      matchType: 'contains',
      matchValue: 'NETFLIX FR',
      categoryId: 'cat-loisirs',
    });
  });
});
