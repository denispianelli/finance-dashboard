import { it, expect, vi, beforeEach } from 'vitest';

const ctl = vi.hoisted(() => ({
  getStatus: vi.fn(),
  subscribe: vi.fn(),
  start: vi.fn(),
  cancel: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('../../../src/main/llm/modelController', () => ({ modelController: ctl }));
vi.mock('../../../src/main/settings/settings', () => ({
  getCategorizeOptOut: vi.fn(() => false),
  setCategorizeOptOut: vi.fn(),
}));

import {
  handleModelStatus,
  handleModelDownloadStart,
  handleModelRemove,
  handleGetCategorizeOptOut,
  handleSetCategorizeOptOut,
} from '../../../src/main/ipc/handlers/model';
import { setCategorizeOptOut } from '../../../src/main/settings/settings';

beforeEach(() => vi.clearAllMocks());

it('returns the controller status', () => {
  ctl.getStatus.mockReturnValue({ state: 'absent' });
  expect(handleModelStatus()).toEqual({ state: 'absent' });
});

it('starts the download', async () => {
  ctl.start.mockResolvedValue(undefined);
  expect(await handleModelDownloadStart()).toEqual({ ok: true });
  expect(ctl.start).toHaveBeenCalledOnce();
});

it('removes the model', async () => {
  ctl.remove.mockResolvedValue(undefined);
  expect(await handleModelRemove()).toEqual({ ok: true });
  expect(ctl.remove).toHaveBeenCalledOnce();
});

it('reads and writes the opt-out', () => {
  expect(handleGetCategorizeOptOut()).toEqual({ value: false });
  expect(handleSetCategorizeOptOut({ value: true })).toEqual({ ok: true });
  expect(setCategorizeOptOut).toHaveBeenCalledWith(true);
});
