import { useRef, useState } from 'react';
import type { StatementExtraction, ReviewTransaction } from '@shared/types/import';
import type { ConfirmCategory } from '@shared/types/ipc';
import { ipc } from '@renderer/ipc/client';

/** Per-row category state in Review (deterministic seed or LLM/user overlay). */
export interface ReviewCategory {
  categoryId: string | null;
  userModified: boolean;
}

/** Residual batch size for the progressive LLM categorization loop. */
const LLM_BATCH_SIZE = 12;

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
      categories: Map<string, ReviewCategory>;
      pending: Set<string>; // tx_hash whose batch is in flight → "IA…"
      suggested: Set<string>; // tx_hash the LLM filled → "IA" badge until touched
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
  pickCategory: (txHash: string, categoryId: string | null) => void;
  confirm: () => Promise<void>;
  reset: () => void;
}

/** Split an array into fixed-size chunks (last chunk may be shorter). */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Remove a batch's hashes from the Review `pending` set. */
function clearPending(
  prev: Extract<ImportState, { step: 'review' }>,
  batchHashes: readonly string[],
): Extract<ImportState, { step: 'review' }> {
  const pending = new Set(prev.pending);
  for (const h of batchHashes) pending.delete(h);
  return { ...prev, pending };
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
    const categories = new Map<string, ReviewCategory>();
    for (const tx of extraction.transactions) {
      if (tx.isDuplicate) continue;
      categories.set(tx.tx_hash, { categoryId: tx.categoryId, userModified: false });
    }
    setStateAndRef({
      step: 'review',
      extraction,
      filePath: path,
      accountId,
      selected,
      acknowledgedCannotVerify: false,
      categories,
      pending: new Set<string>(),
      suggested: new Set<string>(),
    });

    // Fire-and-forget the progressive LLM fill. It reads stateRef to stop early
    // (Confirm/close sets step !== 'review'); late results are dropped by the guards.
    void runCategorizeLoop(extraction.transactions);
  }

  /**
   * Best-effort progressive categorization of the residual rows. Runs after the
   * Review state is set; merges each batch's suggestions as it resolves. Cancellation
   * is "drop late results", not a hard abort — there is no AbortController.
   */
  async function runCategorizeLoop(transactions: readonly ReviewTransaction[]) {
    const residual = transactions.filter((t) => !t.isDuplicate && t.tier === null);

    for (const batch of chunk(residual, LLM_BATCH_SIZE)) {
      // Confirm/close happened → abandon the remaining batches.
      if (stateRef.current.step !== 'review') break;

      const batchHashes = batch.map((t) => t.tx_hash);
      setStateAndRef((prev) => {
        if (prev.step !== 'review') return prev;
        const pending = new Set(prev.pending);
        for (const h of batchHashes) pending.add(h);
        return { ...prev, pending };
      });

      const res = await ipc.invoke('import:categorize', {
        items: batch.map((t) => ({ tx_hash: t.tx_hash, label: t.label })),
      });

      // No model installed → clear this batch and stop the whole loop.
      if (!res.ok && res.error === 'model_unavailable') {
        setStateAndRef((prev) => (prev.step !== 'review' ? prev : clearPending(prev, batchHashes)));
        break;
      }

      // Merge (or, on inference_failed, just clear pending). The guard drops any
      // result that resolved after Confirm/close (step !== 'review').
      setStateAndRef((prev) => {
        if (prev.step !== 'review') return prev; // drop late result
        if (!res.ok) return clearPending(prev, batchHashes); // inference_failed → stays residual

        const categories = new Map(prev.categories);
        const suggested = new Set(prev.suggested);
        for (const r of res.results) {
          if (r.categoryId === null) continue;
          const existing = categories.get(r.tx_hash);
          // Never overwrite a row the user already set.
          if (existing?.userModified === true) continue;
          categories.set(r.tx_hash, { categoryId: r.categoryId, userModified: false });
          suggested.add(r.tx_hash);
        }
        return { ...clearPending(prev, batchHashes), categories, suggested };
      });
    }
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

  function pickCategory(txHash: string, categoryId: string | null) {
    setStateAndRef((prev) => {
      if (prev.step !== 'review') return prev;
      const categories = new Map(prev.categories);
      categories.set(txHash, { categoryId, userModified: true });
      const suggested = new Set(prev.suggested);
      suggested.delete(txHash);
      return { ...prev, categories, suggested };
    });
  }

  async function confirm() {
    const current = stateRef.current;
    if (current.step !== 'review') return;
    const { extraction, filePath, accountId, selected, acknowledgedCannotVerify, categories } =
      current;

    // Setting step to 'confirming' also stops the progressive loop: its
    // `stateRef.current.step !== 'review'` guard halts new batches and the post-await
    // guards drop any batch that resolves late.
    setStateAndRef({ step: 'confirming' });

    // Serialize the validated categories for SELECTED, non-duplicate rows only.
    const duplicateHashes = new Set(
      extraction.transactions.filter((tx) => tx.isDuplicate).map((tx) => tx.tx_hash),
    );
    const confirmCategories: ConfirmCategory[] = [];
    for (const [tx_hash, cat] of categories) {
      if (!selected.has(tx_hash) || duplicateHashes.has(tx_hash)) continue;
      confirmCategories.push({
        tx_hash,
        categoryId: cat.categoryId,
        userModified: cat.userModified,
      });
    }

    const ack = extraction.sourceType === 'ofx' ? true : acknowledgedCannotVerify;
    const res = await ipc.invoke('import:confirm', {
      path: filePath,
      accountId,
      selectedHashes: [...selected],
      acknowledgedCannotVerify: ack,
      categories: confirmCategories,
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
    pickCategory,
    confirm,
    reset,
  };
}
