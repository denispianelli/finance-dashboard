import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
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

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
}

export function ImportModal({ open, onClose }: ImportModalProps) {
  const {
    state,
    pickAndExtract,
    toggleTx,
    toggleAll,
    setAcknowledgedCannotVerify,
    confirm,
    reset,
  } = useImport();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const [overlapDismissed, setOverlapDismissed] = useState(false);
  const insertedCount = state.step === 'done' ? state.insertedCount : 0;

  useEffect(() => {
    if (state.step !== 'done') return;
    toast(
      `${String(insertedCount)} transaction${insertedCount > 1 ? 's' : ''} importée${insertedCount > 1 ? 's' : ''}`,
      { duration: 3000 },
    );
    reset();
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

        {(state.step === 'idle' || state.step === 'picking' || state.step === 'extracting') && (
          <PickView
            onPick={() => {
              void pickAndExtract();
            }}
            loading={state.step === 'picking' || state.step === 'extracting'}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickView({ onPick, loading }: { onPick: () => void; loading: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <p className="text-sm text-muted-foreground">OFX recommandé · PDF pour les archives</p>
      <Button onClick={onPick} disabled={loading}>
        {loading ? 'Chargement…' : 'Parcourir…'}
      </Button>
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
