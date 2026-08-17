import { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import type {
  AccountSummary,
  CreateAccountInput,
  UpdateAccountInput,
} from '@shared/types/dashboard';
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
import { AccountCard } from './AccountCard';

const INPUT =
  'h-9 rounded-md border border-line-2 bg-ink-3 px-2.5 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

/** `onMutated` is forwarded to `useAccounts` so account create / rename / delete
 *  can refresh shell-level data (sidebar net worth). */
export function AccountManager({ onMutated }: { onMutated?: () => void }) {
  const { accounts, createAccount, updateAccount, deleteAccount } = useAccounts(onMutated);
  const [adding, setAdding] = useState(false);

  const total = accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);
  const n = accounts.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="tile flex flex-wrap items-start justify-between gap-4 p-[22px]">
        <div className="min-w-0">
          <Overline>
            {n} compte{n > 1 ? 's' : ''}
          </Overline>
          <h2 className="mt-1 font-sans text-base font-semibold tracking-[-0.015em] text-paper">
            Mes comptes
          </h2>
          <p className="mt-1 max-w-[460px] font-sans text-[11px] text-paper-dim">
            Renomme, ajoute ou supprime tes comptes. Supprimer un compte efface aussi définitivement
            ses transactions.
          </p>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="font-sans text-[10px] uppercase tracking-[0.12em] text-paper-mute">
              Total
            </div>
            <Money value={total} className="text-title font-semibold" />
          </div>
          <Button
            onClick={() => {
              setAdding((a) => !a);
            }}
          >
            <Plus size={14} strokeWidth={1.8} />
            Nouveau compte
          </Button>
        </div>
      </div>

      {adding && (
        <div className="tile p-[18px]">
          <AccountForm
            submitLabel="Créer le compte"
            onSubmit={(input) => {
              void createAccount(input);
              setAdding(false);
            }}
            onCancel={() => {
              setAdding(false);
            }}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => (
          <AccountManageCard
            key={a.id}
            account={a}
            onUpdate={updateAccount}
            onDelete={deleteAccount}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            setAdding(true);
          }}
          className="flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-2 text-paper-mute transition-colors hover:border-line-3 hover:text-paper"
        >
          <Plus size={18} strokeWidth={1.6} />
          <span className="font-sans text-xs">Ajouter un compte</span>
        </button>
      </div>
    </div>
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
    <div className="flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={name}
        placeholder="Nom du compte"
        onChange={(e) => {
          setName(e.target.value);
        }}
        onKeyDown={onKey}
        className={cn(INPUT, 'min-w-[160px] flex-1')}
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

function AccountManageCard({
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
      <div className="tile p-[18px]">
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

  return (
    <>
      <AccountCard
        type={account.type}
        name={account.name}
        balance={account.balance}
        bank={account.bankId}
        actions={
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              aria-label={`Renommer ${account.name}`}
              onClick={() => {
                setEditing(true);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-paper-dim hover:bg-surface-2 hover:text-paper"
            >
              <Pencil size={13} strokeWidth={1.6} />
            </button>
            <button
              type="button"
              aria-label={`Supprimer ${account.name}`}
              onClick={() => {
                setConfirmingDelete(true);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-paper-dim hover:bg-surface-2 hover:text-coral"
            >
              <Trash2 size={13} strokeWidth={1.6} />
            </button>
          </div>
        }
      />
      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer ce compte ?</DialogTitle>
            <DialogDescription>
              {account.txCount > 0
                ? `« ${account.name} » et ses ${String(account.txCount)} transaction${account.txCount > 1 ? 's' : ''} seront définitivement supprimés. Cette action est irréversible.`
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
    </>
  );
}
