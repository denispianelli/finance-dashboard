import { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import type {
  AccountSummary,
  CreateAccountInput,
  UpdateAccountInput,
} from '@shared/types/dashboard';
import { Card, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Overline } from '../ui/overline';
import { Money } from '../ui/money';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { useAccounts } from '../../hooks/useAccounts';
import { cn } from '../../lib/utils';

const INPUT =
  'h-9 rounded-md border border-line-2 bg-ink-3 px-2.5 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

export function AccountManager() {
  const { accounts, createAccount, updateAccount, deleteAccount } = useAccounts();
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3.5">
          <Overline>— Réglages</Overline>
          <CardTitle>Comptes</CardTitle>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setAdding((a) => !a);
          }}
        >
          <Plus size={14} strokeWidth={1.8} />
          Nouveau compte
        </Button>
      </CardHeader>

      <p className="pb-1 font-sans text-[11px] text-paper-dim">
        Renomme, ajoute ou supprime tes comptes. Supprimer un compte efface aussi définitivement ses
        transactions.
      </p>

      {adding && (
        <div className="mb-2 rounded-md border border-line-2 bg-ink-2/60 p-3">
          <AccountForm
            submitLabel="Créer le compte"
            onSubmit={(input) => {
              void createAccount(input);
              setAdding(false);
            }}
          />
        </div>
      )}

      <div className="flex flex-col">
        {accounts.map((a) => (
          <AccountRow key={a.id} account={a} onUpdate={updateAccount} onDelete={deleteAccount} />
        ))}
      </div>
    </Card>
  );
}

function AccountForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: { name: string; bankId: string | null };
  submitLabel: string;
  onSubmit: (input: CreateAccountInput) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [bank, setBank] = useState(initial?.bankId ?? '');

  function submit() {
    const trimmed = name.trim();
    if (trimmed === '') return;
    onSubmit({ name: trimmed, bankId: bank.trim() === '' ? null : bank.trim() });
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape' && onCancel) onCancel();
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        placeholder="Nom du compte"
        onChange={(e) => {
          setName(e.target.value);
        }}
        onKeyDown={onKey}
        className={cn(INPUT, 'flex-1')}
      />
      <input
        value={bank}
        placeholder="Banque (optionnel)"
        onChange={(e) => {
          setBank(e.target.value);
        }}
        onKeyDown={onKey}
        className={cn(INPUT, 'w-44')}
      />
      <Button variant="secondary" size="sm" onClick={submit}>
        {submitLabel}
      </Button>
      {onCancel !== undefined && (
        <button
          type="button"
          aria-label="Annuler"
          onClick={onCancel}
          className="flex h-7 w-7 items-center justify-center rounded-md text-paper-dim hover:bg-ink-3"
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      )}
    </div>
  );
}

function AccountRow({
  account,
  onUpdate,
  onDelete,
}: {
  account: AccountSummary;
  onUpdate: (input: UpdateAccountInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (editing) {
    return (
      <div className="border-b border-line-1 py-2">
        <AccountForm
          initial={{ name: account.name, bankId: account.bankId }}
          submitLabel="Enregistrer"
          onSubmit={(input) => {
            void onUpdate({ id: account.id, name: input.name, bankId: input.bankId });
            setEditing(false);
          }}
          onCancel={() => {
            setEditing(false);
          }}
        />
      </div>
    );
  }

  const plural = account.txCount > 1 ? 's' : '';

  return (
    <div className="group flex items-center gap-2.5 border-b border-line-1 py-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-sans text-[13px] text-paper">{account.name}</span>
        <span className="font-mono text-[11px] text-paper-dim">
          {account.bankId ?? 'Sans banque'} · {account.txCount} transaction{plural}
        </span>
      </div>

      {account.balance === null ? (
        <span className="font-mono text-[13px] tabular-nums text-paper-dim">—</span>
      ) : (
        <Money
          value={account.balance}
          kind={account.balance < 0 ? 'expense' : 'plain'}
          className="text-[13px]"
        />
      )}
      <button
        type="button"
        aria-label={`Renommer ${account.name}`}
        onClick={() => {
          setEditing(true);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-md text-paper-dim opacity-0 transition-opacity hover:bg-ink-3 hover:text-paper group-hover:opacity-100"
      >
        <Pencil size={13} strokeWidth={1.6} />
      </button>
      <button
        type="button"
        aria-label={`Supprimer ${account.name}`}
        onClick={() => {
          setConfirmingDelete(true);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-md text-paper-dim opacity-0 transition-opacity hover:bg-ink-3 hover:text-coral group-hover:opacity-100"
      >
        <Trash2 size={13} strokeWidth={1.6} />
      </button>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="max-w-md">
          <DialogClose
            aria-label="Fermer"
            className="absolute right-4 top-4 rounded-md text-paper-dim transition-colors hover:text-paper focus:outline-none focus:ring-1 focus:ring-brass"
          >
            <X size={16} strokeWidth={1.8} />
          </DialogClose>
          <DialogHeader>
            <DialogTitle>Supprimer ce compte ?</DialogTitle>
            <DialogDescription>
              {account.txCount > 0
                ? `« ${account.name} » et ses ${String(account.txCount)} transaction${plural} seront définitivement supprimés. Cette action est irréversible.`
                : `« ${account.name} » sera définitivement supprimé.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Annuler
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                void onDelete(account.id);
                setConfirmingDelete(false);
              }}
            >
              Supprimer le compte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
