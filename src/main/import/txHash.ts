import { createHash } from 'node:crypto';

export function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeTxHash(
  accountId: string,
  date: string,
  amount: number,
  labelRaw: string,
  orderInImport: number,
): string {
  const input = [
    accountId,
    date,
    amount.toFixed(2),
    normalizeLabel(labelRaw),
    String(orderInImport),
  ].join('|');
  return createHash('sha256').update(input).digest('hex');
}
