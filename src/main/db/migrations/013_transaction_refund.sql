-- A refund is a credit that cancels an earlier (or later) charge from the SAME
-- merchant on the SAME account (e.g. −111,40 then +111,40 Ticketmaster). Like an
-- internal transfer, it is neither income nor spending and must be kept out of
-- the revenue/expense figures. Detected by pairing (see ADR-016 sibling pass).
ALTER TABLE transactions ADD COLUMN is_refund INTEGER NOT NULL DEFAULT 0;
