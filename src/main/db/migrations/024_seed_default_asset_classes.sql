-- Seed a default set of asset classes so the allocation view is usable out of the
-- box (no empty "assign" dropdown). INSERT OR IGNORE keeps it idempotent and never
-- clobbers a class the user already created/renamed at the same id. The user can
-- rename, delete, or set targets on these freely; deleting one drops its holdings
-- to « Non classé » (ON DELETE SET NULL), not an error.
INSERT OR IGNORE INTO asset_classes (id, name, color, target_pct, sort_order) VALUES
  ('cls-liquidites',  'Liquidités',           '#8B8775', NULL, 0),
  ('cls-actions',     'Actions',              '#D4B062', NULL, 1),
  ('cls-obligations', 'Obligations / Fonds €', '#C58B5C', NULL, 2),
  ('cls-immobilier',  'Immobilier',           '#7C9A8E', NULL, 3),
  ('cls-autres',      'Autres',               '#6E8FA6', NULL, 4);
