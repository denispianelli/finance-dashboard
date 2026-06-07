# Spec — Téléchargement opt-in du modèle LLM (juste-à-temps, non bloquant)

- **Date** : 2026-06-07
- **Statut** : Design validé, prêt pour le plan d'implémentation
- **Périmètre** : ADR-009 (le LLM reste un classifieur batch en arrière-plan), ADR-002 (privacy), ADR-004 (modèle retenu)

## Note pré-implémentation (UI)

Les composants d'interface décrits ici (bandeau, indicateur de progression, dialogue
PDF, section Réglages) seront **repassés au design via claude.ai/design avant
implémentation**. Les maquettes de cette spec sont **indicatives** : elles fixent le
_comportement_ et les _états_ à couvrir, pas le visuel final. Le pass design est libre de
refaire la présentation tant qu'il couvre tous les états listés en §5.

## 1. Principe directeur

L'app est **pleinement fonctionnelle sans LLM**. Le modèle est un **bonus opt-in**,
proposé uniquement quand il apporte une valeur concrète, téléchargé en arrière-plan, et
contrôlable depuis les Réglages.

Le comportement « marche sans LLM » existe déjà dans le code : `isModelAvailable()` garde
la catégorisation (`handleCategorizeBatch` → `model_unavailable`) et l'apprentissage de
banque PDF (`handleBanksLearn` → `model_unavailable`). Cette spec ajoute (1) le
**mécanisme de téléchargement** (inexistant aujourd'hui — le modèle est posé à la main) et
(2) l'**UX de décision** qui manque.

## 2. Privacy (non négociable)

- Aucun transfert de données utilisateur. Le **seul** flux sortant est le téléchargement
  du modèle, déjà autorisé par ADR-002 / CLAUDE.md.
- Le téléchargement vit **exclusivement dans le main process**. Le renderer ne fait aucun
  I/O réseau ; il pilote tout via **IPC typés**.
- **CSP `'self'` inchangée.**
- Le checksum SHA-256 épinglé sert d'intégrité et de garde anti-altération du binaire.

## 3. Ce que fait le LLM (rappel de cadrage)

Deux usages, en arrière-plan, jamais conversationnels (ADR-009) :

1. **Import** — uniquement pour _apprendre la mise en page d'un PDF de banque inconnue_
   (`inferColumns.ts` → `learnBank.ts`), une fois par banque, puis mémorisée et réutilisée.
   **CSV et OFX n'ont jamais besoin du LLM.**
2. **Catégorisation** — classe en lot les opérations « à catégoriser » dans les catégories
   existantes (`categorize/llm.ts`). Best-effort ; un choix manuel l'emporte toujours.

Capacités **sans modèle** :

| Action                                           | Sans modèle |
| ------------------------------------------------ | ----------- |
| Import CSV                                       | ✅          |
| Import OFX                                       | ✅          |
| Import PDF d'une banque **déjà apprise**         | ✅          |
| Import PDF d'une banque **inconnue** (1ère fois) | ❌ bloqué   |
| Catégorisation automatique                       | ❌ manuel   |

## 4. Comportement utilisateur — les 4 scénarios

Décisions validées en brainstorming :

- **Placement = juste-à-temps** (proposition au moment où le besoin est concret).
- **Téléchargement = non bloquant**, en arrière-plan.
- **Refus = opt-out explicite** : case « Ne plus me proposer ».

### a) Opérations à catégoriser, modèle absent

Un bandeau **non bloquant** au-dessus de la liste : proposition de catégoriser les N
opérations, action `[Activer]`, fermeture `[✕]`, et case `☐ Ne plus me proposer`.

- Conditions d'affichage : `modelState ∈ {absent, paused}` **et** `uncategorizedCount > 0`
  **et** `optOut === false`.
- Réapparaît à chaque **nouveau** déclencheur (nouvel import produisant des opérations à
  catégoriser). Ne se répète pas en boucle dans la même session.
- Coché « Ne plus me proposer » ⇒ ne réapparaît plus (sauf via Réglages).

### b) Import PDF d'une banque inconnue, modèle absent

Message **lié à une action directe de l'utilisateur**, donc **affiché même si « Ne plus me
proposer » est coché** (l'opt-out ne fait taire que la proposition _spontanée_ de
catégorisation ; ici l'utilisateur a tenté quelque chose qui requiert le modèle).

Deux issues :

1. **« Installer le modèle »** → lance le téléchargement en arrière-plan ; l'import en
   attente **reprend automatiquement** une fois le modèle prêt.
2. **« Importer en CSV/OFX »** → texte court expliquant d'exporter le relevé en CSV ou OFX
   depuis sa banque (ces formats ne nécessitent jamais le modèle).

### c) Pendant le téléchargement (~1,9 Go, plusieurs minutes)

L'app reste **100 % utilisable**. Un indicateur **fin et persistant**, monté dans le
chrome de l'app, affiche la progression (ex. `47 % · 890 Mo / 1,9 Go`). À la fin :

- la boucle de catégorisation se relance automatiquement, **ou**
- l'import PDF en attente (scénario b) est rejoué.

### d) Réglages › IA locale (point d'entrée permanent)

État du modèle (`absent` / `downloading` / `paused` / `ready` / `error`), bouton
_Télécharger_ ou _Supprimer le modèle_, espace disque requis affiché, et _Re-télécharger_
en cas de souci. Jamais bruyant.

## 5. États à couvrir (contrat pour le pass design)

- **Bandeau catégorisation** : visible / masqué (selon la table de vérité), avec case
  opt-out cochée/décochée.
- **Indicateur de progression** : `downloading` (avec %, Mo, total), `paused`, `error`
  (avec action _Reprendre_/_Réessayer_), masqué quand `ready`/`absent`.
- **Dialogue PDF requis** : deux issues (Installer / CSV-OFX).
- **Section Réglages IA locale** : les 5 états du modèle, chacun avec ses actions.

## 6. Architecture

### Main process (tout l'I/O)

- **`src/main/llm/modelManifest.ts`** _(nouveau)_ — constantes : **URL HTTPS épinglée**,
  **SHA-256** attendu, **taille en octets**. À renseigner à l'implémentation depuis le
  dépôt Hugging Face du modèle d'ADR-004 (Llama 3.2 3B Instruct Q4_K_M GGUF,
  `llama-3.2-3b-instruct-q4_k_m.gguf`).
- **`src/main/llm/download.ts`** _(nouveau)_ — le cœur :
  - pré-check d'espace disque (taille + marge) → refus clair sinon ;
  - téléchargement en flux vers `<modelsDir>/<MODEL_FILE>.part`, **reprenable** via requêtes
    HTTP `Range` ;
  - vérification **SHA-256** en fin de téléchargement ;
  - **rename atomique** `.part` → fichier final (jamais de fichier partiel qui passerait
    `isModelAvailable`) ;
  - émet la progression ; gère l'annulation.
  - **Singleton d'état de téléchargement** en main (le download survit à la navigation du
    renderer).
  - Note d'implémentation : `node-llama-cpp` sait télécharger un modèle (cf. ADR-004
    « Consequences »), mais on implémente un flux maison pour maîtriser progression,
    reprise et checksum côté UX.
- **IPC typés** (`src/main/ipc/handlers/model.ts`, _nouveau_) :
  - `model:status` → `{ state, progress?, error? }` avec
    `state ∈ { absent, downloading, paused, ready, error }`
  - `model:download:start`, `model:download:cancel`, `model:remove`
  - **canal d'événements de progression** poussés vers le renderer.
- Réutilise : `isModelAvailable`, `resolveModelPath`, `modelsDir`.

### Renderer (zéro I/O, tout via IPC)

- **`useModelStatus`** _(hook)_ — s'abonne au statut + progression.
- **`<ModelDownloadIndicator>`** — barre fine persistante dans le chrome/layout, visible
  pour `downloading` / `paused` / `error`.
- **`<CategorizationPrompt>`** — bandeau (scénario a), piloté par
  `(modelState, uncategorizedCount, optOut)`.
- **`<PdfModelRequiredDialog>`** — message du scénario b, deux issues.
- **Section Réglages « IA locale »** — statut + actions (scénario d).
- **Opt-out persisté** — réutiliser le mécanisme de préférences existant ; à confirmer au
  moment du plan en inspectant ce qui existe (sinon, petit enregistrement dédié en
  `userData`).

## 7. Flux de données

```
Import terminé ─┐
                ├─ renderer lit: model:status + nb à catégoriser + opt-out
                └─→ si (state∈{absent,paused} && N>0 && !optOut) → bandeau (a)

PDF banque inconnue ─→ learnBank renvoie 'model_unavailable'
                     └─→ dialogue (b), 2 issues ; si "Installer", on mémorise
                         l'import en attente (chemin + banque) côté renderer

"Installer/Activer" ─→ model:download:start
                     └─ main: disk-check → stream .part (Range) → SHA-256 → rename
                        progression ──▶ <ModelDownloadIndicator>
                     └─ à 'ready' : relance la boucle de catégorisation OU
                        rejoue l'import PDF en attente
```

## 8. Gestion des erreurs

- **Coupure réseau** → on garde le `.part`, état `paused`, action _Reprendre_ (repart en
  `Range` depuis la taille du `.part`).
- **Checksum invalide** → suppression du `.part`, message « fichier corrompu », _Réessayer_
  depuis zéro.
- **Disque plein** → bloqué **avant** de commencer, message clair.
- **App fermée pendant le download** → au démarrage, si un `.part` existe sans download
  actif → état `paused`, proposition _Reprendre_.
- Toute action échouée est best-effort et n'empêche **jamais** l'usage manuel de l'app.

## 9. Tests

- **Unitaires `download.ts`** (serveur HTTP factice) : progression, reprise via `Range`,
  checksum OK / KO, rename atomique, pré-check disque, annulation, reprise après `.part`
  existant.
- **Unitaires logique de déclenchement** : table de vérité
  `(modelState, uncategorizedCount, optOut)` → bandeau affiché ou non ; cas PDF bloqué
  affiché **même** si opt-out.
- **Composants (jsdom + RTL)** : bandeau, indicateur (chaque état), dialogue PDF, panneau
  Réglages appellent bien l'IPC. Respect du protocole Vitest 4 (directive
  `// @vitest-environment jsdom` + `afterEach(cleanup)`).
- **E2E** : téléchargement réel impossible (~1,9 Go) → **stub de l'endpoint** avec un petit
  fichier fixture ; vérifier apparition du bandeau, indicateur, contrôles Réglages.

## 10. YAGNI (exclu du MVP)

Pause/reprise manuelle élaborée, choix entre plusieurs modèles, vérification de mise à jour
du modèle, multi-fichiers, auto-update de l'app. On reste sur **un** modèle, **un** flux.

## 11. Points à trancher au moment du plan (pas des blocages de design)

- URL + SHA-256 + taille exacte du GGUF (renseigner le manifest).
- Mécanisme de persistance de l'opt-out (réutiliser l'existant vs dédié).
- API exacte du canal d'événements de progression (abonnement IPC).
