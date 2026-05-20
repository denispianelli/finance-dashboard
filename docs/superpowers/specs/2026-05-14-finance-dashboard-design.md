# Finance Dashboard — Design Spec

**Date** : 2026-05-14
**Statut** : Validé, en attente de plan d'implémentation
**Auteur** : Denis (PO/Tech Lead) + Claude (Lead Dev assistant)
**Licence cible** : AGPL-3.0

---

## 1. Vision & Promesse Produit

Application desktop personnelle de gestion financière. L'utilisateur importe ses relevés bancaires mensuels (PDF, CSV ou OFX). L'app extrait les transactions de manière déterministe, les catégorise automatiquement via un LLM embarqué (classifieur batch, cf. §9 + ADR-009), et fournit un tableau de bord multi-comptes : réconciliation prouvée, radar de récurrences, budgets et analyse rétrospective pluriannuelle — le tout **déterministe et vérifiable**, sans IA conversationnelle.

**Promesse non négociable** : 100% local. Aucune donnée ne quitte la machine. Pas de login, pas de connexion bancaire, pas de serveur, pas de télémétrie.

**Public cible (v1)** : un utilisateur unique gérant plusieurs comptes (compte courant perso, compte joint, livret, etc.).

**Différenciation** : la combinaison "privacy stricte + IA locale + import de relevés" n'existe pas vraiment sur le marché. Actual Budget est privacy mais sans IA. Monarch/Copilot ont l'IA mais reposent sur des connexions bancaires + cloud.

## 2. Stack Technique

| Couche          | Choix                                   | Raison                                                                         |
| --------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| Runtime         | Electron                                | Maturité, bibliothèques natives accessibles via Node, packaging cross-platform |
| Langage         | TypeScript                              | Typage fort, partage de types main/renderer                                    |
| UI              | React + shadcn/ui + Tailwind            | Components copy-paste, full ownership, design moderne                          |
| Charts          | Recharts                                | S'intègre proprement avec shadcn, suffisant pour nos besoins                   |
| Base de données | SQLite via `better-sqlite3`             | Synchrone, zero-config, fichier unique sur disque, parfait pour cet usage      |
| LLM engine      | `node-llama-cpp`                        | Mature, bindings llama.cpp, intégration Node simple                            |
| Modèle LLM      | Llama 3.2 3B Instruct (Q4_K_M, ~1.9 Go) | Choix figé au spike — FR 5/5, JSON 5/5 (cf. ADR-004)                           |
| PDF             | `pdfjs-dist`                            | Extraction texte + coordonnées (x,y)                                           |
| CSV             | `papaparse`                             | Standard, gère les délimiteurs ambigus                                         |
| OFX             | `ofx-js`                                | Format historique bancaire                                                     |
| OCR (optionnel) | `tesseract.js`                          | Téléchargé à la demande pour les PDFs scannés                                  |

Le modèle a été **confirmé par le spike** (#12) : Llama 3.2 3B retenu, cf. ADR-004 (§16 conservé pour mémoire).

## 3. Architecture

```
┌──────────────────────────────────────────────────────┐
│                  ELECTRON MAIN PROCESS                │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  SQLite DB   │  │ node-llama-  │  │ FileSystem │  │
│  │ better-     │  │ cpp engine   │  │ + Parsers  │  │
│  │ sqlite3     │  │              │  │ (PDF/CSV)  │  │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │
│         └─────────────────┴────────────────┘         │
│                     IPC Bridge                        │
└─────────────────────────────────┬────────────────────┘
                                  │
┌─────────────────────────────────▼────────────────────┐
│              ELECTRON RENDERER (React)                │
│   shadcn/ui · Tailwind · Recharts · React Router      │
│   Pages : Dashboard · Transactions · Catégories       │
│           Rapports · Import · Chat · Paramètres       │
└──────────────────────────────────────────────────────┘
```

**Règle d'or** : le renderer ne fait **jamais** d'I/O. Tout passe par IPC vers le main process, qui est le seul à toucher au disque, à la DB et au LLM. Cela garantit la promesse privacy : aucun appel réseau n'est techniquement possible depuis le renderer (CSP stricte + désactivation de nodeIntegration).

**IPC** : channels typés (`ipcMain.handle` / `ipcRenderer.invoke`), wrapper TypeScript pour le typage end-to-end.

## 4. Pipeline d'Import

```
1. Upload fichier
   ↓
2. Détection type : PDF / CSV / OFX
   ↓
3. Si PDF : extraction texte avec pdfjs
   - Texte sélectionnable → étape 5
   - Aucun texte (scan) → étape 4
   ↓
4. OCR (Tesseract.js) — installé à la demande la 1ère fois
   ↓
5. Détection de la banque (regex + signatures dans la 1ère page)
   ↓
6. Mapping de colonnes pour cette banque connu ?
   - Oui → application directe
   - Non → LLM identifie les colonnes (1 fois par banque), mapping sauvegardé
   ↓
7. Extraction déterministe de la table (coordonnées x/y)
   ↓
8. Déduplication (3 niveaux, cf. §6)
   ↓
9. Catégorisation (cascade règle → historique → LLM, cf. §7)
   ↓
10. Vérification arithmétique (cf. §5)
    ↓
11. Page de Review utilisateur (PDF côte-à-côte + transactions éditables)
    ↓
12. Validation utilisateur → INSERT SQLite atomique
```

**Décision clé** : les **chiffres** (montants, dates, libellés) viennent **exclusivement** de l'extraction déterministe. Le LLM ne touche jamais à ces valeurs. Il intervient uniquement pour :

- Le mapping de colonnes (une fois par banque)
- La catégorisation (avec score de confiance)

Aucun usage IA en aval : chat / insights générés sont coupés (cf. §9 + ADR-009). Toute analyse downstream est déterministe.

## 5. Garde-fous Anti-hallucination

Trois couches de défense avant tout `INSERT` :

### 5.1. Vérification arithmétique automatique

```
solde_début_relevé + Σ(crédits) − Σ(débits) ?= solde_fin_relevé
```

Si la somme ne matche pas, l'import est **bloqué** avec un message explicite. C'est une garantie déterministe que rien n'a été inventé ni omis.

### 5.2. Score de confiance par transaction

Le LLM renvoie un `confidence` (0-1) pour chaque catégorisation. Les transactions à `confidence < 0.8` sont surlignées dans la page de Review.

### 5.3. Review utilisateur obligatoire

Aucun `INSERT` ne peut être effectué sans validation explicite. La page de Review affiche :

- PDF original rendu via PDF.js (gauche)
- Transactions extraites, éditables, avec niveau de confiance (droite)
- Résultat de la vérif arithmétique (vert/rouge)
- Actions : `Valider l'import` / `Modifier` / `Annuler`

## 6. Déduplication

### Niveau 1 — Fichier

Hash SHA-256 du fichier importé, stocké dans la table `imports`. Réimport du même fichier → confirmation explicite.

### Niveau 2 — Période

Chaque import stocke `date_range_start` et `date_range_end`. Chevauchement avec un import existant pour le même compte → alerte non-bloquante.

### Niveau 3 — Transaction

Hash sémantique :

```
tx_hash = SHA256(account_id + date + amount + normalize(label))
```

Où `normalize(label)` = uppercase + collapse espaces + retrait accents.

Contrainte SQL `UNIQUE(account_id, tx_hash)` = garde-fou en dernière ligne.

**Cas spécial** : deux courses au même Carrefour le même jour pour le même montant. Détecté au sein d'un même import → un `order_in_import` est ajouté au hash.

## 7. Catégorisation

### Catégories par défaut (14)

- 🏠 Logement
- ⚡ Énergie & internet
- 🛒 Alimentation
- 🍽️ Restaurants & sorties
- 🚗 Transport
- ✈️ Voyages
- 🏥 Santé
- 🎓 Éducation
- 👕 Vêtements & shopping
- 🎬 Loisirs & culture
- 📺 Abonnements
- 💼 Professionnel
- 💸 Frais bancaires
- 💰 Revenus
- 🔄 Transferts internes
- ❓ À catégoriser

Catégories extensibles : l'utilisateur peut ajouter, renommer, supprimer. Sous-catégories optionnelles.

### Cascade d'attribution

```
Pour chaque transaction :
  1. RÈGLE UTILISATEUR ("libellé contient X → catégorie Y") → instantané
  2. HISTORIQUE (libellé déjà vu) → instantané, propose la catégorie la plus utilisée
  3. LLM → catégorie + confidence score
```

### Apprentissage continu

Quand l'utilisateur corrige une catégorie pendant la Review, l'app propose :

> _"Toujours catégoriser 'BOULANGER MARTIN' comme Restaurants ?"_
> → Si oui, une règle utilisateur est créée pour la cascade niveau 1.

### Gestion des règles

Les règles créées (ou ajoutées manuellement) sont éditables et supprimables depuis la page **Catégories**. Chaque règle affiche son nombre de hits — utile pour identifier les règles dormantes ou trop larges.

### Transferts internes

Détection automatique : même montant débité d'un compte et crédité d'un autre compte le même jour → suggéré comme transfert interne, exclu des KPIs Revenus/Dépenses.

## 8. Multi-comptes

V1 : multi-comptes simple pour un **utilisateur unique**.

- Plusieurs comptes (perso, joint, livret, épargne, etc.) gérés dans la même DB
- "Compte joint" = un compte comme un autre, juste un label
- Pas de sync multi-machines, pas de partage entre utilisateurs
- Filtres par compte dans toutes les vues

Le partage compte joint entre deux personnes utilisant chacune l'app est **hors scope v1** (cf. §13).

## 9. Rôle de l'IA

> **Recadré par l'ADR-009.** Le LLM (Llama 3.2 3B, cf. ADR-004 — pas Qwen, choix figé au spike) est un **classifieur batch en arrière-plan, point**. Il ne converse jamais, ne raisonne jamais sur des montants côté utilisateur, ne narre rien. L'inférence mesurée (~57 s/appel CPU, ADR-004) interdit tout usage interactif. L'intelligence ressentie (réconciliation, récurrences, tendances) est **déterministe**, posée sur des données que l'IA a seulement étiquetées.

### 9.1. Catégorisation automatique — seul usage produit du LLM

Cf. §7. C'est la clé de voûte : sans étiquetage automatique fiable, l'analyse déterministe (fuites, budgets, rétrospectif) n'existe pas.

### 9.2. Mapping de colonnes

Une fois par banque, à l'import (ADR-004 ; Epic Import Pipeline #23 → #32).

### 9.3. « Insights » — déterministes, pas générés

Plus aucune génération LLM sur les chiffres. La valeur insight est produite par des moteurs déterministes et vérifiables :

- Radar de récurrences (abonnements, loyer, salaire, frais) — Epic #72
- Dérives / anomalies **calculées** et affichées, pas narrées par un modèle ("Restaurants +34 % vs mois dernier" = un calcul, pas une phrase de LLM)
- Réconciliation prouvée contre le solde de clôture banque — Epic #71

### 9.4. Projections — déterministes

Épargne projetée et budget vs réel par extrapolation déterministe des tendances, sans LLM.

**Coupé v1 (ADR-009)** : chat conversationnel, recherche en langage naturel, résumés/insights générés. La recherche passe par filtres + recherches sauvegardées.

### Inférence

- Modèle chargé en mémoire au démarrage (~3-5s)
- File d'attente single-shot dans le main process pour éviter de saturer la machine
- Catégorisation en lot à l'import, en arrière-plan (jamais interactif — ~57 s/appel CPU, ADR-004)
- Mode "low power" désactivable : tout à la demande

## 10. Schéma SQLite (vue conceptuelle)

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,        -- courant, joint, livret, etc.
  bank_id TEXT,
  currency TEXT DEFAULT 'EUR',
  created_at TIMESTAMP
);

CREATE TABLE banks (
  id TEXT PRIMARY KEY,
  name TEXT,
  detected_signature TEXT
);

CREATE TABLE bank_column_mappings (
  bank_id TEXT,
  format_version TEXT,
  date_col INT,
  label_col INT,
  debit_col INT,
  credit_col INT,
  balance_col INT,
  PRIMARY KEY (bank_id, format_version)
);

CREATE TABLE imports (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  file_hash TEXT UNIQUE,
  source_type TEXT,        -- pdf, csv, ofx
  date_range_start DATE,
  date_range_end DATE,
  imported_at TIMESTAMP,
  status TEXT              -- pending_review, validated, cancelled
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  import_id TEXT,
  tx_hash TEXT NOT NULL,
  date DATE NOT NULL,
  amount NUMERIC NOT NULL, -- positif=crédit, négatif=débit
  label_raw TEXT,
  label_clean TEXT,
  category_id TEXT,
  confidence REAL,
  is_internal_transfer INT DEFAULT 0,
  user_modified INT DEFAULT 0,
  UNIQUE(account_id, tx_hash)
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  name TEXT,
  icon TEXT,
  color TEXT,
  is_default INT,
  position INT,
  -- Taxonomie versionnée (ADR-010, migration 005) :
  deprecated_at TEXT NULL,
  replaced_by_event_id TEXT NULL REFERENCES taxonomy_events(id)
);

CREATE TABLE taxonomy_events (
  id TEXT PRIMARY KEY,
  event_seq INTEGER NOT NULL UNIQUE,                       -- tiebreaker monotone, attribué à l'insertion
  kind TEXT NOT NULL CHECK (kind IN ('rename', 'split', 'merge')),
  source_ids TEXT NOT NULL,                                -- JSON array d'ids de catégories
  target_ids TEXT NOT NULL,                                -- JSON array d'ids de catégories
  payload TEXT,                                            -- JSON ; forme selon kind (mapping pour split, ancien/nouveau nom pour rename, NULL pour merge)
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE categorization_rules (
  id TEXT PRIMARY KEY,
  match_type TEXT,         -- contains, regex, exact
  match_value TEXT,
  category_id TEXT,
  created_at TIMESTAMP,
  hit_count INT DEFAULT 0
);
```

Schéma final affiné en phase d'implémentation. Index et clés étrangères à préciser.

### Résolution `as_of_period` vs `as_of_now`

La taxonomie est versionnée via un journal d'événements (`taxonomy_events`) :
chaque renommage, split ou merge est enregistré, et les catégories source
d'un split ou d'un merge sont marquées `deprecated_at` + `replaced_by_event_id`
sans jamais réécrire `transactions.category_id`. L'historique reste ancré.
Toute agrégation par catégorie doit choisir explicitement son mode (pas de
défaut — un défaut mentirait silencieusement après une mutation de la
taxonomie) : `as_of_period` rejoue la taxonomie telle qu'elle était à la
date de chaque transaction (vue fidèle à l'époque), tandis que `as_of_now`
applique les événements postérieurs pour exprimer l'historique dans la
taxonomie actuelle (vue rétrospective comparable dans le temps). Détails
complets, sémantique du résolveur et règle de mapping exhaustive pour les
splits : `docs/superpowers/specs/2026-05-20-versioned-taxonomy-design.md`
(et ADR-010).

## 11. Pages & UI

| Page         | Rôle                                                                            |
| ------------ | ------------------------------------------------------------------------------- |
| Dashboard    | KPIs (solde, revenus, dépenses, épargne), charts (cat + tendance), dernières tx |
| Transactions | Liste filtrable et éditable, recherche, bulk actions                            |
| Catégories   | CRUD catégories, règles, sous-catégories                                        |
| Rapports     | Analyses sur période, comparatifs, exports                                      |
| Import       | Upload + page de Review (split PDF / extracted)                                 |
| Chat IA      | Interface conversationnelle avec contexte intelligent                           |
| Paramètres   | Comptes, modèle LLM, OCR on/off, export/backup, thème                           |

**Design** : dark theme par défaut (cohérent avec mockup validé). Light theme prévu en v2. shadcn/ui + Tailwind. Sidebar persistante à gauche, contenu principal au centre.

## 12. Onboarding (premier lancement)

1. **Écran de bienvenue** — explication courte de la promesse (3 phrases)
2. **Téléchargement du modèle LLM** (~2 Go) avec barre de progression et estimation
3. **Création du premier compte** (nom, type, banque)
4. **Premier import guidé** (avec tooltip sur la page de Review)
5. **Tutoriel court** : explorer le dashboard, créer une règle, poser une question au chat

**Si l'utilisateur ferme l'app pendant le download du modèle** : reprise au prochain lancement, sans repartir de zéro.

## 13. Hors scope v1

Pour mémoire, **on ne fait pas** ces choses en v1, mais elles sont notées pour plus tard :

- Sync multi-machines / partage compte joint entre deux utilisateurs
- Mobile companion app
- Auto-update et code signing pour distribution publique
- Choix de modèle LLM configurable par l'utilisateur
- Connexions bancaires PSD2 (et ce ne sera probablement jamais fait, c'est antinomique avec la promesse)
- Cloud backup chiffré
- **Suivi d'investissements / patrimoine** (PEA/CTO/ETF/crypto/immo) — valoriser exige des cours = appels réseau = antinomique avec la promesse 100 % local. Hors _identité_, pas seulement différé (ADR-009)
- **Chat financier conversationnel, recherche en langage naturel, insights/résumés générés par LLM** — mur de latence ~57 s + hallucination de chiffres (ADR-009)
- Multi-fenêtres (pas de cas d'usage réel pour une app locale mono-utilisateur)

## 14. Backup & Export

- **Export** : sérialisation de la DB SQLite (+ règles + mappings) dans un fichier `.fbk` chiffré (passphrase utilisateur, libsodium)
- **Import** : déchiffrage et restauration depuis `.fbk`
- **Pas d'auto-backup** en v1 (l'utilisateur exporte à la main si besoin)
- **Pas de cloud** — c'est à l'utilisateur de stocker son `.fbk` où il veut

## 15. Tests

- **Unit tests** : parsers (CSV, OFX, PDF positions), dedup, hash, catégorisation rule engine — Vitest
- **Integration tests** : pipeline d'import complet sur fixtures réels — Vitest avec DB temporaire
- **E2E tests** : flows critiques (premier import, review, validation) — Playwright Electron
- **Fixtures** : un jeu de 5-10 PDFs réels (anonymisés) couvrant les principales banques françaises
- **Snapshot tests** sur la sortie LLM pour détecter les régressions sur changement de modèle

## 16. Spike technique en début de projet

**Avant** d'engager l'architecture finale, un spike d'1-2 jours :

1. Prendre 3 PDFs réels (banques de Denis)
2. Tester l'extraction déterministe avec `pdfjs-dist` → mesurer la qualité de la reconstruction de table
3. Tester 3 modèles LLM (Qwen2.5 3B, Phi-3.5 Mini, Llama 3.2 3B) sur :
   - Mapping de colonnes (qualité, vitesse)
   - Catégorisation (qualité FR)
   - RAM utilisée
4. **Livrable** : un ticket de décision technique avec choix figé du modèle + recommandation sur l'extraction PDF

Sans ce spike, on grave dans le marbre des choix qui peuvent être fragiles.

## 17. Process projet

- **Specs** dans Notion (page parent : 💰 Finance Dashboard)
- **ADRs** (Architecture Decision Records) dans `docs/adr/` (ce repo)
- **Tickets** sur GitHub Issues avec labels `epic`, `story`, `task`, `spike`, `bug`
- **Board** : GitHub Projects (Backlog → Sprint → In Progress → Review → Done)
- **Branches** : `main` protégée, feature branches `feat/<epic>-<short>`, PR obligatoire
- **Découpage** : Epic → User Story → Task. On crée les tasks détaillées uniquement pour l'Epic en cours, pas pour les 5 d'un coup.

### Epics — modèle resserré (ADR-009)

> Le board GitHub (Project) est la source vivante. Étoile Nord : _un outil privé qui, minutes après un import, te dit une chose vraie sur ton argent que tu ignorais — et que tu peux vérifier — sans faire confiance à personne._ Toute feature qui ne sert pas cette phrase est coupée, pas parquée.

**Fait** — Setup & Foundation (Epic #4), gros de l'Import Pipeline (#23 : ingestion, extraction PDF, dédup, vérif arithmétique, review, OFX #58), Design System (#65, #69).

**Keystone (Phase 2, en cours) — prérequis de toute valeur** : finir #23 — #32 (détection banque + mapping), #29 (catégories + cascade), #34 (apprentissage continu), **#74 taxonomie de catégories stable versionnée**, **#75 backfill PDF historique**. Sans données catégorisées fiables sur plusieurs années, les trois piliers sont de la fiction.

**Trois piliers de valeur** (sous l'étoile Nord) :

1. **Trust & Verifiability** (Epic #71, Phase 3) — réconciliation prouvée, provenance jusqu'à la ligne source, catégorisation inspectable, mode privé vérifiable, coffre `.fbk` soigné. Ce que les concurrents cloud ne peuvent structurellement pas faire.
2. **Recurring Detection & Budgets** (Epic #72, Phase 3) — moteur de récurrences déterministe, radar + alertes, budgets, objectifs, replay mensuel (seul "wow" retenu). Mode _opérationnel_.
3. **Retrospective Analytics** (Epic #73, Phase 4) — tendances pluriannuelles, drill-down catégorie dans le temps, évolution revenus/épargne, year-over-year. Mode _rétrospectif_ (valeur perso prioritaire du mainteneur).

**Transverses** : Design System & UI Polish (#66 — responsive #76, titlebar #68), OCR & edge cases (#33), Backup & Settings, Distribution (#42 + packaging).

**Hors scope / coupé** : cf. §13 et ADR-009 (investissements, IA conversationnelle, recherche NL, insights générés, multi-fenêtres).

## 18. Risques identifiés

| Risque                                    | Probabilité | Mitigation                                                                    |
| ----------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| Modèle LLM trop lent sur CPU moyen        | Moyenne     | Spike obligatoire, fallback vers modèle plus petit                            |
| Extraction PDF échoue sur banque exotique | Moyenne     | LLM fallback pour mapping initial, message clair si échec                     |
| Hallucination de catégorisation           | Faible      | Score de confiance, Review obligatoire, apprentissage                         |
| OCR qualité variable                      | Moyenne     | Marqué optionnel, message si qualité basse                                    |
| Native deps cross-platform                | Moyenne     | CI multi-OS dès le début, prebuilds pour `better-sqlite3` et `node-llama-cpp` |
| RAM excessive                             | Faible      | Q4 quantization, mode low-power, monitoring intégré                           |

---

**Fin du document.**
