-- Migration 007 — stop auto-filing inter-account movements as internal transfers.
--
-- The seeded label rules (VIR INTERNE / VIREMENT INTERNE / VERS LIVRET, seeded in
-- 006 as cr-220..cr-222) were too fragile. A transfer to a co-funded joint account
-- is legitimately a personal *expense* — the money is spent on shared life and never
-- comes back — yet a matching label silently filed it under "Transferts internes",
-- which the dashboard excludes from income/expense on BOTH accounts. The movement
-- then vanished from the figures on each side.
--
-- We drop the rules so such movements are counted per account (expense on the source,
-- income on the destination — the dashboard is already scoped per account). The
-- "Transferts internes" category itself stays, but as a *manual* tag for the rare
-- case where the user genuinely parks their own money. Automatic neutralization, when
-- we revisit it, will key off the account's nature (e.g. a savings account) rather
-- than the transaction label.

DELETE FROM categorization_rules WHERE id IN ('cr-220', 'cr-221', 'cr-222');

-- Re-open transactions those rules had auto-filed as transfers and that the user has
-- not since touched, so they count again. user_modified = 1 (an explicit user choice)
-- is preserved. category_id NULL means "non catégorisé", which the dashboard counts.
UPDATE transactions
SET category_id = NULL
WHERE category_id = 'cat-transferts' AND user_modified = 0;
