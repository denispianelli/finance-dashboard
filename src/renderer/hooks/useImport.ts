import { useCallback, useRef, useState } from 'react';
import type { StatementExtraction, ReviewTransaction } from '@shared/types/import';
import type { ConfirmCategory } from '@shared/types/ipc';
import { ipc } from '@renderer/ipc/client';

const VALID_EXT = ['pdf', 'csv', 'ofx'];

/** Per-row category state in Review (deterministic seed or LLM/user overlay). */
export interface ReviewCategory {
  categoryId: string | null;
  userModified: boolean;
}

/** Residual batch size for the progressive LLM categorization loop. */
const LLM_BATCH_SIZE = 12;

export interface QueuedFile {
  path: string;
  fileName: string;
}

export type FileResult =
  | {
      fileName: string;
      status: 'imported';
      accountId: string;
      insertedCount: number;
      autoRouted: boolean;
    }
  | { fileName: string; status: 'skipped'; reason: string }
  | { fileName: string; status: 'failed'; error: string };

export type SubState =
  | { step: 'resolving' }
  | {
      step: 'chooseAccount';
      identifier: string | null;
      detectedBank: string | null;
      sourceType: 'ofx' | 'pdf';
    }
  | { step: 'extracting' }
  | { step: 'unknownBank'; accountId: string }
  | { step: 'learning'; accountId: string }
  | {
      step: 'review';
      extraction: StatementExtraction;
      accountId: string;
      selected: Set<string>;
      acknowledgedCannotVerify: boolean;
      autoRouted: boolean;
      categories: Map<string, ReviewCategory>;
      pending: Set<string>; // tx_hash whose batch is in flight → "IA…"
      suggested: Set<string>; // tx_hash the LLM filled → "IA" badge until touched
    }
  | { step: 'confirming' }
  | { step: 'fileError'; message: string };

type ReviewSub = Extract<SubState, { step: 'review' }>;

export type ImportState =
  | { step: 'idle' }
  | { step: 'queue'; files: QueuedFile[]; index: number; results: FileResult[]; sub: SubState }
  | { step: 'summary'; results: FileResult[] };

export interface UseImport {
  state: ImportState;
  pickFiles: () => Promise<void>;
  startFromPaths: (paths: string[]) => Promise<void>;
  chooseAccount: (accountId: string) => Promise<void>;
  learnBank: (bankName: string) => Promise<void>;
  toggleTx: (txHash: string) => void;
  toggleAll: () => void;
  setAcknowledgedCannotVerify: (value: boolean) => void;
  pickCategory: (txHash: string, categoryId: string | null) => void;
  confirm: () => Promise<void>;
  skipFile: () => void;
  reset: () => void;
}

const ERROR_MESSAGES: Partial<Record<string, string>> = {
  unsupported_format: 'Format non reconnu. Utilisez un fichier OFX ou PDF.',
  malformed_ofx: 'Fichier OFX invalide ou corrompu.',
  not_pdf: 'Le fichier ne semble pas être un PDF valide.',
  no_text: 'Ce PDF ne contient pas de texte extractible (scan image ?).',
  arithmetic_failed: 'Le solde ne correspond pas aux transactions. Import bloqué.',
  cannot_verify_unacknowledged: 'Vérification du solde non confirmée.',
  already_imported: 'Déjà importé — rien de nouveau.',
  model_unavailable: "Modèle IA non installé — impossible d'analyser une nouvelle banque.",
  inference_failed: "L'IA n'a pas réussi à lire la structure de ce relevé.",
};

function fileNameOf(path: string): string {
  return path.split('/').pop() ?? path;
}

/** Split an array into fixed-size chunks (last chunk may be shorter). */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Remove a batch's hashes from a Review sub-state's `pending` set. */
function clearPending(sub: ReviewSub, batchHashes: readonly string[]): ReviewSub {
  const pending = new Set(sub.pending);
  for (const h of batchHashes) pending.delete(h);
  return { ...sub, pending };
}

// Returns the IPC response, or null if the call rejected (main threw
// unexpectedly). A rejection isolates to the current file rather than
// wedging the whole batch.
async function safeInvoke<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

const UNEXPECTED_ERROR = 'Erreur inattendue';

export function useImport(): UseImport {
  const [state, setState] = useState<ImportState>({ step: 'idle' });
  const stateRef = useRef<ImportState>(state);

  function setS(next: ImportState): void {
    stateRef.current = next;
    setState(next);
  }

  function updateSub(
    updater: (prev: Extract<ImportState, { step: 'queue' }>) => ImportState,
  ): void {
    setState((prev) => {
      if (prev.step !== 'queue') return prev;
      const resolved = updater(prev);
      stateRef.current = resolved;
      return resolved;
    });
  }

  /** True while the queue is still paused on `index`'s Review (the loop's guard). */
  function isReviewing(index: number): boolean {
    const s = stateRef.current;
    return s.step === 'queue' && s.index === index && s.sub.step === 'review';
  }

  /** Apply a Review-only update to file `index`, but only if the queue is still
   *  on that file's Review — so a late categorize batch never mutates another
   *  file or a confirmed one. */
  function updateReviewAt(index: number, updater: (sub: ReviewSub) => ReviewSub): void {
    setState((prev) => {
      if (prev.step !== 'queue' || prev.index !== index || prev.sub.step !== 'review') return prev;
      const next = { ...prev, sub: updater(prev.sub) };
      stateRef.current = next;
      return next;
    });
  }

  async function advance(files: QueuedFile[], index: number, results: FileResult[]): Promise<void> {
    const next = index + 1;
    if (next >= files.length) {
      setS({ step: 'summary', results });
      return;
    }
    await resolveAt(files, next, results);
  }

  async function resolveAt(
    files: QueuedFile[],
    index: number,
    results: FileResult[],
  ): Promise<void> {
    const file = files[index];
    if (file === undefined) return;
    setS({ step: 'queue', files, index, results, sub: { step: 'resolving' } });
    const res = await safeInvoke(ipc.invoke('import:resolveAccount', { path: file.path }));
    if (res === null) {
      await advance(files, index, [
        ...results,
        { fileName: file.fileName, status: 'failed', error: UNEXPECTED_ERROR },
      ]);
      return;
    }
    if (!res.ok) {
      await advance(files, index, [
        ...results,
        {
          fileName: file.fileName,
          status: 'failed',
          error: ERROR_MESSAGES[res.error] ?? res.error,
        },
      ]);
      return;
    }
    if (res.matchedAccountId !== null) {
      await runExtract(files, index, results, res.matchedAccountId, true);
      return;
    }
    setS({
      step: 'queue',
      files,
      index,
      results,
      sub: {
        step: 'chooseAccount',
        identifier: res.identifier,
        detectedBank: res.detectedBank,
        sourceType: res.sourceType,
      },
    });
  }

  async function runExtract(
    files: QueuedFile[],
    index: number,
    results: FileResult[],
    accountId: string,
    autoRouted: boolean,
  ): Promise<void> {
    const file = files[index];
    if (file === undefined) return;
    setS({ step: 'queue', files, index, results, sub: { step: 'extracting' } });
    const res = await safeInvoke(ipc.invoke('import:extract', { path: file.path, accountId }));
    if (res === null) {
      await advance(files, index, [
        ...results,
        { fileName: file.fileName, status: 'failed', error: UNEXPECTED_ERROR },
      ]);
      return;
    }
    if (!res.ok) {
      if (res.error === 'unknown_bank') {
        setS({ step: 'queue', files, index, results, sub: { step: 'unknownBank', accountId } });
        return;
      }
      await advance(files, index, [
        ...results,
        {
          fileName: file.fileName,
          status: 'failed',
          error: ERROR_MESSAGES[res.error] ?? res.error,
        },
      ]);
      return;
    }
    const selected = new Set(
      res.extraction.transactions.filter((tx) => !tx.isDuplicate).map((tx) => tx.tx_hash),
    );
    // Seed each non-duplicate row with its deterministic category; the LLM loop
    // fills the residual (tier null) rows progressively below.
    const categories = new Map<string, ReviewCategory>();
    for (const tx of res.extraction.transactions) {
      if (tx.isDuplicate) continue;
      categories.set(tx.tx_hash, { categoryId: tx.categoryId, userModified: false });
    }
    setS({
      step: 'queue',
      files,
      index,
      results,
      sub: {
        step: 'review',
        extraction: res.extraction,
        accountId,
        selected,
        acknowledgedCannotVerify: false,
        autoRouted,
        categories,
        pending: new Set<string>(),
        suggested: new Set<string>(),
      },
    });
    // Fire-and-forget the progressive LLM fill for THIS file. It reads stateRef
    // to stop early (the queue leaving this file's Review); late results are
    // dropped by `updateReviewAt`'s same-file guard.
    void runCategorizeLoop(index, res.extraction.transactions);
  }

  /**
   * Best-effort progressive categorization of file `index`'s residual rows.
   * Cancellation is "drop late results", not a hard abort: the queue advancing
   * past this file's Review makes `isReviewing(index)` false, so new batches
   * stop and resolved batches no-op.
   */
  async function runCategorizeLoop(
    index: number,
    transactions: readonly ReviewTransaction[],
  ): Promise<void> {
    const residual = transactions.filter((t) => !t.isDuplicate && t.tier === null);

    for (const batch of chunk(residual, LLM_BATCH_SIZE)) {
      if (!isReviewing(index)) break;

      const batchHashes = batch.map((t) => t.tx_hash);
      updateReviewAt(index, (sub) => {
        const pending = new Set(sub.pending);
        for (const h of batchHashes) pending.add(h);
        return { ...sub, pending };
      });

      const res = await safeInvoke(
        ipc.invoke('import:categorize', {
          items: batch.map((t) => ({ tx_hash: t.tx_hash, label: t.label })),
        }),
      );

      // Unexpected rejection or no model installed → clear this batch and stop.
      if (res === null || (!res.ok && res.error === 'model_unavailable')) {
        updateReviewAt(index, (sub) => clearPending(sub, batchHashes));
        break;
      }

      updateReviewAt(index, (sub) => {
        if (!res.ok) return clearPending(sub, batchHashes); // inference_failed → stays residual
        const categories = new Map(sub.categories);
        const suggested = new Set(sub.suggested);
        for (const r of res.results) {
          if (r.categoryId === null) continue;
          const existing = categories.get(r.tx_hash);
          // Never overwrite a row the user already set.
          if (existing?.userModified === true) continue;
          categories.set(r.tx_hash, { categoryId: r.categoryId, userModified: false });
          suggested.add(r.tx_hash);
        }
        return { ...clearPending(sub, batchHashes), categories, suggested };
      });
    }
  }

  async function startFromPaths(paths: string[]): Promise<void> {
    const valid: QueuedFile[] = [];
    const failed: FileResult[] = [];
    for (const path of paths) {
      const ext = path.toLowerCase().split('.').pop();
      if (ext !== undefined && VALID_EXT.includes(ext)) {
        valid.push({ path, fileName: fileNameOf(path) });
      } else {
        failed.push({ fileName: fileNameOf(path), status: 'failed', error: 'Format non supporté' });
      }
    }
    if (valid.length === 0) {
      setS({ step: 'summary', results: failed });
      return;
    }
    await resolveAt(valid, 0, failed);
  }

  async function pickFiles(): Promise<void> {
    const res = await ipc.invoke('import:pickFile', {});
    if (res.cancelled) {
      setS({ step: 'idle' });
      return;
    }
    await startFromPaths(res.paths);
  }

  async function chooseAccount(accountId: string): Promise<void> {
    const cur = stateRef.current;
    if (cur.step !== 'queue' || cur.sub.step !== 'chooseAccount') return;
    await runExtract(cur.files, cur.index, cur.results, accountId, false);
  }

  async function learnBank(bankName: string): Promise<void> {
    const cur = stateRef.current;
    if (cur.step !== 'queue' || cur.sub.step !== 'unknownBank') return;
    const { accountId } = cur.sub;
    const file = cur.files[cur.index];
    if (file === undefined) return;
    setS({ ...cur, sub: { step: 'learning', accountId } });
    const res = await safeInvoke(ipc.invoke('banks:learn', { path: file.path, bankName }));
    if (res?.ok) {
      await runExtract(cur.files, cur.index, cur.results, accountId, false);
    } else {
      await advance(cur.files, cur.index, [
        ...cur.results,
        {
          fileName: file.fileName,
          status: 'failed',
          error: res === null ? UNEXPECTED_ERROR : (ERROR_MESSAGES[res.error] ?? res.error),
        },
      ]);
    }
  }

  function toggleTx(txHash: string): void {
    updateSub((prev) => {
      if (prev.sub.step !== 'review') return prev;
      const next = new Set(prev.sub.selected);
      if (next.has(txHash)) next.delete(txHash);
      else next.add(txHash);
      return { ...prev, sub: { ...prev.sub, selected: next } };
    });
  }

  function toggleAll(): void {
    updateSub((prev) => {
      if (prev.sub.step !== 'review') return prev;
      const hashes = prev.sub.extraction.transactions
        .filter((tx) => !tx.isDuplicate)
        .map((tx) => tx.tx_hash);
      const allSelected = hashes.every(
        (h) => prev.sub.step === 'review' && prev.sub.selected.has(h),
      );
      return {
        ...prev,
        sub: { ...prev.sub, selected: allSelected ? new Set<string>() : new Set(hashes) },
      };
    });
  }

  function setAcknowledgedCannotVerify(value: boolean): void {
    updateSub((prev) => {
      if (prev.sub.step !== 'review') return prev;
      return { ...prev, sub: { ...prev.sub, acknowledgedCannotVerify: value } };
    });
  }

  function pickCategory(txHash: string, categoryId: string | null): void {
    updateSub((prev) => {
      if (prev.sub.step !== 'review') return prev;
      const categories = new Map(prev.sub.categories);
      categories.set(txHash, { categoryId, userModified: true });
      const suggested = new Set(prev.sub.suggested);
      suggested.delete(txHash);
      return { ...prev, sub: { ...prev.sub, categories, suggested } };
    });
  }

  async function confirm(): Promise<void> {
    const cur = stateRef.current;
    if (cur.step !== 'queue' || cur.sub.step !== 'review') return;
    const { extraction, accountId, selected, acknowledgedCannotVerify, autoRouted, categories } =
      cur.sub;
    const file = cur.files[cur.index];
    if (file === undefined) return;
    // Setting 'confirming' also stops this file's progressive loop (its
    // isReviewing guard turns false; late batches no-op via updateReviewAt).
    setS({ ...cur, sub: { step: 'confirming' } });
    const ack = extraction.sourceType === 'ofx' ? true : acknowledgedCannotVerify;

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

    const res = await safeInvoke(
      ipc.invoke('import:confirm', {
        path: file.path,
        accountId,
        selectedHashes: [...selected],
        acknowledgedCannotVerify: ack,
        categories: confirmCategories,
      }),
    );
    if (res === null) {
      await advance(cur.files, cur.index, [
        ...cur.results,
        { fileName: file.fileName, status: 'failed', error: UNEXPECTED_ERROR },
      ]);
    } else if (res.ok) {
      await advance(cur.files, cur.index, [
        ...cur.results,
        {
          fileName: file.fileName,
          status: 'imported',
          accountId,
          insertedCount: res.insertedCount,
          autoRouted,
        },
      ]);
    } else if (res.error === 'already_imported') {
      await advance(cur.files, cur.index, [
        ...cur.results,
        {
          fileName: file.fileName,
          status: 'skipped',
          reason: ERROR_MESSAGES.already_imported ?? '',
        },
      ]);
    } else {
      setS({ ...cur, sub: { step: 'fileError', message: ERROR_MESSAGES[res.error] ?? res.error } });
    }
  }

  function skipFile(): void {
    const cur = stateRef.current;
    if (cur.step !== 'queue') return;
    const file = cur.files[cur.index];
    if (file === undefined) return;
    void advance(cur.files, cur.index, [
      ...cur.results,
      { fileName: file.fileName, status: 'skipped', reason: 'Ignoré' },
    ]);
  }

  const reset = useCallback((): void => {
    const next: ImportState = { step: 'idle' };
    stateRef.current = next;
    setState(next);
  }, []);

  return {
    state,
    pickFiles,
    startFromPaths,
    chooseAccount,
    learnBank,
    toggleTx,
    toggleAll,
    setAcknowledgedCannotVerify,
    pickCategory,
    confirm,
    skipFile,
    reset,
  };
}
