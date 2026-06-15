-- Phase B price feed: cache the resolved EUR exchange ticker per support so a refresh only
-- needs the quote host. `support_valuations.source` (migration 027) gains a third value
-- 'quote' written by the feed; no schema change needed for that.
ALTER TABLE investment_supports ADD COLUMN quote_symbol TEXT;
