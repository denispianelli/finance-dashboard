# Import Review UI — Design Spec

**Story:** #31b — Import review UI
**Epic:** #23 — Import Pipeline
**Date:** 2026-05-18
**Status:** Approved — ready for implementation planning

---

## 1. Context

The import backend is complete (Story #58): `import:pickFile`, `import:extract`, and
`import:confirm` are wired as IPC channels. This story builds the React UI that
drives those three channels.

The app currently has two pages: Dashboard (placeholder) and Settings. There is no
import entry point in the UI.

## 2. Goal

Give the user a way to load an OFX or PDF file, review the extracted transactions,
and confirm the import — entirely within a modal, without leaving the current page.

## 3. Scope

**In scope:**

- `ImportModal` component with three sequential states (pick → review → result)
- `TransactionReviewTable` with per-row checkboxes (check/uncheck before confirming)
- `useImport` hook encapsulating all IPC calls and local state
- Trigger button on `DashboardPage`
- Toast notification on success
- Inline error display on failure
- OFX `cannot_verify` auto-acknowledgement (no user prompt)
- PDF `cannot_verify` explicit acknowledgement (mandatory checkbox)

**Out of scope:**

- Editing transaction amounts or labels (separate transaction-management story)
- Multi-account selection (single seeded account `acc-lcl-default`)
- Navigation away from the current page on import success
- Categorisation or labelling at import time

## 4. Architecture

### Flow

```
DashboardPage
  └─ <ImportModal open={…} onClose={…}>
       State 1 — Pick:   import:pickFile  →  file info or cancelled
       State 2 — Review: import:extract   →  StatementExtraction
       State 3 — Result: import:confirm   →  insertedCount / error
```

The modal never unmounts mid-flow. State transitions are driven by `useImport`.

### Hook — `useImport`

```ts
type ImportState =
  | { step: 'idle' }
  | { step: 'picking' }
  | { step: 'extracting' }
  | { step: 'review'; extraction: StatementExtraction; filePath: string; selected: Set<string> }
  | { step: 'confirming' }
  | { step: 'error'; message: string };

interface UseImport {
  state: ImportState;
  pickAndExtract: () => Promise<void>;
  toggleTx: (txHash: string) => void;
  toggleAll: () => void;
  confirm: () => Promise<void>;
  reset: () => void;
}
```

`pickAndExtract` calls `import:pickFile` then immediately `import:extract` on
success. The `review` state exposes a `selected` set of `tx_hash` values
(pre-populated with all non-duplicate hashes). `confirm` calls `import:confirm`
passing only selected hashes; it auto-sets `acknowledgedCannotVerify: true` when
`extraction.sourceType === 'ofx'`.

### Components

| Component                | File                                                 | Responsibility                              |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------- |
| `ImportModal`            | `src/renderer/components/ImportModal.tsx`            | Modal shell, renders the correct state view |
| `TransactionReviewTable` | `src/renderer/components/TransactionReviewTable.tsx` | Scrollable table with per-row checkboxes    |
| `DashboardPage`          | `src/renderer/pages/DashboardPage.tsx`               | Adds the trigger button and modal mount     |
| `useImport`              | `src/renderer/hooks/useImport.ts`                    | All IPC calls and state machine             |

Toasts use shadcn/ui `sonner` (or the existing toast primitive if already present).

## 5. Modal states in detail

### State 1 — Pick (initial)

- Drop-zone / "Parcourir…" button (calls `import:pickFile`)
- Subtitle: "OFX recommandé · PDF pour les archives"
- No manual filename input — the native dialog handles file selection
- If `pickFile` returns `cancelled: true`: stays on State 1 silently
- If `pickFile` returns `alreadyImported: true`: transitions to State 2 immediately
  (extract will flag it; the user sees the duplicate summary)

### State 2 — Review

Header bar: filename · period (openingDate → closingDate) · transaction count

**Arithmetic badge** (one of three):

- `✅ Solde vérifié — X €` (green) — `arithmetic.status === 'passed'`
- `⚠️ Solde non vérifiable` (amber, PDF only) — `arithmetic.status === 'cannot_verify'`; shows mandatory checkbox "Je confirme l'import sans vérification du solde"
- `❌ Écart de X €` (red) — `arithmetic.status === 'failed'`; confirm button disabled

**Period overlap banner** (amber, dismissible):

- Shown when `periodOverlap.hasOverlap === true`
- "Ce relevé chevauche un import existant (DD/MM → DD/MM). Vérifiez les doublons ci-dessous."
- Non-blocking — user can still confirm

**Transaction table** (`TransactionReviewTable`):

- Columns: checkbox · date · libellé · montant · statut
- Statut: 🆕 (new, checked by default) or grisé/italique (duplicate, unchecked, non-interactive)
- Select-all checkbox in header (checks/unchecks all non-duplicate rows)
- Scrollable if > ~8 rows

**Footer**:

- "Annuler" — closes modal, resets state
- "Importer N transactions →" — disabled when 0 selected or arithmetic failed or
  PDF cannot_verify not acknowledged

### State 3 — Result

- **Success**: modal closes, toast `"N transactions importées"` (3 s auto-dismiss)
- **Error**: modal stays open, inline error message with a "Fermer" button

## 6. Error messages

| `error` code                   | Message affiché                                               |
| ------------------------------ | ------------------------------------------------------------- |
| `unsupported_format`           | "Format non reconnu. Utilisez un fichier OFX ou PDF."         |
| `malformed_ofx`                | "Fichier OFX invalide ou corrompu."                           |
| `not_pdf`                      | "Le fichier ne semble pas être un PDF valide."                |
| `no_text`                      | "Ce PDF ne contient pas de texte extractible (scan image ?)." |
| `unknown_bank`                 | "Banque non reconnue. Seuls les relevés LCL sont supportés."  |
| `arithmetic_failed`            | "Le solde ne correspond pas aux transactions. Import bloqué." |
| `cannot_verify_unacknowledged` | Ne devrait pas arriver (géré en UI)                           |
| `already_imported`             | "Ce fichier a déjà été importé."                              |

## 7. OFX `cannot_verify` auto-acknowledgement

OFX provides no opening balance (`openingBalance: null` always). The backend
returns `arithmetic.status === 'cannot_verify'` for every OFX import. This is
expected behaviour, not an anomaly.

The UI handles this by:

1. Not displaying any arithmetic warning for OFX imports
2. Automatically passing `acknowledgedCannotVerify: true` in the `import:confirm`
   payload when `extraction.sourceType === 'ofx'`

For PDF, `cannot_verify` is a genuine anomaly (both balances should be present) and
requires the explicit checkbox described in §5.

## 8. Testing strategy

- **Unit — `useImport`**: mock `window.electronAPI.invoke`; test state transitions
  for happy path (pick → review → success), cancellation, already-imported, each
  error code, toggle/untoggle, confirm with 0 selected (disabled).
- **Unit — `TransactionReviewTable`**: renders correct rows; duplicate rows are
  unchecked and non-interactive; select-all toggles only non-duplicate rows.
- **Unit — `ImportModal`**: renders correct state view based on `useImport` state;
  arithmetic badge variants; PDF cannot_verify checkbox gates the confirm button.
- **E2E**: extend `app-launch.test.ts` with a smoke test that opens the modal and
  verifies the pick state renders (no real file needed).
