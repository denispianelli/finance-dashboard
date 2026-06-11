// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CategoryDTO } from '@shared/types/category';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { toast } from 'sonner';
import { RuleDialog, type RuleProposal } from '@renderer/components/categories/RuleDialog';

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

const PROPOSAL: RuleProposal = {
  labelClean: 'CB CARREFOUR MARKET PARIS 11',
  categoryId: 'cat-alimentation',
};

beforeEach(() => {
  mockInvoke.mockReset();
  vi.mocked(toast.success).mockReset();
});

afterEach(() => {
  cleanup();
});

function renderDialog(over: Partial<Parameters<typeof RuleDialog>[0]> = {}) {
  return render(
    <RuleDialog
      proposal={PROPOSAL}
      categories={CATEGORIES}
      onClose={vi.fn()}
      onCreated={vi.fn()}
      {...over}
    />,
  );
}

describe('RuleDialog', () => {
  it('pre-fills the suggested token, contains type and the chosen category', () => {
    renderDialog();
    expect(screen.getByLabelText('Valeur')).toHaveProperty('value', 'CARREFOUR');
    expect(screen.getByLabelText('Type de règle')).toHaveProperty('value', 'contains');
    expect(screen.getByLabelText('Catégorie')).toHaveProperty('value', 'cat-alimentation');
  });

  it('creates the rule and reports the applied count', async () => {
    mockInvoke.mockResolvedValue({
      ok: true,
      rule: {
        id: 'r1',
        matchType: 'contains',
        matchValue: 'CARREFOUR',
        categoryId: 'cat-alimentation',
        hitCount: 3,
        createdAt: 'x',
      },
      applied: 3,
    });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onCreated, onClose });

    await userEvent.click(screen.getByRole('button', { name: 'Créer la règle' }));

    expect(mockInvoke).toHaveBeenCalledWith('rules:create', {
      matchType: 'contains',
      matchValue: 'CARREFOUR',
      categoryId: 'cat-alimentation',
    });
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      'Règle créée — 3 transactions catégorisées',
    );
    expect(onCreated).toHaveBeenCalledWith(3);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an inline error on invalid_rule and stays open', async () => {
    mockInvoke.mockResolvedValue({ ok: false, error: 'invalid_rule' });
    const onClose = vi.fn();
    renderDialog({ onClose });

    await userEvent.click(screen.getByRole('button', { name: 'Créer la règle' }));

    expect(screen.getByText(/Règle invalide/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
  });

  it('renders nothing without a proposal', () => {
    const { container } = renderDialog({ proposal: null });
    expect(container.firstChild).toBeNull();
  });
});
