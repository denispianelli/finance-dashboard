import { readFileSync } from 'node:fs';
import { dialog } from 'electron';
import type { LoanInput, ParseLoanResponse, UpsertAssetInput } from '@shared/types/patrimoine';
import { getDb } from '../../db';
import { listLoans, listInstallments, saveLoan, deleteLoan } from '../../patrimoine/loanRepo';
import { listAssets, upsertAsset, deleteAsset } from '../../patrimoine/assetRepo';
import { importLoanFromPdf } from '../../patrimoine/importLoan';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

export function handlePatrimoineListLoans() {
  return { loans: listLoans(getDb(), todayIso()) };
}

export function handlePatrimoineListInstallments(payload: { loanId: string }) {
  return { installments: listInstallments(getDb(), payload.loanId) };
}

export async function handlePatrimoinePickLoanFile(): Promise<
  { cancelled: true } | { cancelled: false; path: string }
> {
  const result = await dialog.showOpenDialog({
    title: "Sélectionner le tableau d'amortissement (PDF)",
    properties: ['openFile'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { cancelled: true };
  return { cancelled: false, path: result.filePaths[0] ?? '' };
}

export async function handlePatrimoineParseLoanFile(payload: {
  path: string;
}): Promise<ParseLoanResponse> {
  return importLoanFromPdf(readFileSync(payload.path));
}

export function handlePatrimoineCreateLoan(payload: LoanInput): { ok: true; id: string } {
  return { ok: true, id: saveLoan(getDb(), payload) };
}

export function handlePatrimoineDeleteLoan(payload: { id: string }): { ok: true } {
  deleteLoan(getDb(), payload.id);
  return { ok: true };
}

export function handlePatrimoineListAssets() {
  return { assets: listAssets(getDb()) };
}

export function handlePatrimoineUpsertAsset(payload: UpsertAssetInput) {
  return { asset: upsertAsset(getDb(), payload) };
}

export function handlePatrimoineDeleteAsset(payload: { id: string }): { ok: true } {
  deleteAsset(getDb(), payload.id);
  return { ok: true };
}
