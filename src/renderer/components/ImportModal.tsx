import {
  AlertTriangle,
  CheckCircle,
  Plus,
  Sparkles,
  Upload,
  X,
  XCircle,
  SkipForward,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ipc } from '@renderer/ipc/client';
import { useImport, type FileResult, type SubState } from '../hooks/useImport';
import { useModelStatus } from '@renderer/hooks/useModelStatus';
import { PdfModelRequiredDialog } from '@renderer/components/model/PdfModelRequiredDialog';
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
import { formatEuro } from '@renderer/lib/euro';
import { formatModelSize } from '@renderer/lib/modelFormat';

const FIELD =
  'h-9 w-full rounded-md border border-line-2 bg-ink-3 px-2.5 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}

export function ImportModal({ open, onClose, onImported }: ImportModalProps) {
  const {
    state,
    pickFiles,
    startFromPaths,
    chooseAccount,
    learnBank,
    toggleTx,
    toggleAll,
    setAcknowledgedCannotVerify,
    confirm,
    skipFile,
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
  const [dragOver, setDragOver] = useState(false);

  const modelStatus = useModelStatus();

  // Reopening always starts fresh: closing mid-queue must not resume on stale
  // sub-state (or show a summary for work the user abandoned).
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void ipc.invoke('dashboard:getAccounts', {}).then(({ accounts: next }) => {
      if (active) setAccounts(next);
    });
    return () => {
      active = false;
    };
  }, [open]);

  async function createAccountInline(input: CreateAccountInput): Promise<string | null> {
    try {
      const { account } = await ipc.invoke('accounts:create', input);
      setAccounts((prev) => [...prev, account]);
      onImportedRef.current?.();
      toast.success(`Compte « ${account.name} » créé`);
      return account.id;
    } catch {
      toast.error('Compte non créé');
      return null;
    }
  }

  // On reaching the summary, refresh the dashboard; auto-close the trivial
  // single-imported-file case with the familiar toast.
  useEffect(() => {
    if (state.step !== 'summary') return;
    onImportedRef.current?.();
    if (state.results.length === 1 && state.results[0]?.status === 'imported') {
      const n = state.results[0].insertedCount;
      toast(`${String(n)} transaction${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}`, {
        duration: 3000,
      });
      reset();
      onCloseRef.current();
    }
  }, [state, reset]);

  // Auto-resume: when the model becomes ready while paused at modelRequired,
  // replay the learn call so the import continues without user interaction.
  const prevModelStateRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevModelStateRef.current;
    const cur = modelStatus.state;
    prevModelStateRef.current = cur;
    // Only act on a transition TO ready (not the initial seed that lands on ready).
    if (prev !== null && prev !== 'ready' && cur === 'ready') {
      if (state.step === 'queue' && state.sub.step === 'modelRequired') {
        void learnBank(state.sub.bankName);
      }
    }
  }, [modelStatus.state, state, learnBank]);

  // Lazy hardware detection: trigger when the PDF-required dialog becomes visible.
  const pdfModelRequired = state.step === 'queue' && state.sub.step === 'modelRequired';
  useEffect(() => {
    if (pdfModelRequired) void ipc.invoke('model:selection:detect', {});
  }, [pdfModelRequired]);

  function handleClose() {
    reset();
    setOverlapDismissed(false);
    onClose();
  }

  function accountName(id: string): string {
    return accounts.find((a) => a.id === id)?.name ?? id;
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const paths = window.electronAPI.getDroppedPaths(files).filter(Boolean);
    if (paths.length > 0) void startFromPaths(paths);
  }

  const sub: SubState | null = state.step === 'queue' ? state.sub : null;
  const progress =
    state.step === 'queue' ? ` (${String(state.index + 1)}/${String(state.files.length)})` : '';

  return (
    <>
      <PdfModelRequiredDialog
        open={sub?.step === 'modelRequired'}
        sizeLabel={
          modelStatus.target ? `~${formatModelSize(modelStatus.target.sizeBytes)}` : '~2,0 Go'
        }
        onInstall={() => {
          void ipc.invoke('model:download:start', {});
        }}
        onClose={skipFile}
      />
      <Dialog
        open={open && sub?.step !== 'modelRequired'}
        onOpenChange={(o) => {
          if (!o) handleClose();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importer des relevés{progress}</DialogTitle>
            <DialogDescription className="sr-only">
              Sélectionnez ou déposez des fichiers OFX ou PDF, vérifiez les transactions, confirmez.
            </DialogDescription>
          </DialogHeader>

          {state.step === 'idle' && (
            <DropPickView
              dragOver={dragOver}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => {
                setDragOver(false);
              }}
              onDrop={onDrop}
              onPick={() => {
                void pickFiles();
              }}
            />
          )}

          {(sub?.step === 'resolving' || sub?.step === 'extracting') && (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">
                {sub.step === 'resolving' ? 'Analyse du compte…' : 'Extraction du relevé…'}
              </p>
            </div>
          )}

          {sub?.step === 'chooseAccount' && (
            <ChooseAccountView
              fileName={state.step === 'queue' ? (state.files[state.index]?.fileName ?? '') : ''}
              detectedBank={sub.detectedBank}
              accounts={accounts}
              onChoose={(id) => {
                void chooseAccount(id);
              }}
              onCreateAccount={createAccountInline}
              onSkip={skipFile}
            />
          )}

          {sub?.step === 'unknownBank' && (
            <LearnBankView
              onLearn={(name) => {
                void learnBank(name);
              }}
              onCancel={skipFile}
            />
          )}

          {sub?.step === 'learning' && (
            <div className="flex flex-col items-center gap-2 py-8">
              <p className="text-sm text-paper">Analyse de la banque par l'IA…</p>
              <p className="text-xs text-paper-mute">
                Environ une minute, une seule fois par banque.
              </p>
            </div>
          )}

          {sub?.step === 'review' && (
            <ReviewView
              extraction={sub.extraction}
              fileName={state.step === 'queue' ? (state.files[state.index]?.fileName ?? '') : ''}
              accountLabel={accountName(sub.accountId)}
              autoRouted={sub.autoRouted}
              selected={sub.selected}
              acknowledgedCannotVerify={sub.acknowledgedCannotVerify}
              overlapDismissed={overlapDismissed}
              onDismissOverlap={() => {
                setOverlapDismissed(true);
              }}
              onToggleTx={toggleTx}
              onToggleAll={toggleAll}
              onAcknowledge={setAcknowledgedCannotVerify}
              onSkip={skipFile}
              onConfirm={() => {
                void confirm();
              }}
              confirmDisabled={!canConfirm(sub)}
            />
          )}

          {sub?.step === 'confirming' && (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">Import en cours…</p>
            </div>
          )}

          {sub?.step === 'fileError' && (
            <div className="flex flex-col gap-4 py-4">
              <p className="text-sm text-destructive">{sub.message}</p>
              <DialogFooter>
                <Button variant="outline" onClick={skipFile}>
                  <SkipForward size={14} strokeWidth={1.8} />
                  Ignorer ce fichier
                </Button>
              </DialogFooter>
            </div>
          )}

          {state.step === 'summary' && (
            <SummaryView results={state.results} accountName={accountName} onClose={handleClose} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function canConfirm(sub: SubState): boolean {
  if (sub.step !== 'review') return false;
  if (sub.selected.size === 0) return false;
  if (sub.extraction.arithmetic.status === 'failed') return false;
  if (
    sub.extraction.sourceType === 'pdf' &&
    sub.extraction.arithmetic.status === 'cannot_verify' &&
    !sub.acknowledgedCannotVerify
  ) {
    return false;
  }
  return true;
}

function DropPickView({
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onPick,
}: {
  dragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onPick: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 py-6">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-md border border-dashed p-8 text-center transition-colors ${
          dragOver ? 'border-brass bg-brass/5' : 'border-line-2'
        }`}
      >
        <Upload size={22} strokeWidth={1.6} className="text-paper-mute" />
        <p className="text-sm text-paper-soft">Dépose tes relevés ici</p>
        <p className="text-xs text-paper-mute">OFX recommandé · PDF pour les archives</p>
        <Button onClick={onPick}>Parcourir…</Button>
      </div>
    </div>
  );
}

function ChooseAccountView({
  fileName,
  detectedBank,
  accounts,
  onChoose,
  onCreateAccount,
  onSkip,
}: {
  fileName: string;
  detectedBank: string | null;
  accounts: AccountSummary[];
  onChoose: (accountId: string) => void;
  onCreateAccount: (input: CreateAccountInput) => Promise<string | null>;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState<string>(accounts[0]?.id ?? '');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [bank, setBank] = useState(detectedBank ?? '');

  async function submitNew() {
    if (name.trim() === '') return;
    const id = await onCreateAccount({ name, bankId: bank.trim() === '' ? null : bank });
    if (id !== null) onChoose(id);
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <p className="text-sm text-paper-soft">
        Compte non reconnu pour <span className="font-medium text-paper">{fileName}</span>. Choisis
        son compte — il sera mémorisé pour les prochains imports.
      </p>

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
            placeholder="Banque (optionnel)"
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
              Créer et utiliser
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
            value={selected}
            aria-label="Compte de destination"
            onChange={(e) => {
              setSelected(e.target.value);
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

      <DialogFooter>
        <Button variant="outline" onClick={onSkip}>
          <SkipForward size={14} strokeWidth={1.8} />
          Ignorer ce fichier
        </Button>
        {!creating && (
          <Button
            disabled={selected === ''}
            onClick={() => {
              onChoose(selected);
            }}
          >
            Continuer →
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

function SummaryView({
  results,
  accountName,
  onClose,
}: {
  results: FileResult[];
  accountName: (id: string) => string;
  onClose: () => void;
}) {
  const total = results.reduce(
    (sum, r) => sum + (r.status === 'imported' ? r.insertedCount : 0),
    0,
  );
  return (
    <div className="flex flex-col gap-4 py-2">
      <ul className="flex flex-col gap-1.5 text-sm">
        {results.map((r) => (
          <li key={r.fileName} className="flex items-center gap-2">
            {r.status === 'imported' && (
              <CheckCircle size={14} strokeWidth={1.6} className="text-sage" />
            )}
            {r.status === 'skipped' && (
              <SkipForward size={14} strokeWidth={1.6} className="text-paper-mute" />
            )}
            {r.status === 'failed' && (
              <XCircle size={14} strokeWidth={1.6} className="text-coral" />
            )}
            <span className="font-medium text-paper">{r.fileName}</span>
            <span className="text-muted-foreground">
              {r.status === 'imported' &&
                `${String(r.insertedCount)} tx → ${accountName(r.accountId)}${r.autoRouted ? ' (auto)' : ''}`}
              {r.status === 'skipped' && r.reason}
              {r.status === 'failed' && r.error}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        {total} transaction{total > 1 ? 's' : ''} importée{total > 1 ? 's' : ''} au total.
      </p>
      <DialogFooter>
        <Button onClick={onClose}>Fermer</Button>
      </DialogFooter>
    </div>
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
          <SkipForward size={14} strokeWidth={1.8} />
          Ignorer ce fichier
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

interface ReviewViewProps {
  extraction: StatementExtraction;
  fileName: string;
  accountLabel: string;
  autoRouted: boolean;
  selected: Set<string>;
  acknowledgedCannotVerify: boolean;
  overlapDismissed: boolean;
  onDismissOverlap: () => void;
  onToggleTx: (hash: string) => void;
  onToggleAll: () => void;
  onAcknowledge: (v: boolean) => void;
  onSkip: () => void;
  onConfirm: () => void;
  confirmDisabled: boolean;
}

function ReviewView({
  extraction,
  fileName,
  accountLabel,
  autoRouted,
  selected,
  acknowledgedCannotVerify,
  overlapDismissed,
  onDismissOverlap,
  onToggleTx,
  onToggleAll,
  onAcknowledge,
  onSkip,
  onConfirm,
  confirmDisabled,
}: ReviewViewProps) {
  const selectedCount = selected.size;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{fileName}</span>
          <span className="text-xs text-paper-mute">
            → {accountLabel}
            {autoRouted ? ' (auto)' : ''}
          </span>
        </div>
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
              <X size={14} strokeWidth={1.8} />
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
        <Button variant="outline" onClick={onSkip}>
          <SkipForward size={14} strokeWidth={1.8} />
          Ignorer
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
          {arithmetic.closingBalance !== null ? formatEuro(arithmetic.closingBalance) : '—'}
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
        <span>Écart de {arithmetic.delta !== null ? formatEuro(arithmetic.delta) : '—'}</span>
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
