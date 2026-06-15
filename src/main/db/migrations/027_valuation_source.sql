-- Distinguish user-declared valuations from system-inserted sentinels (the 0-valuations
-- the CSV import adds at a position's open/close). TTWROR is only meaningful over real
-- declared valuations; the auto sentinels must not drive the time-weighted return (they
-- would make it explode for an operations-only support with no real interim values).
ALTER TABLE support_valuations ADD COLUMN source TEXT NOT NULL DEFAULT 'declared';
