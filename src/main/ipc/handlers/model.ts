import type { ModelStatusResponse } from '@shared/types/ipc';
import { modelController } from '../../llm/modelController';
import { getCategorizeOptOut, setCategorizeOptOut } from '../../settings/settings';

export function handleModelStatus(): ModelStatusResponse {
  return modelController.getStatus();
}

export async function handleModelDownloadStart(): Promise<{ ok: true }> {
  await modelController.start();
  return { ok: true };
}

export function handleModelDownloadCancel(): { ok: true } {
  modelController.cancel();
  return { ok: true };
}

export async function handleModelRemove(): Promise<{ ok: true }> {
  await modelController.remove();
  return { ok: true };
}

export function handleGetCategorizeOptOut(): { value: boolean } {
  return { value: getCategorizeOptOut() };
}

export function handleSetCategorizeOptOut(payload: { value: boolean }): { ok: true } {
  setCategorizeOptOut(payload.value);
  return { ok: true };
}
