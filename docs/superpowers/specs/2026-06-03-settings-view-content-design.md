# Settings view — content design

**Date:** 2026-06-03
**Scope:** Content inventory of the Paramètres view only. UI/UX (layout, hierarchy,
components) is done separately in claude.ai/design and is intentionally out of scope here.
**Status:** Approved (content). No persistence in this iteration — this defines _what_ appears,
not the wiring.

## Context

The current `SettingsPage` (`src/renderer/pages/SettingsPage.tsx`) is a placeholder. The design
spec (`docs/superpowers/specs/2026-05-14-finance-dashboard-design.md` §361) lists for Paramètres:
_Comptes, modèle LLM, OCR on/off, export/backup, thème_. Reality today:

- **Comptes** — already moved to a dedicated `AccountsPage` (PRs #133–#136). Out of this view.
- **Modèle LLM** — `src/main/llm/llm.ts` exists; the model is **fixed** by ADR-004.
- **OCR** — issue #33, not built. **Cut from this view** (see Decisions).
- **Export/backup** — no backend yet.
- **Thème** — dark is default; light is a v2 item.

No `settings`/preferences persistence table exists (migrations 001→007). This iteration is
**structure/content first**; nothing here implies the action is wired yet.

## Legend

- 🟢 **Live-worthy** — has real meaning now (backed by existing code or a self-contained action).
- ⚪ **À venir** — displayed in the mockup but stubbed; backend not built.

## Section 1 — Modèle LLM (informational, read-only + one stub action)

The model is fixed (Llama 3.2 3B Instruct, Q4_K_M GGUF, ~1.9 GB, ADR-004). There is **no model
selection**. The LLM is a background batch classifier only — it never converses and never reasons
over the user's figures (ADR-009).

| Item                       | State | Content                                                                                                                          |
| -------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| Model name                 | 🟢    | _Llama 3.2 3B Instruct · Q4_K_M_                                                                                                 |
| Status                     | 🟢    | _Présent / Absent_ (via `isModelAvailable()`) + size ~1.9 GB                                                                     |
| Role (copy)                | 🟢    | _« Classifie en arrière-plan : mapping de colonnes + catégorisation. Ne dialogue jamais, ne raisonne jamais sur tes chiffres. »_ |
| Model file location        | ⚪    | path to the `.gguf`                                                                                                              |
| Relancer la catégorisation | ⚪    | button — replays the classifier over existing history                                                                            |

## Section 2 — Données & Sauvegarde

Full inventory, including a danger zone. Core of the "100% local" north star.

| Item              | State | Content                               |
| ----------------- | ----- | ------------------------------------- |
| Database location | 🟢    | path to the `.sqlite`                 |
| Database size     | 🟢    | file size                             |
| Export            | 🟢    | transactions → **CSV / JSON**         |
| Backup            | 🟢    | copy the `.sqlite` to a chosen folder |
| Restore           | ⚪    | replace the database from a backup    |
| **Danger zone**   | ⚪    | reset / erase all data                |

## Section 3 — Apparence & divers

| Item     | State | Content                             |
| -------- | ----- | ----------------------------------- |
| Theme    | 🟢/⚪ | _Sombre_ (active) · _Clair_ (⚪ v2) |
| Language | ⚪    | _Français_ (only option)            |

## Decisions

1. **Comptes excluded** — lives in its own view since PRs #133–#136.
2. **Confidentialité / À propos section excluded** — considered, not selected for this iteration.
3. **OCR toggle cut** — #33 is the furthest item on the roadmap (`#75 → #29 → #68 → #34 → #33`);
   no point showing a control that pilots nothing for a long time.
4. **LLM is informational** — fixed model, no selection; the only action is a stubbed
   "Relancer la catégorisation".
5. **No persistence this iteration** — content/structure first; UI/UX handled in claude.ai/design.

## Out of scope (this iteration)

- Actual IPC wiring / persistence for any control.
- A `settings` table or preferences store.
- Light theme implementation (v2).
- OCR (#33), Restore/reset implementation, "Relancer la catégorisation" backend.
