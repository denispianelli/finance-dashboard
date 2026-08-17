import { useState } from 'react';
import { toast } from 'sonner';
import type { CategoryDTO } from '@shared/types/category';
import type { RuleMatchType } from '@shared/types/rules';
import { suggestRuleToken } from '@shared/categorize/labelKey';
import { ipc } from '@renderer/ipc/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Select } from '../ui/select';

/** What the reassign toast hands over: the corrected label + chosen category. */
export interface RuleProposal {
  labelClean: string;
  categoryId: string;
}

const FIELD =
  'h-9 w-full rounded-md border border-line-2 bg-ink-3 px-2.5 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

/**
 * Inner form — receives stable initial values and manages its own local state.
 * Re-mounted (keyed) when the proposal changes, so state always matches the
 * freshly seeded defaults.
 */
function RuleForm({
  proposal,
  initialMatchType,
  initialMatchValue,
  categories,
  onClose,
  onCreated,
}: {
  proposal: RuleProposal;
  initialMatchType: RuleMatchType;
  initialMatchValue: string;
  categories: CategoryDTO[];
  onClose: () => void;
  onCreated: (applied: number) => void;
}) {
  const [matchType, setMatchType] = useState<RuleMatchType>(initialMatchType);
  const [matchValue, setMatchValue] = useState(initialMatchValue);
  const [categoryId, setCategoryId] = useState(proposal.categoryId);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    const res = await ipc.invoke('rules:create', { matchType, matchValue, categoryId });
    if (!res.ok) {
      setError('Règle invalide — vérifie la valeur (regex ?) et la catégorie.');
      return;
    }
    const n: number = res.applied;
    toast.success(
      `Règle créée${n > 0 ? ` — ${String(n)} transaction${n > 1 ? 's' : ''} catégorisée${n > 1 ? 's' : ''}` : ''}`,
    );
    onCreated(n);
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Créer une règle</DialogTitle>
          <DialogDescription className="sr-only">
            Transformez cette correction en règle de catégorisation : type, valeur, catégorie.
          </DialogDescription>
        </DialogHeader>
        <p className="font-mono text-[11px] text-paper-dim">{proposal.labelClean}</p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 text-[12px] text-paper-soft">
            <span>Type de règle</span>
            <Select
              ariaLabel="Type de règle"
              value={matchType}
              onValueChange={(v) => {
                setMatchType(v as RuleMatchType);
              }}
              options={[
                { value: 'contains', label: 'Contient' },
                { value: 'exact', label: 'Exact' },
                { value: 'regex', label: 'Regex' },
              ]}
              className="h-9 w-full text-[13px]"
            />
          </div>
          <label className="flex flex-col gap-1 text-[12px] text-paper-soft">
            Valeur
            <input
              aria-label="Valeur"
              className={FIELD}
              value={matchValue}
              onChange={(e) => {
                setMatchValue(e.target.value);
              }}
            />
          </label>
          <div className="flex flex-col gap-1 text-[12px] text-paper-soft">
            <span>Catégorie</span>
            <Select
              ariaLabel="Catégorie"
              value={categoryId}
              onValueChange={setCategoryId}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              className="h-9 w-full text-[13px]"
            />
          </div>
          {error !== null && <p className="text-[12px] text-flag">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            onClick={() => {
              void submit();
            }}
          >
            Créer la règle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Create a rule from this correction": pre-filled with the suggested significant
 * token (fallback: exact stable key) and the category just chosen; everything is
 * editable before validating. Validation errors come back inline, not as toasts.
 */
export function RuleDialog({
  proposal,
  categories,
  onClose,
  onCreated,
}: {
  proposal: RuleProposal | null;
  categories: CategoryDTO[];
  onClose: () => void;
  onCreated: (applied: number) => void;
}) {
  if (proposal === null) return null;

  const suggestion = suggestRuleToken(proposal.labelClean);

  return (
    <RuleForm
      key={`${proposal.labelClean}:${proposal.categoryId}`}
      proposal={proposal}
      initialMatchType={suggestion.matchType}
      initialMatchValue={suggestion.value}
      categories={categories}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}
