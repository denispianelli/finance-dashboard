import { useState } from 'react';
import { toast } from 'sonner';
import { ipc } from '@renderer/ipc/client';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

const INPUT =
  'h-9 w-full rounded-md border border-line-2 bg-ink-3 px-2.5 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

function message(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^[a-zA-Z]+:\s*/, '') : 'erreur inattendue';
}

/** A focused modal that does one thing: create an account (name + optional bank).
 *  Separate from the import flow on purpose. */
export function CreateAccountModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [bank, setBank] = useState('');
  const [busy, setBusy] = useState(false);

  function reset() {
    setName('');
    setBank('');
    setBusy(false);
  }

  async function submit() {
    const trimmed = name.trim();
    if (trimmed === '' || busy) return;
    setBusy(true);
    try {
      const { account } = await ipc.invoke('accounts:create', {
        name: trimmed,
        bankId: bank.trim() === '' ? null : bank.trim(),
      });
      toast.success(`Compte « ${account.name} » créé`);
      onCreated();
      reset();
      onClose();
    } catch (e) {
      toast.error(`Compte non créé : ${message(e)}`);
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau compte</DialogTitle>
          <DialogDescription>
            Crée un compte. Tu pourras y importer des relevés ensuite.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <input
            autoFocus
            value={name}
            placeholder="Nom du compte (ex. Compte courant)"
            onChange={(e) => {
              setName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            className={cn(INPUT)}
          />
          <input
            value={bank}
            placeholder="Banque (optionnel)"
            onChange={(e) => {
              setBank(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            className={cn(INPUT)}
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" size="sm">
              Annuler
            </Button>
          </DialogClose>
          <Button
            size="sm"
            disabled={busy || name.trim() === ''}
            onClick={() => {
              void submit();
            }}
          >
            Créer le compte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
