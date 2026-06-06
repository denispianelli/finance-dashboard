import type { DatabaseSync } from 'node:sqlite';

export interface RefundRow {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  label: string;
}

const MAX_DAY_GAP = 120;

function cents(amount: number): number {
  return Math.round(amount * 100);
}

function dayGap(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000));
}

function byDateThenId(a: RefundRow, b: RefundRow): number {
  return a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date);
}

/** Generic French bank-statement words that never identify a merchant. */
const STOPWORDS = new Set([
  'VIREMENT',
  'SEPA',
  'PRLV',
  'INST',
  'PERMANENT',
  'PAIEMENT',
  'CARTE',
  'RETRAIT',
  'ACHAT',
  'EUROPE',
  'FRANCE',
  'MADAME',
  'MONSIEUR',
  'MLLE',
  'RECU',
  'EMIS',
]);

/** Significant merchant tokens of a label: alphabetic words of length >= 4 that
 *  aren't generic bank vocabulary. Used to confirm two legs share a payee. */
function merchantTokens(label: string): Set<string> {
  const out = new Set<string>();
  for (const raw of label.toUpperCase().split(/[^A-ZÀ-Ÿ]+/)) {
    if (raw.length >= 4 && !STOPWORDS.has(raw)) out.add(raw);
  }
  return out;
}

function shareMerchant(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) if (b.has(t)) return true;
  return false;
}

/** A card payment ("CB MERCHANT …"). A genuine purchase refund involves a card
 *  leg; this rules out person-to-person transfers ("VIREMENT NAME") that merely
 *  share a name token and happen to offset. */
function isCardPayment(label: string): boolean {
  return /\bCB\b/.test(label.toUpperCase());
}

/**
 * Pure pairing: ids of transactions that are part of a refund — a charge cancelled
 * by a credit on the SAME account, exact opposite amount, within +/-120 days, and
 * SHARING a significant merchant token (so PayPal / fee-rebate washes pair, but an
 * unrelated gift of +50 and a -50 purchase do not). Greedy and one-to-one.
 */
export function findRefundPairs(rows: RefundRow[]): Set<string> {
  const byAccount = new Map<string, RefundRow[]>();
  for (const r of rows) {
    if (r.label === '') continue;
    const g = byAccount.get(r.accountId);
    if (g === undefined) byAccount.set(r.accountId, [r]);
    else g.push(r);
  }

  const tokensOf = new Map<string, Set<string>>();
  const tok = (r: RefundRow): Set<string> => {
    let t = tokensOf.get(r.id);
    if (t === undefined) {
      t = merchantTokens(r.label);
      tokensOf.set(r.id, t);
    }
    return t;
  };

  const result = new Set<string>();
  for (const items of byAccount.values()) {
    const outflows = items.filter((r) => r.amount < 0).sort(byDateThenId);
    const inflows = items.filter((r) => r.amount > 0).sort(byDateThenId);
    const used = new Set<string>();
    for (const out of outflows) {
      let best: RefundRow | undefined;
      let bestKey: readonly [number, string, string] | undefined;
      for (const inf of inflows) {
        if (used.has(inf.id)) continue;
        if (cents(inf.amount) !== -cents(out.amount)) continue;
        const gap = dayGap(out.date, inf.date);
        if (gap > MAX_DAY_GAP) continue;
        if (!isCardPayment(out.label) && !isCardPayment(inf.label)) continue;
        if (!shareMerchant(tok(out), tok(inf))) continue;
        const key = [gap, inf.date, inf.id] as const;
        if (
          bestKey === undefined ||
          key[0] < bestKey[0] ||
          (key[0] === bestKey[0] && key[1] < bestKey[1]) ||
          (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2])
        ) {
          best = inf;
          bestKey = key;
        }
      }
      if (best !== undefined) {
        used.add(best.id);
        result.add(best.id);
        result.add(out.id);
      }
    }
  }
  return result;
}

/**
 * Detection pass: reset auto-marked refunds (is_refund=1 AND user_modified=0),
 * re-pair the candidate set, and flag both legs `is_refund = 1`. Never touches
 * `user_modified = 1` rows. Idempotent.
 */
export function detectRefunds(db: DatabaseSync): { paired: number } {
  db.exec('BEGIN');
  try {
    db.exec('UPDATE transactions SET is_refund = 0 WHERE is_refund = 1 AND user_modified = 0');
    const rows = db
      .prepare(
        'SELECT id, account_id AS accountId, date, amount, label_clean AS label FROM transactions WHERE user_modified = 0',
      )
      .all() as unknown as RefundRow[];
    const ids = findRefundPairs(rows);
    const mark = db.prepare('UPDATE transactions SET is_refund = 1 WHERE id = ?');
    for (const id of ids) mark.run(id);
    db.exec('COMMIT');
    return { paired: ids.size };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
