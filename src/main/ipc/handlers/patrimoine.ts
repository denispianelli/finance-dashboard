import { readFileSync } from 'node:fs';
import { dialog } from 'electron';
import type {
  LoanInput,
  ParseLoanResponse,
  UpsertAssetInput,
  UpsertAssetClassInput,
} from '@shared/types/patrimoine';
import { getDb } from '../../db';
import {
  listLoans,
  listInstallments,
  saveLoan,
  replaceLoan,
  findLoanByNumber,
  deleteLoan,
} from '../../patrimoine/loanRepo';
import { listAssets, upsertAsset, deleteAsset } from '../../patrimoine/assetRepo';
import { importLoanFromPdf } from '../../patrimoine/importLoan';
import { matchLoanPayments, unlinkPayment } from '../../patrimoine/matchPayments';
import { getAllocation } from '../../patrimoine/allocation';
import {
  listClasses,
  upsertClass,
  deleteClass,
  assignClass,
  listHoldings,
} from '../../patrimoine/assetClassRepo';

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

export function handlePatrimoineFindLoanByNumber(payload: { loanNumber: string }) {
  return { existing: findLoanByNumber(getDb(), payload.loanNumber) };
}

export function handlePatrimoineCreateLoan(payload: LoanInput): { ok: true; id: string } {
  const db = getDb();
  const id =
    payload.replaceId !== undefined
      ? replaceLoan(db, payload.replaceId, payload)
      : saveLoan(db, payload);
  return { ok: true, id };
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

export function handlePatrimoineDetectPayments(payload: { loanId: string }): { matched: number } {
  return { matched: matchLoanPayments(getDb(), payload.loanId) };
}

export function handlePatrimoineUnlinkPayment(payload: { transactionId: string }): { ok: true } {
  unlinkPayment(getDb(), payload.transactionId);
  return { ok: true };
}

export function handlePatrimoineGetAllocation() {
  return { allocation: getAllocation(getDb()) };
}

export function handlePatrimoineListClasses() {
  return { classes: listClasses(getDb()) };
}

export function handlePatrimoineListHoldings() {
  return { holdings: listHoldings(getDb()) };
}

export function handlePatrimoineUpsertClass(payload: UpsertAssetClassInput) {
  return { class: upsertClass(getDb(), payload) };
}

export function handlePatrimoineDeleteClass(payload: { id: string }): { ok: true } {
  deleteClass(getDb(), payload.id);
  return { ok: true };
}

export function handlePatrimoineAssignClass(payload: {
  kind: 'account' | 'asset' | 'loan' | 'support';
  id: string;
  classId: string | null;
}): { ok: true } {
  assignClass(getDb(), payload);
  return { ok: true };
}
