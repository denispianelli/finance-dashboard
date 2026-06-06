/** The seeded internal-transfers category. A transfer moves your own money
 *  between your accounts — it is neither income nor spending, so it is kept out
 *  of every income/expense figure. */
export const TRANSFER_CATEGORY = 'cat-transferts';

/** The refunds category. A refund is money back on a spend — it is not income,
 *  and it is *subtracted from expenses* (buy 500, get 250 back → 250 of expense),
 *  see the category-driven accounting spec. */
export const REFUND_CATEGORY = 'cat-remboursement';

/** SQL predicate selecting rows that are NOT an internal transfer (flagged or
 *  category-tagged). Written affirmatively rather than NOT(...) to avoid SQLite
 *  three-valued logic when `category_id` is NULL. */
export const NOT_TRANSFER = `is_internal_transfer = 0 AND (category_id IS NULL OR category_id != '${TRANSFER_CATEGORY}')`;

/** Rows that are not a refund. */
export const NOT_REFUND = `(category_id IS NULL OR category_id != '${REFUND_CATEGORY}')`;

/** A row that counts as **income**: a positive flow that is neither a transfer
 *  nor a refund. */
export const INCOME_ROW = `amount > 0 AND ${NOT_TRANSFER} AND ${NOT_REFUND}`;

/** A row that counts toward **expenses** (signed, ≤ 0 in aggregate): a non-transfer
 *  spend, plus refunds — which carry a positive amount and therefore reduce the
 *  expense total. */
export const EXPENSE_ROW = `${NOT_TRANSFER} AND (amount < 0 OR category_id = '${REFUND_CATEGORY}')`;

/** A row that counts toward the **net result**: anything that is not a transfer.
 *  Income, expenses and refunds all net out here, so result = income + expense. */
export const NET_ROW = NOT_TRANSFER;
