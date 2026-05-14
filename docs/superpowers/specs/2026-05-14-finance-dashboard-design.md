# Finance Dashboard — Design Spec

**Date** : 2026-05-14
**Statut** : Validé, en attente de plan d'implémentation
**Auteur** : Denis (PO/Tech Lead) + Claude (Lead Dev assistant)
**Licence cible** : AGPL-3.0

---

## 1. Vision & Promesse Produit

Application desktop personnelle de gestion financière. L'utilisateur importe ses relevés bancaires mensuels (PDF, CSV ou OFX). L'app extrait les transactions de manière déterministe, les catégorise automatiquement via un LLM embarqué, et fournit un tableau de bord multi-comptes, ainsi que des features IA (chat conversationnel, insights automatiques, projections).

**Promesse non négociable** : 100% local. Aucune donnée ne quitte la machine. Pas de login, pas de connexion bancaire, pas de serveur, pas de télémétrie.

**Public cible (v1)** : un utilisateur unique gérant plusieurs comptes (compte courant perso, compte joint, livret, etc.).

**Différenciation** : la combinaison "privacy stricte + IA locale + import de relevés" n'existe pas vraiment sur le marché. Actual Budget est privacy mais sans IA. Monarch/Copilot ont l'IA mais reposent sur des connexions bancaires + cloud.

## 2. Stack Technique

| Couche          | Choix                               | Raison                                                                         |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| Runtime         | Electron                            | Maturité, bibliothèques natives accessibles via Node, packaging cross-platform |
| Langage         | TypeScript                          | Typage fort, partage de types main/renderer                                    |
| UI              | React + shadcn/ui + Tailwind        | Components copy-paste, full ownership, design moderne                          |
| Charts          | Recharts                            | S'intègre proprement avec shadcn, suffisant pour nos besoins                   |
| Base de données | SQLite via `better-sqlite3`         | Synchrone, zero-config, fichier unique sur disque, parfait pour cet usage      |
| LLM engine      | `node-llama-cpp`                    | Mature, bindings llama.cpp, intégration Node simple                            |
| Modèle LLM      | Qwen2.5 3B Instruct (Q4_K_M, ~2 Go) | Bon FR, bon en extraction JSON, raisonnable en CPU                             |
| PDF             | `pdfjs-dist`                        | Extraction texte + coordonnées (x,y)                                           |
| CSV             | `papaparse`                         | Standard, gère les délimiteurs ambigus                                         |
| OFX             | `ofx-js`                            | Format historique bancaire                                                     |
| OCR (optionnel) | `tesseract.js`                      | Téléchargé à la demande pour les PDFs scannés                                  |

Le modèle final sera **confirmé par un spike** au début du projet (cf. §16).

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
- Les features IA en aval (chat, insights)

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

## 9. Features IA

Même moteur LLM (Qwen2.5 3B chargé en mémoire au démarrage), plusieurs cas d'usage :

### 9.1. Catégorisation automatique

Cf. §7 — déjà décrite.

### 9.2. Chat avec ses finances

Interface conversationnelle. Le LLM reçoit en contexte un résumé structuré des données pertinentes (selon la question). Exemples :

- _"Combien j'ai dépensé en restau ce trimestre ?"_
- _"Mes 5 plus grosses dépenses du mois ?"_
- _"À ce rythme, combien j'aurai épargné fin décembre ?"_

Streaming des réponses vers le renderer pour l'UX.

### 9.3. Insights automatiques

Au chargement du dashboard ou à la demande :

- Dérives significatives ("dépenses Restaurants +34% vs mois dernier")
- Abonnements détectés inactifs ou en hausse
- Anomalies (transactions inhabituelles)
- Recommandations simples ("3 abonnements similaires détectés")

### 9.4. Projections

- Épargne projetée à fin d'année selon trends actuels
- Budget par catégorie vs réel

### Inférence

- Modèle chargé en mémoire au démarrage (~3-5s)
- File d'attente single-shot dans le main process pour éviter de saturer la machine
- Streaming pour le chat
- Mode "low power" désactivable : pas de catégorisations en lot, tout à la demande

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
  position INT
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
- **ADRs** (Architecture Decision Records) dans Notion sous "Architecture"
- **Tickets** sur GitHub Issues avec labels `epic`, `story`, `task`, `spike`, `bug`
- **Board** : GitHub Projects (Backlog → Sprint → In Progress → Review → Done)
- **Branches** : `main` protégée, feature branches `feat/<epic>-<short>`, PR obligatoire
- **Découpage** : Epic → User Story → Task. On crée les tasks détaillées uniquement pour l'Epic en cours, pas pour les 5 d'un coup.

### Epics envisagés (à découper plus tard)

1. **Setup & Foundation** — repo, CI/CD basique, Electron + React skeleton, IPC, SQLite, schéma initial, spike LLM
2. **Import Pipeline** — détection format, extraction PDF déterministe, mapping LLM, parsing CSV/OFX, dédup, page Review
3. **Dashboard** — KPIs, charts catégorie + tendance, navigation comptes, filtres temporels
4. **Catégorisation & Règles** — CRUD catégories, cascade règle/historique/LLM, apprentissage continu
5. **Features IA** — chat conversationnel, insights automatiques, projections
6. **OCR & Edge cases** — Tesseract on-demand, banques non standard
7. **Backup & Settings** — export/import `.fbk`, paramètres modèle, thèmes
8. **Distribution** — packaging, code signing, auto-update

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
