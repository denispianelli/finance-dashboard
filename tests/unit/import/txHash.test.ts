import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { computeTxHash, assignTxHashes, normalizeLabel } from '../../../src/main/import/txHash';
import type { NormalizedTx } from '@shared/types/import';

describe('computeTxHash — discriminated identity contract', () => {
  it('OFX hash depends only on accountId + fitid', () => {
    const a = computeTxHash({ kind: 'ofx', accountId: 'acc-1', fitid: 'F1' });
    const b = computeTxHash({ kind: 'ofx', accountId: 'acc-1', fitid: 'F1' });
    const c = computeTxHash({ kind: 'ofx', accountId: 'acc-1', fitid: 'F2' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('PDF hash is unchanged from the legacy formula', () => {
    // Legacy: sha256(accountId|date|amount.toFixed(2)|normalizeLabel(label)|order)
    const h = computeTxHash({
      kind: 'pdf',
      accountId: 'acc-1',
      date: '2026-02-03',
      amount: -42.5,
      label: 'Café',
      order: 0,
    });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    // Stable snapshot of the legacy contract:
    const input = ['acc-1', '2026-02-03', '-42.50', normalizeLabel('Café'), '0'].join('|');
    const expected = createHash('sha256').update(input).digest('hex');
    expect(h).toBe(expected);
  });

  it('assignTxHashes uses fitid when present, order counter otherwise', () => {
    const txs: NormalizedTx[] = [
      { date: '2026-02-03', label: 'X', amount: -1, fitid: 'A' },
      { date: '2026-02-03', label: 'DUP', amount: -2, fitid: null },
      { date: '2026-02-03', label: 'DUP', amount: -2, fitid: null },
    ];
    const out = assignTxHashes('acc-1', txs);
    expect(out[0]?.tx_hash).toBe(computeTxHash({ kind: 'ofx', accountId: 'acc-1', fitid: 'A' }));
    expect(out[1]?.tx_hash).not.toBe(out[2]?.tx_hash); // order counter disambiguates
  });
});
