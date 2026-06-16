# Aurora redesign — design spec

**Date** : 2026-06-16
**Statut** : Validé en brainstorming, en attente de plan d'implémentation
**Auteur** : Denis (PO/Tech Lead) + Claude (Lead Dev assistant)
**Source externe** : `design_handoff_aurora` (dossier « (Copy) (1) » — version canonique)
**Décision** : voir ADR-020 (à créer dans la PR 0)

---

## 1. Contexte & décision

Une refonte UI/UX externe (**Aurora**) remplace l'identité « editorial » actuelle
(Instrument Serif italique, palette chaude paper/ink/brass) par une identité **verre
sombre + clair**, accent vif unique, chiffres **Geist bold**, et une passe de motion.

La décision d'adopter Aurora est **difficilement réversible** (changement de direction
visuelle globale) → elle est actée par **ADR-020** et la réécriture des sections
visuelles du spec design `2026-05-14-finance-dashboard-design.md`. La skill
`finance-dashboard-design` (hors repo) est mise à jour en parallèle.

**Le périmètre produit (ADR-009) ne change pas.** Aurora est une refonte de forme, pas
de fonction. L'invariant privacy (ADR-002) est intact : le seul ajout stateful est le
choix de thème, persisté **en local**, zéro réseau.

## 2. Principe directeur (règle de discernement)

> **`main` est la réalité. Le handoff ne fait autorité que sur le _look & feel_.**

Le handoff a été écrit contre un `main` partiellement périmé : il décrit des features
déjà livrées, d'autres autrement, et quelques-unes supprimées. Chaque tâche est donc
classée avant tout code :

- **✅ déjà fait** — aucune action.
- **🎨 restyle** — existe, on applique le look Aurora, on garde la logique testée.
- **🆕 nouveau** — surface ou comportement réellement absent ; évalué contre ADR-009.
- **🗑️ drop** — référence une feature retirée/inexistante (typiquement LLM/ADR-019).

La table §4 fige ce classement, vérifié contre le code (chemins cités).

## 3. Décisions de périmètre figées

- **Thème** : bascule **sombre + clair**, **accent lime uniquement**. On abandonne les
  3 variantes d'accent (violet/cyan/coral) et le sélecteur de swatches. Le provider du
  handoff (`ThemeAccentProvider`) est réduit à un **provider de thème** (`data-theme`).
- **Bug corrigé** : en thème clair, l'item de nav actif est quasi illisible (gris clair
  sur fond clair) — à corriger en câblant le thème clair.
- **Identité retirée** : Instrument Serif italique → Geist bold ; marque serif-`ƒ` →
  trait montant (`brand-mark.svg`) ; wordmark « Dashboard » serif → Geist.
- **Items écartés du handoff** (voir §7) : tuile « Prélèvements à venir », sélecteur
  d'accents.

## 4. Table de réconciliation (vérifiée contre le code)

### Shell (`reference/app.jsx`)

| Tâche handoff                              | Réalité                                                                                           | Verdict                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 7e item de nav Patrimoine (Wallet)         | `Sidebar.tsx:56` présent                                                                          | ✅                                         |
| Carte ancre « Patrimoine net » sidebar     | `NetWorthAnchor` rendu (`Sidebar.tsx:226`)                                                        | 🎨                                         |
| Toggle collapse dans la topbar (PanelLeft) | `Topbar.tsx:56` présent                                                                           | ✅                                         |
| Retirer « Replier » du bas de la sidebar   | inexistant (bas = local·privé + version)                                                          | ✅ rien à faire                            |
| Retirer bouton « Catégoriser 12 » topbar   | inexistant (retiré avec ADR-019)                                                                  | 🗑️                                         |
| Marque trait montant + wordmark Geist      | `BrandMark` = serif-`ƒ`, wordmark serif                                                           | 🎨                                         |
| Toggle thème **+ swatches accent**         | aucun                                                                                             | 🆕 **toggle thème seul** (pas de swatches) |
| Import hub (chooser typé)                  | les 3 flux existent (`ImportModal`, `AddLoanDialog`, `ImportBourseDialog`), pas de chooser unifié | 🆕 surface neuve, logique existante        |
| Entrée de route `anim-rise`                | aucune                                                                                            | 🆕 motion (foldé dans chaque PR)           |

### Dashboard (`reference/dashboard.jsx`)

| Tâche handoff                                                         | Réalité                                  | Verdict                                |
| --------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------- |
| Ranges chart 3M/6M/1A/MAX, **1M retiré**, titre dynamique, footer     | `ChartCard` déjà exactement ça           | ✅                                     |
| 4 tuiles KPI **avec sparklines**                                      | `Kpi` + `sparkPoints`                    | ✅                                     |
| Tuile Insight · dernières transactions (reassign + create cat inline) | présents                                 | 🎨                                     |
| Renommer hero « Solde net · **comptes** »                             | actuellement « Solde net »               | 🎨 trivial                             |
| **Bento grid** (12-col spans variés)                                  | layout uniforme `KpiGrid`+`Row2`+`Card`  | 🆕 restructure layout                  |
| **Donut dépenses** (« Où part l'argent »)                             | aujourd'hui ce slot = le _texte_ Insight | 🆕 (réutilise `reports/CategoryDonut`) |
| Tuile **Prélèvements à venir**                                        | absente                                  | 🗑️ **écartée** (voir §7)               |
| Tuile accounts-mini                                                   | aujourd'hui `AccountTabs` en tête        | 🆕 mineur                              |

### Transactions (`reference/transactions.jsx`)

| Tâche handoff                                                                              | Réalité                                                                                                                                                             | Verdict                                                                                                 |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Filtre compte · filtre période · recherche · reassign + create-cat par ligne · suppression | tous présents (`AccountTabs`, `PeriodFilter`, `reassign`, `createCategory`, `deleteTransaction`)                                                                    | ✅ / 🎨 dropdown → verre                                                                                |
| **Filtre catégorie** dans la barre d'outils                                                | absent                                                                                                                                                              | 🆕 (client)                                                                                             |
| **Édition inline du libellé** (crayon → input)                                             | UI absente, **mais backend + IPC + audit déjà là** : `updateTransaction` (date/label/amount, `editedAt`, normalisation `normalizeLabel`), IPC `transactions:update` | 🆕 **renderer-only** (réutilise l'IPC audité existant — pas de nouveau backend, pas de travail ADR-012) |
| **Totaux live + Réinitialiser**                                                            | absents                                                                                                                                                             | 🆕 (calcul client)                                                                                      |

### Reports (`reference/reports.jsx`)

| Tâche handoff                                                                                | Réalité                                                                       | Verdict                  |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------ |
| Dropdowns Mois+Année · toggle mensuel/annuel · verdicts · récurrences · plus gros mouvements | tous présents (`PeriodPicker`, granularité, `VerdictRow`, `biggestMovements`) | ✅ / 🎨 popovers → verre |
| Motion bars/donuts                                                                           | aucune                                                                        | 🆕 motion (foldé)        |

### Patrimoine (`reference/patrimoine.jsx`) — le handoff la marque « 🆕 NEW PAGE »

| Réalité                                                                                                                                                                                                                                                                                                 | Verdict                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Déjà entièrement construite** (#227/#232/#233/#234/#235) : résumé patrimoine net, `AllocationCard`+cibles+`ClassManagerDialog`, `LoanCard`+`AmortizationTableDialog`+Détecter, `AssetsCard`, `PlacementsCard` (enveloppes/supports, cours auto, TRI/TTWROR, Rafraîchir, Importer CSV, ISIN→Valoriser) | 🎨 **restyle uniquement** — la revendication la plus périmée du handoff |

### Categories & Settings (`reference/manage.jsx`)

| Tâche handoff                                                                 | Réalité                                                                 | Verdict                                                     |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| Liste d'audit **Règles**                                                      | `RulesSection` présent                                                  | 🎨                                                          |
| Settings : Données/Sauvegarde · Synchronisation · Cours de marché · Apparence | les 4 présents, **pas de section LLM**                                  | 🎨                                                          |
| « ancienne section Modèle LLM retirée »                                       | déjà retirée                                                            | 🗑️                                                          |
| Toggle thème dans Apparence                                                   | déjà **stubé** « Clair · À venir » (`SettingsPage` `AppearanceSection`) | 🆕 câbler le vrai toggle sombre/clair dans le stub existant |

**Bilan : ~70 % du handoff est déjà construit.** L'essentiel est un reskin (token swap +
verre + chiffres + marque). Le travail réellement neuf est concentré et petit.

## 5. Stratégie du reskin (« token swap »)

L'app lie déjà ses utilitaires Tailwind à des variables CSS dans
`src/renderer/styles/globals.css`. **Vérifié** : `globals.aurora.css` réutilise tous les
noms existants (`--ink-*`, `--paper-*`, `--brass*`, `--line-*`, `--cat-1..15`,
`--color-income/expense/flag`, …) et n'ajoute que de nouveaux (`--bg`, `--panel`,
`--surface*`, `--accent-2`, `--shadow-pop`). Donc swapper le bloc de tokens reskine
~90 % de l'app **sans toucher aux composants**. Le `tailwind.aurora.snippet.ts` est
additif (rien de supprimé).

Adaptations à faire sur les fichiers du handoff avant intégration :

- **Retirer** des `globals.aurora.css` les 3 blocs d'accent non-lime
  (`:root[data-accent="violet|cyan|coral"]`) — accent lime unique.
- **Garder** les imports `@fontsource` Geist ; **retirer** les imports Instrument-Serif ;
  `--font-serif` reste aliasé à Geist pour les call-sites résiduels.
- `ThemeAccentProvider.tsx` → **`ThemeProvider`** (écrit `data-theme` sur `<html>`,
  persiste en local ; pas de `data-accent`).

## 6. Plan de PR (stratégie A — look d'abord ; motion foldé dans chaque écran)

| #   | PR                      | Contenu                                                                                                                                                                                                                                                     | Validation          |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 0   | **Spec + ADR-020**      | Ce doc, ADR-020, réécriture sections visuelles du spec design. Pas de code.                                                                                                                                                                                 | Self-merge (docs)   |
| 1   | **Reskin global**       | `globals.aurora.css` (lime only) + tailwind snippet + `.tile`/`.aurora-bg` + chiffres→Geist bold + marque trait montant + **toggle thème sombre/clair** (provider + Topbar + Apparence, fix contraste clair). Toute l'app passe Aurora, ~0 logique touchée. | En app, tous écrans |
| 2   | **Shell**               | Carte ancre patrimoine + rail accent en verre, **Import hub** (enrobe les 3 flux existants), entrée de route, fix breadcrumb `/patrimoine`.                                                                                                                 | En app              |
| 3   | **Dashboard**           | Bento grid, donut dépenses, accounts-mini, restyle KPI/Insight/recent, draw-in chart + tooltip.                                                                                                                                                             | En app              |
| 4   | **Transactions**        | Filtre catégorie, **édition inline libellé** (réutilise `transactions:update`), totaux live + Réinitialiser, dropdowns verre, restyle.                                                                                                                      | En app              |
| 5   | **Restyle de finition** | Reports (popovers verre + motion), Patrimoine (verre), Categories (Règles), Settings — tous restyle-only, regroupés.                                                                                                                                        | En app              |

Restyle-only (Reports/Patrimoine/Categories/Settings) **foldé** dans le reskin global +
PR 5 de finition, pas de rebuild. Les vraies PR d'ingénierie sont **Dashboard** et
**Transactions**. Chaque PR après #1 est **UI → validée en app avant merge** (règle
maintainer). PR 0 self-merge une fois CI verte.

## 7. Items écartés (et pourquoi)

- **Tuile « Prélèvements à venir »** (dashboard) — écartée à la demande du maintainer.
  C'était une projection ; reconstructible plus tard sur `recurring/detect.ts` si besoin,
  à condition de garantir un chemin de vérification déterministe (north star ADR-009).
- **Sélecteur d'accents (violet/cyan/coral)** — YAGNI mono-utilisateur ; accent lime figé.
  Réintroductible (tous les blocs accent sont déjà dans le CSS source) si l'envie vient.

## 8. Mises à jour de doc (anti-drift)

Chaque doc atterrit **dans la PR qui la rend vraie** (règle CLAUDE.md) :

- **ADR-020** « Adopt the Aurora visual identity » — court ; supersède l'identité
  editorial, acte sombre+clair / lime-only / stratégie token-swap ; lie ADR-009 (scope
  inchangé) et ADR-002 (privacy inchangée). → PR 0.
- **Spec design `2026-05-14`** — réécriture des sections visuelles vers Aurora ; au
  passage, **corriger les références LLM périmées** (§1, §2, §9) post ADR-019. → PR 0.
- **Skill `finance-dashboard-design`** (hors repo, `~/.claude/skills/…`) — tokens, type,
  marque. Changement séparé, pas dans une PR du repo.

## 9. Validation & Definition of Done

Barre du repo, inchangée : lint clean, `tsc --noEmit` clean, tests verts, E2E vert où
pertinent, `npm run build` OK. En plus :

- **Reduced-motion safe** : toute entrée en transform/opacity-from-state, jamais
  `opacity:0` derrière une timeline qui peut ne pas tourner (gotcha du handoff).
- **Garde anti-régression** : `grep -rn "fixed inset-0\|Intl.NumberFormat" src/renderer`
  reste clean (modales = `ui/dialog`, montants = `lib/euro`/`<Money>`).
- **Français + EUR** partout ; chaque figure garde son chemin de vérification.
- **ResizeObserver chart** : arrondir + dédupliquer la largeur mesurée (gotcha handoff)
  pour éviter le re-render par frame sous `backdrop-filter`.
- Chaque écran validé **en app** par le maintainer avant merge.

## 10. Risques

- **Verre + `backdrop-filter` sous Electron/WSLg** : coût GPU et mesures de largeur
  fractionnaires → appliquer la garde ResizeObserver ; surveiller la perf en validation.
- **Thème clair** : tous les tokens doivent être validés en clair (le bug de contraste
  sidebar prouve que le clair n'a jamais été exercé) — vérifier chaque écran en clair.
- **Token swap global (PR 1)** : large surface visuelle ; bien que mécanique, à montrer
  au maintainer avant merge malgré le caractère « backend-like » du changement.
