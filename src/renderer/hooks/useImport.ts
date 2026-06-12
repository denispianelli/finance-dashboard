import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { StatementExtraction } from '@shared/types/import';
import type { ColumnOrder } from '@shared/types/bank';
import { ipc } from '@renderer/ipc/client';

const VALID_EXT = ['pdf', 'ofx'];

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
  | {
      step: 'unknownBank';
      accountId: string;
      suggested: ColumnOrder | null;
      headerTokens: string[];
      mappingError: boolean;
    }
  | {
      step: 'review';
      extraction: StatementExtraction;
      accountId: string;
      selected: Set<string>;
      acknowledgedCannotVerify: boolean;
      acknowledgedArithmeticFailed: boolean;
      autoRouted: boolean;
    }
  | { step: 'confirming' }
  | { step: 'fileError'; message: string };

export type ImportState =
  | { step: 'idle' }
  | { step: 'queue'; files: QueuedFile[]; index: number; results: FileResult[]; sub: SubState }
  | { step: 'summary'; results: FileResult[] };

export interface UseImport {
  state: ImportState;
  pickFiles: () => Promise<void>;
  startFromPaths: (paths: string[]) => Promise<void>;
  chooseAccount: (accountId: string) => Promise<void>;
  learnBank: (bankName: string, order: ColumnOrder) => Promise<void>;
  toggleTx: (txHash: string) => void;
  toggleAll: () => void;
  setAcknowledgedCannotVerify: (value: boolean) => void;
  setAcknowledgedArithmeticFailed: (value: boolean) => void;
  confirm: () => Promise<void>;
  skipFile: () => void;
  reset: () => void;
}

const ERROR_MESSAGES: Partial<Record<string, string>> = {
  unsupported_format: 'Format non reconnu. Utilisez un fichier OFX ou PDF.',
  malformed_ofx: 'Fichier OFX invalide ou corrompu.',
  not_pdf: 'Le fichier ne semble pas être un PDF valide.',
  no_text: 'Ce PDF ne contient pas de texte extractible (scan image ?).',
  arithmetic_failed_unacknowledged:
    'Le solde ne correspond pas aux transactions. Import non confirmé.',
  cannot_verify_unacknowledged: 'Vérification du solde non confirmée.',
  invalid_mapping: "Colonnes introuvables avec ce mapping — vérifie l'ordre.",
};

function fileNameOf(path: string): string {
  return path.split('/').pop() ?? path;
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
        const prep = await safeInvoke(ipc.invoke('banks:prepareMapping', { path: file.path }));
        if (!prep?.ok) {
          // Unreadable as a PDF here means it will not be learnable either:
          // surface the standard file error and move on.
          const message =
            prep === null ? UNEXPECTED_ERROR : (ERROR_MESSAGES[prep.error] ?? prep.error);
          setS({ step: 'queue', files, index, results, sub: { step: 'fileError', message } });
          return;
        }
        setS({
          step: 'queue',
          files,
          index,
          results,
          sub: {
            step: 'unknownBank',
            accountId,
            suggested: prep.suggested,
            headerTokens: prep.headerTokens,
            mappingError: false,
          },
        });
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
        acknowledgedArithmeticFailed: false,
        autoRouted,
      },
    });
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

  async function learnBank(bankName: string, order: ColumnOrder): Promise<void> {
    const cur = stateRef.current;
    if (cur.step !== 'queue' || cur.sub.step !== 'unknownBank') return;
    const { accountId, suggested, headerTokens } = cur.sub;
    const file = cur.files[cur.index];
    if (file === undefined) return;
    const res = await safeInvoke(ipc.invoke('banks:learn', { path: file.path, bankName, order }));
    if (res?.ok) {
      await runExtract(cur.files, cur.index, cur.results, accountId, false);
    } else if (res === null) {
      await advance(cur.files, cur.index, [
        ...cur.results,
        { fileName: file.fileName, status: 'failed', error: UNEXPECTED_ERROR },
      ]);
    } else if (res.error === 'invalid_mapping') {
      setS({
        ...cur,
        sub: { step: 'unknownBank', accountId, suggested, headerTokens, mappingError: true },
      });
    } else {
      await advance(cur.files, cur.index, [
        ...cur.results,
        {
          fileName: file.fileName,
          status: 'failed',
          error: ERROR_MESSAGES[res.error] ?? res.error,
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

  function setAcknowledgedArithmeticFailed(value: boolean): void {
    updateSub((prev) => {
      if (prev.sub.step !== 'review') return prev;
      return { ...prev, sub: { ...prev.sub, acknowledgedArithmeticFailed: value } };
    });
  }

  async function confirm(): Promise<void> {
    const cur = stateRef.current;
    if (cur.step !== 'queue' || cur.sub.step !== 'review') return;
    const {
      extraction,
      accountId,
      selected,
      acknowledgedCannotVerify,
      acknowledgedArithmeticFailed,
      autoRouted,
    } = cur.sub;
    const file = cur.files[cur.index];
    if (file === undefined) return;
    setS({ ...cur, sub: { step: 'confirming' } });
    const ack = extraction.sourceType === 'ofx' ? true : acknowledgedCannotVerify;
    const res = await safeInvoke(
      ipc.invoke('import:confirm', {
        path: file.path,
        accountId,
        selectedHashes: [...selected],
        acknowledgedCannotVerify: ack,
        acknowledgedArithmeticFailed,
      }),
    );
    if (res === null) {
      await advance(cur.files, cur.index, [
        ...cur.results,
        { fileName: file.fileName, status: 'failed', error: UNEXPECTED_ERROR },
      ]);
    } else if (res.ok) {
      if (res.preImportBackupFailed === true) {
        toast.warning('Sauvegarde pré-import échouée — import effectué quand même.');
      }
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
    setAcknowledgedArithmeticFailed,
    confirm,
    skipFile,
    reset,
  };
}
