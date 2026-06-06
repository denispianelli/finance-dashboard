import { describe, it, expect, afterEach, vi } from 'vitest';

const db = { __fake: true };
vi.mock('../../../src/main/db', () => ({ getDb: () => db }));

const account = {
  id: 'av',
  name: 'AV',
  type: 'life_insurance',
  bankId: null,
  currency: 'EUR',
  balance: 15000,
  balanceSource: 'declared' as const,
  txCount: 0,
};
const setDeclaredBalance = vi.fn<(db: unknown, input: unknown) => typeof account>(() => account);
vi.mock('../../../src/main/accounts/manage', () => ({
  setDeclaredBalance: (dbArg: unknown, input: unknown) => setDeclaredBalance(dbArg, input),
}));

import { handleAccountsSetDeclaredBalance } from '../../../src/main/ipc/handlers/accountsDeclaredBalance';

afterEach(() => {
  vi.clearAllMocks();
});

describe('accounts:setDeclaredBalance handler', () => {
  it('forwards the payload and returns the updated account', () => {
    const res = handleAccountsSetDeclaredBalance({ id: 'av', balance: 15000 });
    expect(setDeclaredBalance).toHaveBeenCalledWith(db, { id: 'av', balance: 15000 });
    expect(res).toEqual({ account });
  });
});
