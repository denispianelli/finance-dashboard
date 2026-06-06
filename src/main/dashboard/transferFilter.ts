/** The seeded internal-transfers category. A transfer moves your own money
 *  between your accounts — it is neither income nor spending, so it is kept out
 *  of every income/expense figure. */
export const TRANSFER_CATEGORY = 'cat-transferts';

/** SQL predicate (for a WHERE/CASE clause over `transactions`) selecting rows
 *  that are NOT an internal transfer. Written affirmatively rather than NOT(...)
 *  to avoid SQLite three-valued logic when `category_id` is NULL. */
export const NOT_TRANSFER = `is_internal_transfer = 0 AND (category_id IS NULL OR category_id != '${TRANSFER_CATEGORY}')`;

/** Rows that are not a detected refund (a charge cancelled by a same-merchant credit). */
export const NOT_REFUND = 'is_refund = 0';

/** A *real* income/expense flow: neither an internal transfer nor a refund. Use
 *  this for every revenue/expense aggregate so transfers and refunds are excluded. */
export const COUNTABLE = `${NOT_TRANSFER} AND ${NOT_REFUND}`;
