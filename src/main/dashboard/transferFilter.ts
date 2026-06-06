/** The seeded internal-transfers category. A transfer moves your own money
 *  between your accounts — it is neither income nor spending, so it is kept out
 *  of every income/expense figure. */
export const TRANSFER_CATEGORY = 'cat-transferts';

/** SQL predicate (for a WHERE/CASE clause over `transactions`) selecting rows
 *  that are NOT an internal transfer. Written affirmatively rather than NOT(...)
 *  to avoid SQLite three-valued logic when `category_id` is NULL. */
export const NOT_TRANSFER = `is_internal_transfer = 0 AND (category_id IS NULL OR category_id != '${TRANSFER_CATEGORY}')`;
