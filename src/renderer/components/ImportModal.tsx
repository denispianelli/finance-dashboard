import { AlertTriangle, CheckCircle, Plus, Sparkles, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ipc } from '@renderer/ipc/client';
import { useImport } from '../hooks/useImport';
import { TransactionReviewTable } from './TransactionReviewTable';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import type { StatementExtraction } from '@shared/types/import';
import type { AccountSummary, CreateAccountInput } from '@shared/types/dashboard';

const FIELD =
  'h-9 w-full rounded-md border border-line-2 bg-ink-3 px-2.5 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  /** Fired once after a successful import (transactions persisted). */
  onImported?: () => void;
}

export function ImportModal({ open, onClose, onImported }: ImportModalProps) {
  const {
    state,
    pickAndExtract,
    learnBank,
    toggleTx,
    toggleAll,
    setAcknowledgedCannotVerify,
    confirm,
    reset,
  } = useImport();
  const onCloseRef = useRef(onClose);
  const onImportedRef = useRef(onImported);
  useEffect(() => {
    onCloseRef.current = onClose;
    onImportedRef.current = onImported;
  });

  const [overlapDismissed, setOverlapDismissed] = useState(false);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const insertedCount = state.step === 'done' ? state.insertedCount : 0;

  // Load the account list whenever the modal opens, so the user can pick which
  // account the statement goes into (or create a new one).
  useEffect(() => {
    if (!open) return;
    let active = true;
    void ipc.invoke('dashboard:getAccounts', {}).then(({ accounts: next }) => {
      if (!active) return;
      setAccounts(next);
      setSelectedAccountId((prev) =>
        prev !== '' && next.some((a) => a.id === prev) ? prev : (next[0]?.id ?? ''),
      );
    });
    return () => {
      active = false;
    };
  }, [open]);

  async function createAccountInline(input: CreateAccountInput): Promise<void> {
    try {
      const { account } = await ipc.invoke('accounts:create', input);
      setAccounts((prev) => [...prev, account]);
      setSelectedAccountId(account.id);
      onImportedRef.current?.(); // refresh the dashboard tabs so the new account shows
      toast.success(`Compte « ${account.name} » créé`);
    } catch {
      toast.error('Compte non créé');
    }
  }

  useEffect(() => {
    if (state.step !== 'done') return;
    toast(
      `${String(insertedCount)} transaction${insertedCount > 1 ? 's' : ''} importée${insertedCount > 1 ? 's' : ''}`,
      { duration: 3000 },
    );
    reset();
    onImportedRef.current?.();
    onCloseRef.current();
  }, [state.step, insertedCount, reset]);

  function handleClose() {
    reset();
    setOverlapDismissed(false);
    onClose();
  }

  function canConfirm(): boolean {
    if (state.step !== 'review') return false;
    if (state.selected.size === 0) return false;
    if (state.extraction.arithmetic.status === 'failed') return false;
    if (
      state.extraction.sourceType === 'pdf' &&
      state.extraction.arithmetic.status === 'cannot_verify' &&
      !state.acknowledgedCannotVerify
    ) {
      return false;
    }
    return true;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importer un relevé</DialogTitle>
          <DialogDescription className="sr-only">
            Sélectionnez un fichier OFX ou PDF, vérifiez les transactions, puis confirmez l'import.
          </DialogDescription>
        </DialogHeader>

        {state.step === 'error' && <ErrorView message={state.message} onClose={handleClose} />}

        {state.step === 'review' && (
          <ReviewView
            extraction={state.extraction}
            filePath={state.filePath}
            selected={state.selected}
            acknowledgedCannotVerify={state.acknowledgedCannotVerify}
            overlapDismissed={overlapDismissed}
            onDismissOverlap={() => {
              setOverlapDismissed(true);
            }}
            onToggleTx={toggleTx}
            onToggleAll={toggleAll}
            onAcknowledge={setAcknowledgedCannotVerify}
            onCancel={handleClose}
            onConfirm={() => {
              void confirm();
            }}
            confirmDisabled={!canConfirm()}
          />
        )}

        {state.step === 'confirming' && (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">Import en cours…</p>
          </div>
        )}

        {state.step === 'learning' && (
          <div className="flex flex-col items-center gap-2 py-8">
            <p className="text-sm text-paper">Analyse de la banque par l'IA…</p>
            <p className="text-xs text-paper-mute">
              Cela prend environ une minute, une seule fois par banque.
            </p>
          </div>
        )}

        {state.step === 'unknownBank' && (
          <LearnBankView
            onLearn={(name) => {
              void learnBank(name);
            }}
            onCancel={handleClose}
          />
        )}

        {(state.step === 'idle' || state.step === 'picking' || state.step === 'extracting') && (
          <PickView
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onSelectAccount={setSelectedAccountId}
            onCreateAccount={createAccountInline}
            onPick={() => {
              if (selectedAccountId !== '') void pickAndExtract(selectedAccountId);
            }}
            loading={state.step === 'picking' || state.step === 'extracting'}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LearnBankView({
  onLearn,
  onCancel,
}: {
  onLearn: (bankName: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex items-start gap-2 rounded-md border border-line-2 bg-ink-2/60 p-3 text-sm">
        <Sparkles size={16} strokeWidth={1.6} className="mt-0.5 shrink-0 text-brass" />
        <span className="text-paper-soft">
          Banque non reconnue. L'IA peut analyser ce relevé pour apprendre sa mise en page — une
          seule fois (~1 min, en local). Les imports suivants de cette banque seront instantanés.
        </span>
      </div>
      <input
        autoFocus
        value={name}
        placeholder="Nom de la banque (ex. Société Générale)"
        onChange={(e) => {
          setName(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim() !== '') onLearn(name.trim());
        }}
        className={FIELD}
      />
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button
          disabled={name.trim() === ''}
          onClick={() => {
            onLearn(name.trim());
          }}
        >
          <Sparkles size={14} strokeWidth={1.8} />
          Analyser avec l'IA (~1 min)
        </Button>
      </DialogFooter>
    </div>
  );
}

function PickView({
  accounts,
  selectedAccountId,
  onSelectAccount,
  onCreateAccount,
  onPick,
  loading,
}: {
  accounts: AccountSummary[];
  selectedAccountId: string;
  onSelectAccount: (id: string) => void;
  onCreateAccount: (input: CreateAccountInput) => Promise<void>;
  onPick: () => void;
  loading: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [bank, setBank] = useState('');

  async function submitNew() {
    if (name.trim() === '') return;
    await onCreateAccount({ name, bankId: bank.trim() === '' ? null : bank });
    setCreating(false);
    setName('');
    setBank('');
  }

  return (
    <div className="flex flex-col gap-4 py-6">
      <div className="flex flex-col gap-1.5">
        <label className="font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-paper-mute">
          Importer dans
        </label>
        {creating ? (
          <div className="flex flex-col gap-2 rounded-md border border-line-2 bg-ink-2/60 p-2.5">
            <input
              autoFocus
              value={name}
              placeholder="Nom du compte (ex. Compte joint)"
              onChange={(e) => {
                setName(e.target.value);
              }}
              className={FIELD}
            />
            <input
              value={bank}
              placeholder="Banque (optionnel, ex. Boursorama)"
              onChange={(e) => {
                setBank(e.target.value);
              }}
              className={FIELD}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={name.trim() === ''}
                onClick={() => {
                  void submitNew();
                }}
              >
                Créer le compte
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                }}
              >
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <select
              value={selectedAccountId}
              aria-label="Compte de destination"
              onChange={(e) => {
                onSelectAccount(e.target.value);
              }}
              className={FIELD}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.bankId !== null ? ` · ${a.bankId}` : ''}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              aria-label="Nouveau compte"
              onClick={() => {
                setCreating(true);
              }}
            >
              <Plus size={14} strokeWidth={1.8} />
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-3 border-t border-line-2 pt-4">
        <p className="text-sm text-muted-foreground">OFX recommandé · PDF pour les archives</p>
        <Button onClick={onPick} disabled={loading || selectedAccountId === '' || creating}>
          {loading ? 'Chargement…' : 'Parcourir…'}
        </Button>
      </div>
    </div>
  );
}

function ErrorView({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-destructive">{message}</p>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Fermer
        </Button>
      </DialogFooter>
    </div>
  );
}

interface ReviewViewProps {
  extraction: StatementExtraction;
  filePath: string;
  selected: Set<string>;
  acknowledgedCannotVerify: boolean;
  overlapDismissed: boolean;
  onDismissOverlap: () => void;
  onToggleTx: (hash: string) => void;
  onToggleAll: () => void;
  onAcknowledge: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled: boolean;
}

function ReviewView({
  extraction,
  filePath,
  selected,
  acknowledgedCannotVerify,
  overlapDismissed,
  onDismissOverlap,
  onToggleTx,
  onToggleAll,
  onAcknowledge,
  onCancel,
  onConfirm,
  confirmDisabled,
}: ReviewViewProps) {
  const selectedCount = selected.size;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-sm font-medium">{filePath.split('/').pop() ?? filePath}</div>
        <div className="text-sm text-muted-foreground">
          {extraction.dateRangeStart} → {extraction.dateRangeEnd} · {extraction.transactions.length}{' '}
          transaction
          {extraction.transactions.length > 1 ? 's' : ''}
        </div>
      </div>

      <ArithmeticBadge
        extraction={extraction}
        acknowledgedCannotVerify={acknowledgedCannotVerify}
        onAcknowledge={onAcknowledge}
      />

      {extraction.periodOverlap.hasOverlap && !overlapDismissed && (
        <div
          className="rounded-md border p-3 text-sm"
          style={{
            background: 'hsl(var(--flag-soft))',
            color: 'hsl(var(--flag))',
            borderColor: 'hsl(var(--flag))',
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <span>
              Ce relevé chevauche un import existant (
              {extraction.periodOverlap.overlappingImports[0]?.date_range_start} →{' '}
              {extraction.periodOverlap.overlappingImports[0]?.date_range_end}). Vérifiez les
              doublons ci-dessous.
            </span>
            <button
              type="button"
              className="shrink-0 opacity-70 hover:opacity-100"
              style={{ color: 'hsl(var(--flag))' }}
              onClick={onDismissOverlap}
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <TransactionReviewTable
        transactions={extraction.transactions}
        selected={selected}
        onToggleTx={onToggleTx}
        onToggleAll={onToggleAll}
      />

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button onClick={onConfirm} disabled={confirmDisabled}>
          Importer {selectedCount} transaction{selectedCount > 1 ? 's' : ''} →
        </Button>
      </DialogFooter>
    </div>
  );
}

function ArithmeticBadge({
  extraction,
  acknowledgedCannotVerify,
  onAcknowledge,
}: {
  extraction: StatementExtraction;
  acknowledgedCannotVerify: boolean;
  onAcknowledge: (v: boolean) => void;
}) {
  const { arithmetic, sourceType } = extraction;

  if (arithmetic.status === 'passed') {
    return (
      <div
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm"
        style={{ background: 'hsl(var(--sage-soft))', color: 'hsl(var(--sage))' }}
      >
        <CheckCircle size={14} strokeWidth={1.6} />
        <span>
          Solde vérifié —{' '}
          {arithmetic.closingBalance?.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
        </span>
      </div>
    );
  }

  if (arithmetic.status === 'failed') {
    return (
      <div
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm"
        style={{ background: 'hsl(var(--coral-soft))', color: 'hsl(var(--coral))' }}
      >
        <XCircle size={14} strokeWidth={1.6} />
        <span>
          Écart de {arithmetic.delta?.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
        </span>
      </div>
    );
  }

  if (sourceType === 'pdf') {
    return (
      <div
        className="flex flex-col gap-2 rounded-md px-3 py-2 text-sm"
        style={{ background: 'hsl(var(--flag-soft))', color: 'hsl(var(--flag))' }}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} strokeWidth={1.6} />
          <span>Solde non vérifiable</span>
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={acknowledgedCannotVerify}
            onCheckedChange={(v) => {
              onAcknowledge(v === true);
            }}
            aria-label="Je confirme l'import sans vérification du solde"
          />
          <span>Je confirme l&apos;import sans vérification du solde</span>
        </label>
      </div>
    );
  }

  return null;
}
