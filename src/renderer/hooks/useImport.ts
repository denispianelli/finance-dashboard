import { useRef, useState } from 'react';
import type { StatementExtraction } from '@shared/types/import';
import { ipc } from '@renderer/ipc/client';

export type ImportState =
  | { step: 'idle' }
  | { step: 'picking' }
  | { step: 'extracting' }
  | { step: 'unknownBank'; filePath: string; accountId: string }
  | { step: 'learning' }
  | {
      step: 'review';
      extraction: StatementExtraction;
      filePath: string;
      accountId: string;
      selected: Set<string>;
      acknowledgedCannotVerify: boolean;
    }
  | { step: 'confirming' }
  | { step: 'done'; insertedCount: number }
  | { step: 'error'; message: string };

export interface UseImport {
  state: ImportState;
  pickAndExtract: (accountId: string) => Promise<void>;
  learnBank: (bankName: string) => Promise<void>;
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
  arithmetic_failed: 'Le solde ne correspond pas aux transactions. Import bloqué.',
  cannot_verify_unacknowledged: 'Vérification du solde non confirmée.',
  already_imported: 'Ce fichier a déjà été importé.',
  model_unavailable: "Modèle IA non installé — impossible d'analyser une nouvelle banque.",
  inference_failed: "L'IA n'a pas réussi à lire la structure de ce relevé.",
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

  async function runExtract(accountId: string, path: string) {
    setStateAndRef({ step: 'extracting' });
    const extractRes = await ipc.invoke('import:extract', { path, accountId });

    if (!extractRes.ok) {
      // An unknown bank (PDF only) is recoverable: offer to learn it with the LLM.
      if (extractRes.error === 'unknown_bank') {
        setStateAndRef({ step: 'unknownBank', filePath: path, accountId });
        return;
      }
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
      filePath: path,
      accountId,
      selected,
      acknowledgedCannotVerify: false,
    });
  }

  async function pickAndExtract(accountId: string) {
    setStateAndRef({ step: 'picking' });
    const pickRes = await ipc.invoke('import:pickFile', {});
    if (pickRes.cancelled) {
      setStateAndRef({ step: 'idle' });
      return;
    }
    await runExtract(accountId, pickRes.path);
  }

  async function learnBank(bankName: string) {
    const current = stateRef.current;
    if (current.step !== 'unknownBank') return;
    const { filePath, accountId } = current;

    setStateAndRef({ step: 'learning' });
    const res = await ipc.invoke('banks:learn', { path: filePath, bankName });
    if (res.ok) {
      await runExtract(accountId, filePath); // now detectBank recognizes the learned bank
    } else {
      setStateAndRef({ step: 'error', message: ERROR_MESSAGES[res.error] ?? res.error });
    }
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
    const { extraction, filePath, accountId, selected, acknowledgedCannotVerify } = current;

    setStateAndRef({ step: 'confirming' });

    const ack = extraction.sourceType === 'ofx' ? true : acknowledgedCannotVerify;
    const res = await ipc.invoke('import:confirm', {
      path: filePath,
      accountId,
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
    learnBank,
    toggleTx,
    toggleAll,
    setAcknowledgedCannotVerify,
    confirm,
    reset,
  };
}
