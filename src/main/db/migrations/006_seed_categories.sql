-- Migration 006 — seed a lean set of default categories (+ internal transfers)
-- and a starter set of deterministic `contains` rules (design §7).
--
-- Kept deliberately small (10): enough to make a first import meaningful without
-- overwhelming the user. Niche categories (Voyages, Éducation, Vêtements,
-- Professionnel, Frais bancaires, "À catégoriser") were dropped — users add what
-- they need via the Catégories page, and unmatched transactions stay NULL
-- ("non catégorisé").
--
-- Rules match against the NORMALIZED label (label_clean: accents stripped,
-- uppercased, whitespace collapsed). match_value is stored in that same form.
-- Rule precedence is creation order (rowid); more specific rules come first
-- (e.g. "UBER EATS" before "UBER").

INSERT INTO categories (id, parent_id, name, icon, color, is_default, position) VALUES
  ('cat-logement',     NULL, 'Logement',              'home',     '#8AA8C7', 1, 1),
  ('cat-energie',      NULL, 'Énergie & internet',    'plug',     '#6FA8B5', 1, 2),
  ('cat-alimentation', NULL, 'Alimentation',          'shop',     '#7AB890', 1, 3),
  ('cat-restaurants',  NULL, 'Restaurants & sorties', 'utensils', '#E0936A', 1, 4),
  ('cat-transport',    NULL, 'Transport',             'car',      '#6E9BC4', 1, 5),
  ('cat-sante',        NULL, 'Santé',                 'health',   '#E07365', 1, 6),
  ('cat-loisirs',      NULL, 'Loisirs & culture',     'leisure',  '#8D7DC4', 1, 7),
  ('cat-abonnements',  NULL, 'Abonnements',           'tv',       '#A07DC4', 1, 8),
  ('cat-revenus',      NULL, 'Revenus',               'incoming', '#6FA582', 1, 9),
  ('cat-transferts',   NULL, 'Transferts internes',   'transfer', '#6E6E78', 1, 10);

INSERT INTO categorization_rules (id, match_type, match_value, category_id) VALUES
  -- Abonnements (streaming / SaaS)
  ('cr-001', 'contains', 'NETFLIX',          'cat-abonnements'),
  ('cr-002', 'contains', 'SPOTIFY',          'cat-abonnements'),
  ('cr-003', 'contains', 'DEEZER',           'cat-abonnements'),
  ('cr-004', 'contains', 'DISNEY',           'cat-abonnements'),
  ('cr-005', 'contains', 'PRIME VIDEO',      'cat-abonnements'),
  ('cr-006', 'contains', 'AMAZON PRIME',     'cat-abonnements'),
  ('cr-007', 'contains', 'YOUTUBEPREMIUM',   'cat-abonnements'),
  ('cr-008', 'contains', 'APPLE.COM/BILL',   'cat-abonnements'),
  ('cr-009', 'contains', 'ICLOUD',           'cat-abonnements'),
  ('cr-010', 'contains', 'AUDIBLE',          'cat-abonnements'),
  -- Énergie & internet
  ('cr-020', 'contains', 'TOTALENERGIES',    'cat-energie'),
  ('cr-021', 'contains', 'EDF',              'cat-energie'),
  ('cr-022', 'contains', 'ENGIE',            'cat-energie'),
  ('cr-023', 'contains', 'FREE MOBILE',      'cat-energie'),
  ('cr-024', 'contains', 'FREE HAUT DEBIT',  'cat-energie'),
  ('cr-025', 'contains', 'ORANGE',           'cat-energie'),
  ('cr-026', 'contains', 'SFR',              'cat-energie'),
  ('cr-027', 'contains', 'BOUYGUES TELECOM', 'cat-energie'),
  ('cr-028', 'contains', 'SOSH',             'cat-energie'),
  -- Restaurants & sorties — "UBER EATS" before "UBER" (Transport)
  ('cr-040', 'contains', 'UBER EATS',        'cat-restaurants'),
  ('cr-041', 'contains', 'DELIVEROO',        'cat-restaurants'),
  ('cr-042', 'contains', 'JUST EAT',         'cat-restaurants'),
  ('cr-043', 'contains', 'MCDONALD',         'cat-restaurants'),
  ('cr-044', 'contains', 'BURGER KING',      'cat-restaurants'),
  ('cr-045', 'contains', 'KFC',              'cat-restaurants'),
  ('cr-046', 'contains', 'RESTAURANT',       'cat-restaurants'),
  ('cr-047', 'contains', 'BRASSERIE',        'cat-restaurants'),
  ('cr-048', 'contains', 'BOULANGERIE',      'cat-restaurants'),
  ('cr-049', 'contains', 'STARBUCKS',        'cat-restaurants'),
  -- Alimentation
  ('cr-060', 'contains', 'CARREFOUR',        'cat-alimentation'),
  ('cr-061', 'contains', 'LECLERC',          'cat-alimentation'),
  ('cr-062', 'contains', 'INTERMARCHE',      'cat-alimentation'),
  ('cr-063', 'contains', 'LIDL',             'cat-alimentation'),
  ('cr-064', 'contains', 'AUCHAN',           'cat-alimentation'),
  ('cr-065', 'contains', 'MONOPRIX',         'cat-alimentation'),
  ('cr-066', 'contains', 'FRANPRIX',         'cat-alimentation'),
  ('cr-067', 'contains', 'PICARD',           'cat-alimentation'),
  ('cr-068', 'contains', 'BIOCOOP',          'cat-alimentation'),
  ('cr-069', 'contains', 'GRAND FRAIS',      'cat-alimentation'),
  -- Transport — generic "UBER" after "UBER EATS"
  ('cr-080', 'contains', 'UBER',             'cat-transport'),
  ('cr-081', 'contains', 'SNCF',             'cat-transport'),
  ('cr-082', 'contains', 'RATP',             'cat-transport'),
  ('cr-083', 'contains', 'NAVIGO',           'cat-transport'),
  ('cr-084', 'contains', 'BLABLACAR',        'cat-transport'),
  ('cr-085', 'contains', 'VELIB',            'cat-transport'),
  ('cr-086', 'contains', 'TOTAL ACCESS',     'cat-transport'),
  ('cr-087', 'contains', 'STATION SERVICE',  'cat-transport'),
  ('cr-088', 'contains', 'VINCI AUTOROUTES', 'cat-transport'),
  ('cr-089', 'contains', 'PARKING',          'cat-transport'),
  -- Santé
  ('cr-100', 'contains', 'PHARMACIE',        'cat-sante'),
  ('cr-101', 'contains', 'DOCTOLIB',         'cat-sante'),
  ('cr-102', 'contains', 'LABORATOIRE',      'cat-sante'),
  ('cr-103', 'contains', 'MUTUELLE',         'cat-sante'),
  ('cr-104', 'contains', 'CPAM',             'cat-sante'),
  ('cr-105', 'contains', 'OPTICIEN',         'cat-sante'),
  -- Loisirs & culture
  ('cr-160', 'contains', 'UGC',              'cat-loisirs'),
  ('cr-161', 'contains', 'PATHE',            'cat-loisirs'),
  ('cr-162', 'contains', 'GAUMONT',          'cat-loisirs'),
  ('cr-163', 'contains', 'STEAM',            'cat-loisirs'),
  ('cr-164', 'contains', 'PLAYSTATION',      'cat-loisirs'),
  -- Revenus
  ('cr-200', 'contains', 'SALAIRE',          'cat-revenus'),
  ('cr-201', 'contains', 'VIREMENT DE SALAIRE', 'cat-revenus'),
  ('cr-202', 'contains', 'REMUNERATION',     'cat-revenus'),
  -- Transferts internes
  ('cr-220', 'contains', 'VIR INTERNE',      'cat-transferts'),
  ('cr-221', 'contains', 'VIREMENT INTERNE', 'cat-transferts'),
  ('cr-222', 'contains', 'VERS LIVRET',      'cat-transferts'),
  -- Logement
  ('cr-240', 'contains', 'LOYER',            'cat-logement'),
  ('cr-241', 'contains', 'FONCIA',           'cat-logement'),
  ('cr-242', 'contains', 'ASSURANCE HABITATION', 'cat-logement');
