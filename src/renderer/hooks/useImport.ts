import { useRef, useState } from 'react';
import type { StatementExtraction } from '@shared/types/import';
import { ipc } from '@renderer/ipc/client';

export type ImportState =
  | { step: 'idle' }
  | { step: 'picking' }
  | { step: 'extracting' }
  | {
      step: 'review';
      extraction: StatementExtraction;
      filePath: string;
      selected: Set<string>;
      acknowledgedCannotVerify: boolean;
    }
  | { step: 'confirming' }
  | { step: 'done'; insertedCount: number }
  | { step: 'error'; message: string };

export interface UseImport {
  state: ImportState;
  pickAndExtract: () => Promise<void>;
  toggleTx: (txHash: string) => void;
  toggleAll: () => void;
  setAcknowledgedCannotVerify: (value: boolean) => void;
  confirm: () => Promise<void>;
  reset: () => void;
}

const ERROR_MESSAGES: Partial<Record<string, string>> = {
  unsupported_format: 'Format non reconnu. Utilisez un fichier OFX ou PDF.',
  malformed_ofx: 'Fichier OFX invalide ou corrompu.',
  not_pdf: 'Le fichier ne semble pas être un PDF valide.',
  no_text: 'Ce PDF ne contient pas de texte extractible (scan image ?).',
  unknown_bank: 'Banque non reconnue. Seuls les relevés LCL sont supportés.',
  arithmetic_failed: 'Le solde ne correspond pas aux transactions. Import bloqué.',
  cannot_verify_unacknowledged: 'Vérification du solde non confirmée.',
  already_imported: 'Ce fichier a déjà été importé.',
};

export function useImport(): UseImport {
  const [state, setState] = useState<ImportState>({ step: 'idle' });
  const stateRef = useRef<ImportState>(state);

  function setStateAndRef(next: ImportState | ((prev: ImportState) => ImportState)) {
    if (typeof next === 'function') {
      setState((prev) => {
        const resolved = next(prev);
        stateRef.current = resolved;
        return resolved;
      });
    } else {
      stateRef.current = next;
      setState(next);
    }
  }

  async function pickAndExtract() {
    setStateAndRef({ step: 'picking' });
    const pickRes = await ipc.invoke('import:pickFile', {});
    if (pickRes.cancelled) {
      setStateAndRef({ step: 'idle' });
      return;
    }

    setStateAndRef({ step: 'extracting' });
    const extractRes = await ipc.invoke('import:extract', {
      path: pickRes.path,
      accountId: 'acc-lcl-default',
    });

    if (!extractRes.ok) {
      setStateAndRef({
        step: 'error',
        message: ERROR_MESSAGES[extractRes.error] ?? extractRes.error,
      });
      return;
    }

    const { extraction } = extractRes;
    const selected = new Set(
      extraction.transactions.filter((tx) => !tx.isDuplicate).map((tx) => tx.tx_hash),
    );
    setStateAndRef({
      step: 'review',
      extraction,
      filePath: pickRes.path,
      selected,
      acknowledgedCannotVerify: false,
    });
  }

  function toggleTx(txHash: string) {
    setStateAndRef((prev) => {
      if (prev.step !== 'review') return prev;
      const next = new Set(prev.selected);
      if (next.has(txHash)) {
        next.delete(txHash);
      } else {
        next.add(txHash);
      }
      return { ...prev, selected: next };
    });
  }

  function toggleAll() {
    setStateAndRef((prev) => {
      if (prev.step !== 'review') return prev;
      const nonDuplicateHashes = prev.extraction.transactions
        .filter((tx) => !tx.isDuplicate)
        .map((tx) => tx.tx_hash);
      const allSelected = nonDuplicateHashes.every((h) => prev.selected.has(h));
      return { ...prev, selected: allSelected ? new Set<string>() : new Set(nonDuplicateHashes) };
    });
  }

  function setAcknowledgedCannotVerify(value: boolean) {
    setStateAndRef((prev) => {
      if (prev.step !== 'review') return prev;
      return { ...prev, acknowledgedCannotVerify: value };
    });
  }

  async function confirm() {
    const current = stateRef.current;
    if (current.step !== 'review') return;
    const { extraction, filePath, selected, acknowledgedCannotVerify } = current;

    setStateAndRef({ step: 'confirming' });

    const ack = extraction.sourceType === 'ofx' ? true : acknowledgedCannotVerify;
    const res = await ipc.invoke('import:confirm', {
      path: filePath,
      accountId: 'acc-lcl-default',
      selectedHashes: [...selected],
      acknowledgedCannotVerify: ack,
    });

    if (res.ok) {
      setStateAndRef({ step: 'done', insertedCount: res.insertedCount });
    } else {
      setStateAndRef({ step: 'error', message: ERROR_MESSAGES[res.error] ?? res.error });
    }
  }

  function reset() {
    setStateAndRef({ step: 'idle' });
  }

  return {
    state,
    pickAndExtract,
    toggleTx,
    toggleAll,
    setAcknowledgedCannotVerify,
    confirm,
    reset,
  };
}
