# Multi-File Import with Learned Account Routing — Design Spec

**Date:** 2026-06-03
**Status:** Draft, pending implementation
**Related ADR:** [ADR-015 — Learned account routing for multi-file import](../../adr/015-account-identifier-routing.md) (Proposed)
**References:** ADR-002 (privacy-first local), ADR-004 (LLM batch classifier only), ADR-006 (multi-level dedup), ADR-007 (Electron security / typed IPC), ADR-008 (OFX primary / PDF backfill, frozen identity contract), ADR-009 (north star, LLM scope), ADR-011 (two-role import), import pipeline spec (`2026-05-17-import-pipeline-backend-design.md`), import review UI spec (`2026-05-18-import-review-ui-design.md`)

---

## 1. Goal

Let the user import **several statements in one pass** (multi-select + drag &
drop), and **stop asking which account each statement belongs to** when the file
identifies it. Routing is learned once per account, then automatic — the same
learn-once-then-silent shape the app already uses for bank layouts.

## 2. Scope

**In scope:**

- Multi-file selection (native `multiSelections`) and a drop zone in the import
  modal.
- A learned identifier→account map (`account_identifiers`), upserted on every
  successful import.
- Deterministic identifier extraction: OFX `BANKID`/`ACCTID`; PDF header
  IBAN/RIB.
- A pre-extraction `import:resolveAccount` step that reads the identifier and
  returns a match (or none).
- A per-file queue: resolve → (auto-route or ask once) → extract → review →
  confirm → next; a final summary.
- Per-file, non-blocking error handling.

**Out of scope:**

- Any LLM involvement in routing (ADR-009 — deterministic only).
- IBAN ↔ OFX `ACCTID` reconciliation (ADR-015 — per-source keys).
- A CSV importer (none exists; `unsupported_format` unchanged).
- Editing/visualising learned routes in Settings (future; cascade-on-delete is
  enough for now).
- "Import all without review" — every file still passes mandatory review
  (ADR-005).

## 3. Architecture overview

The per-file extraction/dedup/overlap pipeline is **unchanged**. Three things
are added around it:

1. **Identifier read + route lookup** (main) — before extraction.
2. **Route learning** (main) — a confirm-time upsert.
3. **A queue** (renderer) — orchestrates N files over the existing per-file flow.

```
pick/drop N paths
   └─ for each path:
        import:resolveAccount(path) ──► { identifier, matchedAccountId, sourceType, detectedBank }
              │ matched      → accountId := matchedAccountId         (auto, silent)
              │ unmatched    → user picks existing / creates account (asked once)
              │ identifier=null → user picks existing / creates      (asked, not learnable)
              ▼
        import:extract(path, accountId)   ── existing, unchanged ──► review
              ▼
        import:confirm(path, accountId, …) ── existing ──► insert
              └─ side effect: upsert account_identifiers(identifier → accountId)
        next file
   └─ summary (auto-routed / created / skipped / failed; total transactions)
```

## 4. Data model

### 4.1 Migration `010_account_identifiers.sql`

```sql
CREATE TABLE account_identifiers (
  identifier TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
);
```

- `identifier` is the normalized, source-specific key (§5). PRIMARY KEY ⇒ one
  identifier maps to exactly one account.
- `ON DELETE CASCADE` ⇒ deleting an account drops its routes.
- No timestamp/usage columns — YAGNI; the table is a pure lookup.

### 4.2 Repository (`src/main/db/` or `src/main/import/accountRoutes.ts`)

Two functions, both prepared-statement thin:

- `findAccountByIdentifier(db, identifier): string | null`
- `learnAccountRoute(db, identifier, accountId): void` — `INSERT … ON CONFLICT(identifier) DO UPDATE SET account_id = excluded.account_id`. Upsert, so re-confirming an identifier under a different account re-points it (user-driven correction).

## 5. Identifier extraction & normalization

A single module `src/main/import/accountIdentifier.ts`:

```
readIdentifier(content: Buffer, path: string):
  { identifier: string | null; sourceType: 'ofx' | 'pdf'; detectedBank?: string }
```

- **OFX** — tokenize only as far as needed; read `BANKID` and `ACCTID` from
  `<BANKACCTFROM>`. Key: `ofx:<bankid>:<acctid>` (lower-cased, trimmed). The OFX
  parser (`parseOfx.ts`) gains a `case 'ACCTID'` (and the field on `ParsedOfx`);
  `readIdentifier` reuses it.
- **PDF** — extract **page-1 text only** (not the full transaction parse) and
  regex for a French IBAN (`FR\d{2}[ ]?(?:[0-9A-Z]{4}[ ]?){5}[0-9A-Z]{3}`) or a
  RIB. Key: `iban:<stripped-uppercased>`. If none found → `identifier: null`.
- **Unsupported type** → mirrors existing `unsupported_format` handling.

Normalization rules (one place, tested): strip spaces, upper-case the IBAN body,
lower-case the `ofx:` scheme prefix. Same physical file always yields the same
key.

> Cost note: `resolveAccount` reads only the header/identifier — OFX stops early,
> PDF parses page 1. The full extraction still runs once, later, in
> `import:extract`. No double full-parse.

## 6. IPC contract changes (`src/shared/types/ipc.ts`)

```ts
// changed: pickFile returns many paths, drops unused metadata
export type PickFileResponse =
  | { cancelled: true }
  | { cancelled: false; paths: string[] };

// new channel
export interface ResolveAccountPayload { path: string }
export type ResolveAccountResponse =
  | { ok: true; identifier: string | null; matchedAccountId: string | null;
      sourceType: 'ofx' | 'pdf'; detectedBank: string | null } // detectedBank best-effort: OFX <ORG>, else null
  | { ok: false; error: 'unsupported_format' | 'not_pdf' | 'no_text' };

// IpcContract gains:
'import:resolveAccount': { payload: ResolveAccountPayload; response: ResolveAccountResponse };
```

`ExtractPayload` / `ConfirmPayload` are **unchanged** (`path` + `accountId`).
`import:confirm`'s handler additionally calls `learnAccountRoute` after a
successful insert, reading the identifier via the same module (idempotent
upsert; skipped when `identifier` is null).

> Per ADR-007, every channel stays in the typed `IpcContract`; the preload
> `invoke` bridge is unchanged.

## 7. Drag & drop (preload + renderer)

Electron 42 removed `File.path`. The preload exposes a path resolver:

```ts
// preload.ts
import { webUtils } from 'electron';
// added to the exposed api:
getDroppedPaths: (files: File[]): string[] => files.map((f) => webUtils.getPathForFile(f)),
```

- Renderer drop handler collects `DataTransfer` files → `getDroppedPaths` →
  absolute paths → same queue as the native picker.
- The renderer never reads file contents — only resolves a path string and hands
  it to main (ADR-002/007 intact; CSP unchanged, no network).
- Dropped files bypass the native dialog's extension filter, so the queue
  validates extensions (`pdf`/`csv`/`ofx`); an invalid drop is recorded as
  `failed` in the summary, never sent to `resolveAccount`.

`ElectronAPI` in `ipc.ts` gains the `getDroppedPaths` member; `window.electronAPI`
typing updated accordingly.

## 8. The import queue (`useImport.ts`)

The hook is restructured from a single-file machine into a queue wrapping the
unchanged per-file sub-states.

```ts
type QueuedFile = { path: string; fileName: string };
type FileResult =
  | {
      fileName: string;
      status: 'imported';
      accountName: string;
      insertedCount: number;
      autoRouted: boolean;
    }
  | { fileName: string; status: 'skipped'; reason: string }
  | { fileName: string; status: 'failed'; error: string };

type ImportState =
  | { step: 'idle' }
  | { step: 'queue'; files: QueuedFile[]; index: number; results: FileResult[]; sub: SubState }
  | { step: 'summary'; results: FileResult[] };
```

`SubState` is the current per-file lifecycle, plus a routing entry:

```
resolving                         // import:resolveAccount in flight
| chooseAccount { identifier, detectedBank, sourceType }   // unmatched / null → ask once
| extracting
| unknownBank { accountId }        // existing learn-bank recovery, unchanged
| learning
| review { extraction, accountId, identifier, selected, acknowledgedCannotVerify, autoRouted }
| confirming
| fileError { message }            // recoverable: skip → next
```

Transitions:

- `resolving` → matched ⇒ `extracting` (auto); unmatched/null ⇒ `chooseAccount`.
- `chooseAccount` (user picks/creates) ⇒ `extracting`.
- `extracting` → ok ⇒ `review`; `unknown_bank` ⇒ `unknownBank` (existing);
  other error ⇒ `fileError`.
- `review` → `confirm()` ⇒ `confirming` → ok ⇒ push `imported` result, **learn
  route** (server-side in confirm), advance; error ⇒ `fileError`.
- `fileError` / "skip this file" ⇒ push `skipped`/`failed`, advance.
- After the last file ⇒ `summary`.

`autoRouted` is carried into `review` so the UI can show "→ <account> (auto)".
Single-file import is `files.length === 1` — same machine, summary still shown
(or auto-closed when exactly one imported, matching today's toast-then-close).

## 9. UI (`ImportModal.tsx`)

- **PickView** → **DropPickView**: a drop zone (drag-over styling, Lucide
  `Upload`) plus the existing "Parcourir…" button (now multi-select). No account
  selector here anymore — routing decides the account.
- **ChooseAccountView** (new, replaces up-front account choice, shown only when a
  file is unmatched/`null`): "Compte non reconnu pour `<fichier>`" + the existing
  account `<select>` and inline create-account affordance (reused from today's
  PickView), pre-filling bank from `detectedBank`. Confirms the account for this
  file only.
- **ReviewView**: add a header line "Fichier i/N — `<nom>`" and, when
  `autoRouted`, a subtle "→ `<compte>` (auto)" badge. Add a **"Ignorer ce
  fichier"** action alongside confirm. Confirm label gains "et suivant" when
  more files remain.
- **SummaryView** (new): a list — ✓ importés (n tx, auto/compte), ⊘ ignorés, ✗
  échoués (raison) — and a total. Lucide icons, no emoji (CLAUDE.md). Replaces
  the per-file toast when N > 1; N = 1 keeps the current toast-and-close.

Copy is French, sentence case, `1 234,56 €` formatting, per existing modal.

## 10. Error handling

- **Per-file isolation:** any single-file failure (`unsupported_format`,
  `arithmetic_failed`, refused unknown bank, invalid dropped extension) is
  recorded and the queue advances. A batch never aborts on one bad file.
- **No new global error path.** `resolveAccount` errors (`unsupported_format` /
  `not_pdf` / `no_text`) map to a `failed` file result, not a modal-wide error.
- **`identifier: null`** is **not** an error — it is the manual-pick fallback;
  the file imports normally, it just cannot be learned.
- **Zero-import outcomes are `skipped`, not `failed`.** A confirm returning
  `already_imported`, or a fully-OFX-covered backfill (ADR-011, a normal
  zero-import per that ADR), is recorded as `skipped` with its reason — the file
  was handled correctly, nothing was new.
- Existing extract/confirm `ImportError` codes and messages are unchanged.

## 11. Privacy & security

- Identifier reads and route matching happen in **main**; renderer resolves only
  a path string. No file content crosses into the renderer (ADR-002).
- No network, no new capability surface; CSP stays `'self'`.
- Typed IPC only; new channel registered in `IpcContract` (ADR-007).

## 12. Testing strategy

- **Migration:** `account_identifiers` created; cascade deletes routes when its
  account is deleted.
- **Routes repo:** `findAccountByIdentifier` hit/miss; `learnAccountRoute`
  insert then upsert-repoint.
- **OFX parser:** `ACCTID`/`BANKID` captured from the existing
  `tests/e2e/fixtures/statement.ofx` (`30002` / `1`); key = `ofx:30002:1`.
- **Identifier module:** OFX key; PDF IBAN regex hit and miss (`identifier:
null`); normalization idempotence (spaces/case).
- **resolveAccount handler:** matched → `matchedAccountId`; unmatched → null
  with identifier; unsupported → error.
- **confirm learns route:** after a successful insert with a non-null identifier,
  the route exists; null identifier ⇒ no route written.
- **useImport queue:** 3 files — one auto-routed, one create-account, one
  failed-and-skipped — yields the right summary; account auto-routes on a second
  file sharing the first's identifier; single-file path still works.
- **Drag & drop:** extension validation (invalid → `failed`); `getDroppedPaths`
  mapping (mock `webUtils`).
- **Integration (gitignored LCL fixtures, `it.skipIf(!existsSync)`):** import an
  OFX export → account learned; re-import a second OFX for the same account →
  auto-routed, no prompt.

## 13. Implementation outline (suggested task order)

1. Migration 008 + routes repo (+ tests).
2. OFX `ACCTID` capture + `accountIdentifier.ts` module (+ tests).
3. `import:resolveAccount` handler + IPC types; `import:confirm` learns route
   (+ tests).
4. `PickFileResponse → paths[]` + `multiSelections`; preload `getDroppedPaths`.
5. `useImport` queue refactor (+ tests).
6. `ImportModal`: drop zone, ChooseAccountView, ReviewView tweaks, SummaryView
   (+ component tests).
7. Integration test with LCL fixtures; manual smoke; ADR-015 → Accepted.

## 14. Definition of Done

- Selecting or dropping N statements imports them in one pass, each routed to the
  correct account; an account is asked for at most once, then automatic.
- A second statement sharing a learned identifier imports with no account prompt.
- A PDF without a readable IBAN falls back to a manual pick and imports normally.
- One failing file does not abort the batch; the summary reports per-file
  outcomes.
- Single-file import still works (N = 1).
- Lint clean, `tsc --noEmit` clean, unit tests green, `npm run build` succeeds
  (CLAUDE.md DoD). ADR-015 promoted to Accepted.
