# Epic 1 — Setup & Foundation : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap a working Electron + React + TypeScript desktop app skeleton with shadcn/ui, SQLite, typed IPC, CI, tests, and a documented LLM model selection — ready for Epic 2 (Import Pipeline) to start building features on top.

**Architecture:** Electron main/renderer split with strict isolation (CSP + nodeIntegration off + contextIsolation on). Main process owns disk, DB, and LLM. Renderer is pure React. All cross-boundary communication via typed IPC channels. Build via `electron-vite`. Native dependencies (`better-sqlite3`, `node-llama-cpp`) loaded only in main.

**Tech Stack:** Electron 32+ · TypeScript 5+ · electron-vite · React 18 · Tailwind CSS · shadcn/ui · React Router · better-sqlite3 · node-llama-cpp · Vitest · Playwright (electron) · ESLint + Prettier · GitHub Actions CI

**Spec reference:** `docs/superpowers/specs/2026-05-14-finance-dashboard-design.md`

**Notion references** :

- Epic page: https://www.notion.so/360e531ab5ff817ba4f0e65999e5d78b (EPIC-1, Status: Next)
- ADRs database: https://www.notion.so/148823f3fe9d408eb0031d41c8c8bef8

---

## File Structure

```
finance-dashboard/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── codeql.yml
│   ├── ISSUE_TEMPLATE/
│   │   ├── config.yml
│   │   ├── epic.yml
│   │   ├── story.yml
│   │   ├── bug.yml
│   │   └── spike.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── dependabot.yml
├── .husky/
│   ├── pre-commit
│   └── commit-msg
├── .claude/commands/                    # already exists (sync-notion-*)
├── docs/
│   ├── superpowers/
│   │   ├── specs/                       # spec already pushed
│   │   └── plans/                       # this file
│   └── adr/                             # mirrors Notion ADRs
├── src/
│   ├── main/
│   │   ├── index.ts                     # Electron main entry
│   │   ├── preload.ts                   # preload script
│   │   ├── ipc/
│   │   │   ├── channels.ts              # channel name constants
│   │   │   ├── register.ts              # registers all handlers
│   │   │   └── handlers/
│   │   │       └── ping.ts              # sample handler
│   │   ├── db/
│   │   │   ├── index.ts                 # DB singleton + init
│   │   │   ├── migrate.ts               # migration runner
│   │   │   └── migrations/
│   │   │       └── 001_initial.sql      # tables: accounts, transactions...
│   │   └── llm/
│   │       └── README.md                # spike results + chosen model
│   ├── renderer/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ui/                      # shadcn components
│   │   │   ├── Sidebar.tsx
│   │   │   └── AppShell.tsx
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   ├── ipc/
│   │   │   └── client.ts                # typed wrapper around ipcRenderer
│   │   └── styles/globals.css
│   └── shared/
│       └── types/
│           ├── ipc.ts                   # IPC payloads/responses
│           └── domain.ts                # Account, Transaction, etc.
├── scripts/
│   └── spike-llm.ts                     # benchmark harness
├── tests/
│   ├── unit/
│   │   └── db/migrate.test.ts
│   └── e2e/
│       └── app-launch.test.ts
├── electron.vite.config.ts
├── tailwind.config.ts
├── postcss.config.cjs
├── components.json                      # shadcn config
├── tsconfig.json
├── tsconfig.node.json
├── eslint.config.js
├── .prettierrc
├── .gitignore
├── LICENSE                              # AGPL-3.0
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── commitlint.config.cjs
└── package.json
```

---

## Task 1 : Repository Setup

**Files:**

- Create: `LICENSE`, `README.md`, `.gitignore`, `docs/adr/000-template.md`
- Verify: `docs/superpowers/specs/2026-05-14-finance-dashboard-design.md` is committed

- [ ] **Step 1.1 — Initialize git repository**

```bash
cd /home/denis/finance-dashboard
git init -b main
```

- [ ] **Step 1.2 — Create `.gitignore`**

Create `.gitignore`:

```
node_modules/
dist/
out/
.vite/
*.log
.DS_Store
.env
.env.local
*.sqlite
*.sqlite-journal
.superpowers/
models/
coverage/
.vscode/
.idea/
```

- [ ] **Step 1.3 — Add AGPL-3.0 LICENSE**

```bash
curl -fsSL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE
```

Verify the file exists and starts with `GNU AFFERO GENERAL PUBLIC LICENSE`.

- [ ] **Step 1.4 — Create README.md**

Create `README.md`:

```markdown
# Finance Dashboard

Application desktop personnelle de gestion financière. **Privacy-first** : 100% local, aucune donnée ne quitte la machine.

## Promesse

Tu importes tes relevés bancaires (PDF, CSV, OFX). L'app extrait les transactions de manière déterministe, les catégorise via un LLM embarqué, et fournit un tableau de bord multi-comptes plus des features IA (chat, insights, projections). **Pas de login, pas de connexion bancaire, pas de serveur, pas de télémétrie.**

## Statut

🚧 Phase 0 — Foundation. Pas encore utilisable.

## Stack

Electron · TypeScript · React · shadcn/ui · Tailwind · Recharts · SQLite · node-llama-cpp · Qwen2.5 3B

## Documentation

- [Spec produit + technique](docs/superpowers/specs/2026-05-14-finance-dashboard-design.md)
- [ADRs](docs/adr/)
- [Plans d'implémentation](docs/superpowers/plans/)

## Licence

AGPL-3.0 — voir [LICENSE](LICENSE).
```

- [ ] **Step 1.5 — Create ADR template**

Create `docs/adr/000-template.md`:

```markdown
# ADR-NNN — Title

- **Status** : Proposed | Accepted | Deprecated | Superseded
- **Date** : YYYY-MM-DD
- **Category** : Architecture | Data | UI | Security | Performance | Process | LLM
- **Supersedes** : ADR-XXX (if applicable)

## Context

What is the problem we're solving? What are the constraints?

## Decision

What did we decide?

## Alternatives considered

What else did we evaluate? Why did we not choose them?

## Consequences

What becomes easier? What becomes harder? What new risks does this introduce?
```

- [ ] **Step 1.6 — First commit**

```bash
git add .
git commit -m "chore: initial repo with spec, license, readme"
```

- [ ] **Step 1.7 — Create GitHub repo and push**

```bash
gh repo create denispianelli/finance-dashboard --public --source=. --remote=origin --description "Privacy-first desktop finance dashboard with local LLM"
git push -u origin main
```

Expected: repo visible at `https://github.com/denispianelli/finance-dashboard`.

- [ ] **Step 1.8 — Update Notion Decisions DB with repo URL**

Use Notion MCP to update the entry "Repo GitHub public dès le départ" (DEC-003) to include the actual URL `https://github.com/denispianelli/finance-dashboard`.

Also update the parent page "État actuel" table : `Repo GitHub` → ✅ Créé.

---

## Task 1.5 : GitHub Pro Setup — Templates, Dependabot, CodeQL, Settings

**Files:**

- Create: `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/epic.yml`, `.github/ISSUE_TEMPLATE/story.yml`, `.github/ISSUE_TEMPLATE/bug.yml`, `.github/ISSUE_TEMPLATE/spike.yml`, `.github/ISSUE_TEMPLATE/config.yml`, `.github/dependabot.yml`, `.github/workflows/codeql.yml`, `CHANGELOG.md`, `CONTRIBUTING.md`

- [ ] **Step 1.5.1 — PR template**

Create `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Summary

<!-- Quoi et pourquoi (1-3 lignes) -->

## Linked issues

Closes #

## Type of change

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Docs / ADR
- [ ] Build / CI
- [ ] Test

## Checklist

- [ ] Tests added/updated (or N/A)
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] Spec/ADR updated if architecture changed
- [ ] Notion Epic/Decision updated if applicable

## Screenshots (UI changes)

<!-- Drag & drop -->
```

- [ ] **Step 1.5.2 — Issue template config (forces structured templates)**

Create `.github/ISSUE_TEMPLATE/config.yml`:

```yaml
blank_issues_enabled: false
contact_links:
  - name: 💬 Discussions
    url: https://github.com/denispianelli/finance-dashboard/discussions
    about: Questions, idées, propositions ne nécessitant pas un ticket.
```

- [ ] **Step 1.5.3 — Epic template**

Create `.github/ISSUE_TEMPLATE/epic.yml`:

```yaml
name: 🎯 Epic
description: Macro-task representing a phase of work.
title: 'Epic — '
labels: ['epic']
body:
  - type: input
    id: notion
    attributes:
      label: Notion EPIC URL
      placeholder: https://www.notion.so/...
    validations: { required: true }
  - type: dropdown
    id: phase
    attributes:
      label: Phase
      options:
        [
          'Phase 0 — Foundation',
          'Phase 1 — Import',
          'Phase 2 — Dashboard',
          'Phase 3 — Catégorisation',
          'Phase 4 — IA',
          'Phase 5 — Robustesse',
          'Phase 6 — Distribution',
        ]
    validations: { required: true }
  - type: textarea
    id: description
    attributes:
      label: Description
      description: Why this Epic exists, what it delivers.
    validations: { required: true }
  - type: textarea
    id: dod
    attributes:
      label: Definition of Done
      value: |
        - [ ] All stories merged
        - [ ] CI green
        - [ ] Notion EPIC entry set to Done with status, dates
        - [ ] Relevant ADRs created/updated
    validations: { required: true }
```

- [ ] **Step 1.5.4 — Story template**

Create `.github/ISSUE_TEMPLATE/story.yml`:

```yaml
name: 📘 Story
description: User-facing story under an Epic.
title: 'Story — '
labels: ['story']
body:
  - type: input
    id: epic
    attributes:
      label: Parent Epic
      placeholder: '#<epic-issue-number>'
    validations: { required: true }
  - type: textarea
    id: user-story
    attributes:
      label: User story
      value: |
        En tant qu'**[utilisateur]**, je veux **[action]** afin de **[bénéfice]**.
    validations: { required: true }
  - type: textarea
    id: acceptance
    attributes:
      label: Acceptance criteria
      value: |
        - [ ] (Critère 1)
        - [ ] (Critère 2)
    validations: { required: true }
  - type: textarea
    id: tasks
    attributes:
      label: Implementation tasks (high level)
      description: Bullet list, will be detailed during execution.
```

- [ ] **Step 1.5.5 — Bug template**

Create `.github/ISSUE_TEMPLATE/bug.yml`:

```yaml
name: 🐛 Bug
description: Something is broken.
title: 'Bug — '
labels: ['bug']
body:
  - type: textarea
    id: expected
    attributes: { label: Expected behavior }
    validations: { required: true }
  - type: textarea
    id: actual
    attributes: { label: Actual behavior }
    validations: { required: true }
  - type: textarea
    id: repro
    attributes:
      label: Steps to reproduce
      value: |
        1.
        2.
        3.
    validations: { required: true }
  - type: input
    id: env
    attributes:
      label: Environment
      placeholder: 'OS, app version, Node version'
    validations: { required: true }
```

- [ ] **Step 1.5.6 — Spike template**

Create `.github/ISSUE_TEMPLATE/spike.yml`:

```yaml
name: 🔬 Spike
description: Time-boxed research task.
title: 'Spike — '
labels: ['spike']
body:
  - type: input
    id: timebox
    attributes:
      label: Time-box
      placeholder: 'ex: 2 days'
    validations: { required: true }
  - type: textarea
    id: question
    attributes:
      label: Question being answered
    validations: { required: true }
  - type: textarea
    id: deliverable
    attributes:
      label: Deliverable
      description: Document / ADR / decision that closes the spike.
    validations: { required: true }
```

- [ ] **Step 1.5.7 — Dependabot**

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: '/'
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 5
    groups:
      dev-deps:
        dependency-type: development
        update-types: [minor, patch]
      prod-deps:
        dependency-type: production
        update-types: [patch]
  - package-ecosystem: github-actions
    directory: '/'
    schedule:
      interval: monthly
```

- [ ] **Step 1.5.8 — CodeQL workflow**

Create `.github/workflows/codeql.yml`:

```yaml
name: CodeQL

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 8 * * 1'

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write
    strategy:
      matrix:
        language: [javascript-typescript]
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}
      - uses: github/codeql-action/autobuild@v3
      - uses: github/codeql-action/analyze@v3
```

- [ ] **Step 1.5.9 — CHANGELOG.md**

Create `CHANGELOG.md`:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial repository scaffold (Phase 0 — Foundation)
```

- [ ] **Step 1.5.10 — CONTRIBUTING.md**

Create `CONTRIBUTING.md`:

```markdown
# Contributing

## Branches

- `main` is protected. No direct pushes.
- Feature branches : `feat/<epic-short>-<slug>` (e.g. `feat/foundation-ipc-bridge`)
- Fix branches : `fix/<slug>`
- All changes land via Pull Requests.

## Commits

We use [Conventional Commits](https://www.conventionalcommits.org/) :

- `feat:` — new feature
- `fix:` — bug fix
- `chore:` — maintenance
- `docs:` — documentation
- `test:` — tests only
- `refactor:` — code change that's neither feat nor fix
- `ci:` — CI/build changes
- `perf:` — performance improvement

`commitlint` enforces the convention; husky runs it on commit.

## Pull Requests

- One Epic-story-or-task per PR
- Use the PR template
- CI must be green
- Spec/ADR updates if architecture changes
- Squash merge — `main` keeps a clean linear history

## Issues

Use the issue templates (Epic, Story, Bug, Spike). Blank issues are disabled.

## Linked tools

- Specs and ADRs : Notion workspace (link in README)
- Board : GitHub Projects
```

- [ ] **Step 1.5.11 — Commit**

```bash
git add .github CHANGELOG.md CONTRIBUTING.md
git commit -m "chore: github pro setup — templates, dependabot, codeql, contributing"
git push
```

---

## Task 2 : Electron + Vite + React + TypeScript Skeleton

**Files:**

- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `electron.vite.config.ts`, `src/main/index.ts`, `src/main/preload.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`

- [ ] **Step 2.1 — Initialize package.json**

```bash
npm init -y
```

Then edit `package.json` to set:

```json
{
  "name": "finance-dashboard",
  "version": "0.1.0",
  "description": "Privacy-first desktop finance dashboard with local LLM",
  "main": "out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --max-warnings 0",
    "format": "prettier --write src"
  },
  "license": "AGPL-3.0-only",
  "author": "Denis Pianelli",
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 2.2 — Install Electron + Vite + React + TS**

```bash
npm i -D electron@latest electron-vite vite typescript @types/node
npm i -D @vitejs/plugin-react
npm i react react-dom react-router-dom
npm i -D @types/react @types/react-dom
```

- [ ] **Step 2.3 — Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": "./",
    "paths": {
      "@main/*": ["src/main/*"],
      "@renderer/*": ["src/renderer/*"],
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", "out"]
}
```

- [ ] **Step 2.4 — Create `electron.vite.config.ts`**

```typescript
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'src/main'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/preload.ts') },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    plugins: [react()],
  },
});
```

- [ ] **Step 2.5 — Create Electron main entry**

Create `src/main/index.ts`:

```typescript
import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'Finance Dashboard',
    backgroundColor: '#0f0f18',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 2.6 — Create preload script**

Create `src/main/preload.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  invoke: <T>(channel: string, ...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args),
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
```

- [ ] **Step 2.7 — Create renderer entry**

Create `src/renderer/index.html`:

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';"
    />
    <title>Finance Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

Create `src/renderer/main.tsx`:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Create `src/renderer/App.tsx`:

```typescript
export default function App() {
  return (
    <div style={{ color: '#fff', padding: 32, fontFamily: 'system-ui' }}>
      <h1>Finance Dashboard</h1>
      <p>Phase 0 — Foundation. Skeleton up and running.</p>
    </div>
  );
}
```

- [ ] **Step 2.8 — Run dev mode and verify**

```bash
npm run dev
```

Expected: Electron window opens, dark background, "Finance Dashboard" heading visible. Close the window after verifying.

- [ ] **Step 2.9 — Commit**

```bash
git add .
git commit -m "feat: electron + vite + react skeleton with CSP"
```

---

## Task 3 : Tailwind + shadcn/ui Setup with Dark Theme

**Files:**

- Create: `tailwind.config.ts`, `postcss.config.cjs`, `src/renderer/styles/globals.css`, `components.json`
- Modify: `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/renderer/index.html`

- [ ] **Step 3.1 — Install Tailwind**

```bash
npm i -D tailwindcss@latest postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 3.2 — Configure `tailwind.config.ts`**

Replace the generated config:

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        border: 'hsl(var(--border))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3.3 — Create globals.css with theme variables**

Create `src/renderer/styles/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 240 24% 6%;
    --foreground: 0 0% 98%;
    --muted: 240 12% 16%;
    --muted-foreground: 240 5% 64%;
    --border: 240 12% 18%;
    --primary: 263 80% 75%;
    --primary-foreground: 240 24% 6%;
    --card: 240 16% 10%;
    --card-foreground: 0 0% 98%;
  }
  html,
  body,
  #root {
    height: 100%;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
  }
  body {
    font-family:
      ui-sans-serif,
      system-ui,
      -apple-system,
      'Segoe UI',
      Roboto,
      sans-serif;
    -webkit-font-smoothing: antialiased;
  }
}
```

- [ ] **Step 3.4 — Import globals.css in renderer**

Update `src/renderer/main.tsx` to import styles:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 3.5 — Initialize shadcn/ui**

```bash
npx shadcn@latest init -d
```

Choose: TypeScript yes, style "default", base color "neutral", CSS variables yes. When prompted for components.json paths, set `src/renderer` as the renderer root.

Verify `components.json` and `src/renderer/lib/utils.ts` were created.

- [ ] **Step 3.6 — Add core shadcn components**

```bash
npx shadcn@latest add button card
```

Verify `src/renderer/components/ui/button.tsx` and `card.tsx` exist.

- [ ] **Step 3.7 — Update App.tsx to use shadcn**

```typescript
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';

export default function App() {
  return (
    <div className="min-h-screen p-8">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Finance Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">Phase 0 — Foundation. shadcn/ui + dark theme.</p>
          <Button>Test button</Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3.8 — Run dev mode and verify**

```bash
npm run dev
```

Expected: dark theme rendered, shadcn Card with title, working button.

- [ ] **Step 3.9 — Commit**

```bash
git add .
git commit -m "feat: tailwind + shadcn/ui with dark theme"
```

---

## Task 4 : Typed IPC Bridge

**Files:**

- Create: `src/shared/types/ipc.ts`, `src/main/ipc/channels.ts`, `src/main/ipc/register.ts`, `src/main/ipc/handlers/ping.ts`, `src/renderer/ipc/client.ts`
- Modify: `src/main/index.ts`, `src/main/preload.ts`, `src/renderer/App.tsx`

- [ ] **Step 4.1 — Define shared IPC types**

Create `src/shared/types/ipc.ts`:

```typescript
export type PingPayload = { now: number };
export type PingResponse = { pong: true; receivedAt: number; serverNow: number };

export interface IpcContract {
  'app:ping': { payload: PingPayload; response: PingResponse };
}

export type IpcChannel = keyof IpcContract;
export type IpcPayload<C extends IpcChannel> = IpcContract[C]['payload'];
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response'];
```

- [ ] **Step 4.2 — Channel name constants**

Create `src/main/ipc/channels.ts`:

```typescript
export const CHANNELS = {
  appPing: 'app:ping',
} as const;
```

- [ ] **Step 4.3 — First handler : ping**

Create `src/main/ipc/handlers/ping.ts`:

```typescript
import type { PingPayload, PingResponse } from '@shared/types/ipc';

export function handlePing(payload: PingPayload): PingResponse {
  return { pong: true, receivedAt: payload.now, serverNow: Date.now() };
}
```

- [ ] **Step 4.4 — Register handlers**

Create `src/main/ipc/register.ts`:

```typescript
import { ipcMain } from 'electron';
import type { IpcChannel, IpcPayload, IpcResponse } from '@shared/types/ipc';
import { CHANNELS } from './channels';
import { handlePing } from './handlers/ping';

type Handler<C extends IpcChannel> = (
  payload: IpcPayload<C>,
) => IpcResponse<C> | Promise<IpcResponse<C>>;

function register<C extends IpcChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, async (_event, payload: IpcPayload<C>) => handler(payload));
}

export function registerAllHandlers(): void {
  register(CHANNELS.appPing, handlePing);
}
```

- [ ] **Step 4.5 — Wire registration in main**

Update `src/main/index.ts` to call `registerAllHandlers()` inside `app.whenReady()` before `createWindow()`:

```typescript
import { registerAllHandlers } from './ipc/register';

void app.whenReady().then(() => {
  registerAllHandlers();
  createWindow();
  // ...
});
```

- [ ] **Step 4.6 — Type the preload bridge**

Update `src/main/preload.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcChannel, IpcPayload, IpcResponse } from '@shared/types/ipc';

const api = {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>): Promise<IpcResponse<C>> =>
    ipcRenderer.invoke(channel, payload),
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
```

- [ ] **Step 4.7 — Typed renderer client**

Create `src/renderer/ipc/client.ts`:

```typescript
import type { IpcChannel, IpcPayload, IpcResponse } from '@shared/types/ipc';

declare global {
  interface Window {
    electronAPI: {
      invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>) => Promise<IpcResponse<C>>;
    };
  }
}

export const ipc = {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>): Promise<IpcResponse<C>> =>
    window.electronAPI.invoke(channel, payload),
};
```

- [ ] **Step 4.8 — Use IPC in App.tsx to verify**

```typescript
import { useState } from 'react';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { ipc } from './ipc/client';

export default function App() {
  const [pong, setPong] = useState<string>('');

  async function ping() {
    const result = await ipc.invoke('app:ping', { now: Date.now() });
    setPong(`pong roundtrip: ${result.serverNow - result.receivedAt}ms`);
  }

  return (
    <div className="min-h-screen p-8">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Finance Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">IPC test</p>
          <Button onClick={ping}>Ping main</Button>
          {pong && <p className="text-sm">{pong}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4.9 — Run and verify**

```bash
npm run dev
```

Click "Ping main", expect "pong roundtrip: Xms" displayed.

- [ ] **Step 4.10 — Commit**

```bash
git add .
git commit -m "feat: typed IPC bridge with ping handler"
```

---

## Task 5 : SQLite Setup with Migrations

**Files:**

- Create: `src/main/db/index.ts`, `src/main/db/migrate.ts`, `src/main/db/migrations/001_initial.sql`, `tests/unit/db/migrate.test.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 5.1 — Install better-sqlite3**

```bash
npm i better-sqlite3
npm i -D @types/better-sqlite3
```

- [ ] **Step 5.2 — Create initial schema migration**

Create `src/main/db/migrations/001_initial.sql`:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  bank_id TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE banks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  detected_signature TEXT
);

CREATE TABLE bank_column_mappings (
  bank_id TEXT NOT NULL,
  format_version TEXT NOT NULL,
  date_col INTEGER NOT NULL,
  label_col INTEGER NOT NULL,
  debit_col INTEGER,
  credit_col INTEGER,
  balance_col INTEGER,
  PRIMARY KEY (bank_id, format_version),
  FOREIGN KEY (bank_id) REFERENCES banks(id)
);

CREATE TABLE imports (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  file_hash TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL,
  date_range_start TEXT NOT NULL,
  date_range_end TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'pending_review',
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (parent_id) REFERENCES categories(id)
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  import_id TEXT,
  tx_hash TEXT NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  label_raw TEXT NOT NULL,
  label_clean TEXT NOT NULL,
  category_id TEXT,
  confidence REAL,
  is_internal_transfer INTEGER NOT NULL DEFAULT 0,
  user_modified INTEGER NOT NULL DEFAULT 0,
  UNIQUE (account_id, tx_hash),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (import_id) REFERENCES imports(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX idx_transactions_account_date ON transactions(account_id, date);
CREATE INDEX idx_transactions_category ON transactions(category_id);

CREATE TABLE categorization_rules (
  id TEXT PRIMARY KEY,
  match_type TEXT NOT NULL,
  match_value TEXT NOT NULL,
  category_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  hit_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO schema_migrations(version) VALUES (1);
```

- [ ] **Step 5.3 — Migration runner**

Create `src/main/db/migrate.ts`:

```typescript
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

export function runMigrations(db: Database.Database): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
  );
  const appliedVersions = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((r: any) => r.version as number),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const version = Number(file.split('_')[0]);
    if (Number.isNaN(version)) throw new Error(`Bad migration filename: ${file}`);
    if (appliedVersions.has(version)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    db.exec(sql);
  }
}
```

- [ ] **Step 5.4 — DB singleton**

Create `src/main/db/index.ts`:

```typescript
import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { runMigrations } from './migrate';

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const userData = app.getPath('userData');
  mkdirSync(userData, { recursive: true });
  const dbPath = join(userData, 'finance.sqlite');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  dbInstance = db;
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
```

- [ ] **Step 5.5 — Wire DB init in main**

Update `src/main/index.ts` to initialize DB at startup:

```typescript
import { getDb, closeDb } from './db';

void app.whenReady().then(() => {
  getDb(); // init DB before anything else
  registerAllHandlers();
  createWindow();
  // ...
});

app.on('window-all-closed', () => {
  closeDb();
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 5.6 — Write migration test**

Install Vitest first:

```bash
npm i -D vitest
```

Create `tests/unit/db/migrate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/main/db/migrate';

describe('runMigrations', () => {
  it('creates all tables on a fresh database', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name as string);
    expect(tables).toContain('accounts');
    expect(tables).toContain('transactions');
    expect(tables).toContain('categories');
    expect(tables).toContain('imports');
    expect(tables).toContain('bank_column_mappings');
    expect(tables).toContain('categorization_rules');
    db.close();
  });

  it('is idempotent (running twice does not error)', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
    db.close();
  });

  it('records applied versions', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    const versions = db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((r: any) => r.version as number);
    expect(versions).toContain(1);
    db.close();
  });
});
```

- [ ] **Step 5.7 — Configure Vitest**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
});
```

Add scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5.8 — Run tests**

```bash
npm test
```

Expected: 3 tests passing in `migrate.test.ts`.

- [ ] **Step 5.9 — Verify app still launches with DB**

```bash
npm run dev
```

Expected: app starts, no errors in console. DB file created at the userData path (look at console logs for `app.getPath('userData')`).

- [ ] **Step 5.10 — Commit**

```bash
git add .
git commit -m "feat: sqlite setup with initial schema and migration runner"
```

---

## Task 6 : App Shell — Sidebar + Stub Pages + Routing

**Files:**

- Create: `src/renderer/components/AppShell.tsx`, `src/renderer/components/Sidebar.tsx`, `src/renderer/pages/DashboardPage.tsx`, `src/renderer/pages/SettingsPage.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 6.1 — Add shadcn dependencies for nav**

```bash
npx shadcn@latest add separator
```

- [ ] **Step 6.2 — Create Sidebar**

Create `src/renderer/components/Sidebar.tsx`:

```typescript
import { NavLink } from 'react-router-dom';
import { Separator } from './ui/separator';

const items = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/settings', label: 'Paramètres', icon: '⚙️' },
];

export function Sidebar() {
  return (
    <aside className="w-56 border-r border-border bg-card flex flex-col">
      <div className="p-4 font-bold text-primary">💰 Finance Dashboard</div>
      <Separator />
      <nav className="p-2 space-y-1 flex-1">
        {items.map((it) => (
          <NavLink
            key={it.path}
            to={it.path}
            end={it.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            <span>{it.icon}</span>
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-3 text-xs text-muted-foreground">v0.1.0 — Phase 0</div>
    </aside>
  );
}
```

- [ ] **Step 6.3 — Create AppShell**

Create `src/renderer/components/AppShell.tsx`:

```typescript
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function AppShell() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 6.4 — Stub pages**

Create `src/renderer/pages/DashboardPage.tsx`:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <Card>
        <CardHeader><CardTitle>Bienvenue</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">
          Le tableau de bord arrivera en Phase 2. Pour l'instant, c'est juste le shell.
        </CardContent>
      </Card>
    </div>
  );
}
```

Create `src/renderer/pages/SettingsPage.tsx`:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Paramètres</h1>
      <Card>
        <CardHeader><CardTitle>À venir</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">
          Gestion des comptes, modèle LLM, OCR, thème, backup.
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6.5 — Wire router in App.tsx**

```typescript
import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
```

> Why HashRouter: Electron loads pages via `file://` in prod, which breaks BrowserRouter.

- [ ] **Step 6.6 — Run and verify**

```bash
npm run dev
```

Expected: sidebar visible, Dashboard page loads by default, clicking "Paramètres" navigates without reload.

- [ ] **Step 6.7 — Commit**

```bash
git add .
git commit -m "feat: app shell with sidebar and routing"
```

---

## Task 7 : E2E Test with Playwright + ESLint/Prettier

**Files:**

- Create: `tests/e2e/app-launch.test.ts`, `playwright.config.ts`, `eslint.config.js`, `.prettierrc`

- [ ] **Step 7.1 — Install Playwright for Electron**

```bash
npm i -D @playwright/test
```

- [ ] **Step 7.2 — Playwright config**

Create `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'list',
});
```

- [ ] **Step 7.3 — App launch test**

Create `tests/e2e/app-launch.test.ts`:

```typescript
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';

test('app launches and renders dashboard', async () => {
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js')] });
  const window = await app.firstWindow();
  await expect(window.locator('h1')).toContainText('Dashboard');
  await app.close();
});
```

- [ ] **Step 7.4 — Build before E2E**

Add a script in `package.json`:

```json
"test:e2e": "npm run build && playwright test"
```

- [ ] **Step 7.5 — Run E2E**

```bash
npm run test:e2e
```

Expected: 1 test passing.

- [ ] **Step 7.6 — Install ESLint + Prettier**

```bash
npm i -D eslint @eslint/js typescript-eslint prettier eslint-config-prettier
```

- [ ] **Step 7.7 — ESLint config**

Create `eslint.config.js`:

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: { project: './tsconfig.json' },
    },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  { ignores: ['dist/', 'out/', 'node_modules/', '.vite/'] },
);
```

- [ ] **Step 7.8 — Prettier config**

Create `.prettierrc`:

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 7.9 — Run lint and fix what needs fixing**

```bash
npm run lint
```

Fix any errors that appear, then commit. Typical fixes: missing `void` on floating promises, unused imports.

- [ ] **Step 7.10 — Commit**

```bash
git add .
git commit -m "test: e2e launch test + eslint + prettier"
```

---

## Task 8 : GitHub Actions CI

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 8.1 — Create CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  build:
    name: ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: npm run typecheck

      - run: npm run lint

      - run: npm test

      - run: npm run build

      - name: Install Playwright deps (Linux)
        if: matrix.os == 'ubuntu-latest'
        run: npx playwright install --with-deps chromium

      - name: Run E2E (Linux only for now)
        if: matrix.os == 'ubuntu-latest'
        run: xvfb-run --auto-servernum npm run test:e2e
```

- [ ] **Step 8.2 — Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: github actions for typecheck, lint, tests, build (linux/mac/win)"
git push
```

- [ ] **Step 8.3 — Verify CI runs**

```bash
gh run watch
```

Expected: all 3 OS jobs green. If failures, fix them and re-push before moving on.

---

## Task 8.5 : Repo Hardening — Branch Protection, Commitlint, Husky, Repo Settings

**Files:**

- Create: `commitlint.config.cjs`, `.husky/commit-msg`, `.husky/pre-commit`
- Modify: `package.json`

- [ ] **Step 8.5.1 — Install commitlint + husky**

```bash
npm i -D @commitlint/cli @commitlint/config-conventional husky lint-staged
```

- [ ] **Step 8.5.2 — Commitlint config**

Create `commitlint.config.cjs`:

```javascript
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'docs', 'test', 'refactor', 'ci', 'perf', 'style', 'build', 'spike'],
    ],
    'subject-case': [0],
  },
};
```

- [ ] **Step 8.5.3 — Init husky**

```bash
npx husky init
```

This creates `.husky/pre-commit` by default.

- [ ] **Step 8.5.4 — Pre-commit hook**

Replace `.husky/pre-commit` content with:

```bash
npx lint-staged
```

- [ ] **Step 8.5.5 — Commit-msg hook**

Create `.husky/commit-msg`:

```bash
npx --no -- commitlint --edit "$1"
```

Make it executable:

```bash
chmod +x .husky/commit-msg .husky/pre-commit
```

- [ ] **Step 8.5.6 — Lint-staged config**

Add to `package.json`:

```json
"lint-staged": {
  "*.{ts,tsx}": ["eslint --max-warnings 0", "prettier --write"],
  "*.{json,md,yml,yaml}": ["prettier --write"]
},
"scripts": {
  "prepare": "husky"
}
```

Run `npm run prepare` to make sure husky is wired.

- [ ] **Step 8.5.7 — Test commitlint**

Make a deliberately broken commit to verify the hook bites :

```bash
git commit --allow-empty -m "not a conventional commit"
```

Expected: rejected. Then try:

```bash
git commit --allow-empty -m "chore: verify commitlint works"
```

Expected: passes.

- [ ] **Step 8.5.8 — Repo settings via gh CLI**

```bash
gh repo edit denispianelli/finance-dashboard \
  --enable-issues \
  --enable-discussions \
  --enable-wiki=false \
  --delete-branch-on-merge \
  --enable-auto-merge \
  --enable-squash-merge \
  --enable-merge-commit=false \
  --enable-rebase-merge=false
```

> Squash-only = a single tidy commit per PR on `main`.

- [ ] **Step 8.5.9 — Branch protection on `main`**

```bash
gh api -X PUT repos/denispianelli/finance-dashboard/branches/main/protection \
  -F required_status_checks.strict=true \
  -F required_status_checks.contexts[]='ubuntu-latest' \
  -F required_status_checks.contexts[]='macos-latest' \
  -F required_status_checks.contexts[]='windows-latest' \
  -F enforce_admins=false \
  -F required_pull_request_reviews.required_approving_review_count=0 \
  -F required_pull_request_reviews.dismiss_stale_reviews=true \
  -F restrictions= \
  -F allow_force_pushes=false \
  -F allow_deletions=false \
  -F required_linear_history=true \
  -F required_conversation_resolution=true
```

> `required_approving_review_count=0` because solo dev — but CI must still be green.

- [ ] **Step 8.5.10 — Verify**

```bash
gh api repos/denispianelli/finance-dashboard/branches/main/protection | jq '.required_status_checks.contexts, .required_linear_history, .allow_force_pushes'
```

Expected: 3 CI contexts, `required_linear_history: true`, `allow_force_pushes: {enabled: false}`.

- [ ] **Step 8.5.11 — Commit**

```bash
git add .husky commitlint.config.cjs package.json package-lock.json
git commit -m "chore: commitlint + husky + branch protection"
git push
```

> All future merges to `main` now require CI green + squash-only + linear history.

---

## Task 9 : LLM Spike — Benchmark and Decide

**Files:**

- Create: `scripts/spike-llm.ts`, `src/main/llm/README.md`, `docs/adr/004-llm-model-selection.md`

This task is the **critical decision point** of Phase 0. We confirm or change the candidate model (Qwen2.5 3B Instruct) based on real measurements.

- [ ] **Step 9.1 — Install node-llama-cpp**

```bash
npm i node-llama-cpp
```

- [ ] **Step 9.2 — Prepare test PDFs**

In a local untracked folder `./spike-fixtures/` (added to `.gitignore`):

- Put 3 real bank statement PDFs from Denis's banks (anonymized if needed)
- Note the bank name and expected number of transactions for each

The spike script will read the **text** of these PDFs (via `pdfjs-dist`) and feed it to each candidate model with a known prompt.

> Install `pdfjs-dist` too: `npm i pdfjs-dist`

- [ ] **Step 9.3 — Spike script skeleton**

Create `scripts/spike-llm.ts`:

```typescript
import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const MODELS = [
  { name: 'Qwen2.5 3B Instruct Q4_K_M', file: 'qwen2.5-3b-instruct-q4_k_m.gguf' },
  { name: 'Phi-3.5 Mini Q4_K_M', file: 'phi-3.5-mini-instruct-q4_k_m.gguf' },
  { name: 'Llama 3.2 3B Q4_K_M', file: 'llama-3.2-3b-instruct-q4_k_m.gguf' },
];

const FIXTURES = [
  { path: 'spike-fixtures/bnp-01.pdf', bank: 'BNP', expectedTx: 42 },
  { path: 'spike-fixtures/ca-01.pdf', bank: 'Crédit Agricole', expectedTx: 38 },
  { path: 'spike-fixtures/boursorama-01.pdf', bank: 'Boursorama', expectedTx: 51 },
];

const PROMPT = `Voici le texte d'un relevé bancaire. Identifie les colonnes (Date, Libellé, Débit, Crédit, Solde) en donnant pour chacune son numéro d'ordre d'apparition. Réponds en JSON strict.`;

async function pdfToText(path: string): Promise<string> {
  const data = new Uint8Array(readFileSync(resolve(path)));
  const doc = await pdfjs.getDocument({ data }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    out += content.items.map((it: any) => it.str).join(' ') + '\n';
  }
  return out;
}

async function benchModel(modelPath: string, prompts: { name: string; text: string }[]) {
  const llama = await getLlama();
  const t0 = performance.now();
  const model = await llama.loadModel({ modelPath });
  const loadMs = performance.now() - t0;
  const context = await model.createContext();
  const session = new LlamaChatSession({ contextSequence: context.getSequence() });

  const results = [];
  for (const p of prompts) {
    const ti = performance.now();
    const response = await session.prompt(`${PROMPT}\n\n---\n${p.text.slice(0, 8000)}`);
    const ms = performance.now() - ti;
    results.push({ fixture: p.name, ms, responseSnippet: response.slice(0, 300) });
  }

  return { loadMs, results };
}

async function main() {
  const prompts = [];
  for (const f of FIXTURES) {
    prompts.push({ name: f.bank, text: await pdfToText(f.path) });
  }

  for (const m of MODELS) {
    const modelPath = resolve('models', m.file);
    console.log(`\n=== ${m.name} ===`);
    try {
      const r = await benchModel(modelPath, prompts);
      console.log(`load: ${r.loadMs.toFixed(0)}ms`);
      for (const item of r.results) {
        console.log(`  ${item.fixture}: ${item.ms.toFixed(0)}ms`);
        console.log(`    ${item.responseSnippet}...`);
      }
    } catch (err) {
      console.error(`FAILED: ${(err as Error).message}`);
    }
  }
}

void main();
```

- [ ] **Step 9.4 — Download the 3 models manually**

Create `models/` directory (gitignored). Download `.gguf` files from Hugging Face into it:

- `qwen2.5-3b-instruct-q4_k_m.gguf` from `bartowski/Qwen2.5-3B-Instruct-GGUF`
- `phi-3.5-mini-instruct-q4_k_m.gguf` from `bartowski/Phi-3.5-mini-instruct-GGUF`
- `llama-3.2-3b-instruct-q4_k_m.gguf` from `bartowski/Llama-3.2-3B-Instruct-GGUF`

Document the exact source URLs in `src/main/llm/README.md`.

- [ ] **Step 9.5 — Add tsx and run the spike**

```bash
npm i -D tsx
npx tsx scripts/spike-llm.ts | tee spike-results.txt
```

Watch for:

- Total time per fixture per model
- Memory used (look at Activity Monitor / Task Manager)
- JSON quality of the response

- [ ] **Step 9.6 — Write results to README**

Create `src/main/llm/README.md`:

```markdown
# LLM Model — Spike Results

## Date

YYYY-MM-DD (fill in actual date)

## Setup

- Machine : (CPU, RAM, OS)
- Quantization : Q4_K_M for all candidates
- Prompt : "Voici le texte d'un relevé bancaire. Identifie les colonnes..."

## Candidates

| Model               | Size   | Load time | Avg inference | French quality | JSON quality | Verdict |
| ------------------- | ------ | --------- | ------------- | -------------- | ------------ | ------- |
| Qwen2.5 3B Instruct | 2.0 GB | XXXms     | XXXms         | (note /5)      | (note /5)    | ✅/❌   |
| Phi-3.5 Mini        | 2.4 GB | XXXms     | XXXms         | (note /5)      | (note /5)    | ✅/❌   |
| Llama 3.2 3B        | 2.0 GB | XXXms     | XXXms         | (note /5)      | (note /5)    | ✅/❌   |

## Chosen model

**[Model name]** — reason : ...

## Sources

- [Hugging Face links]
```

Fill in real numbers from the spike.

- [ ] **Step 9.7 — Write ADR-004**

Create `docs/adr/004-llm-model-selection.md`:

```markdown
# ADR-004 — LLM model selection

- **Status** : Accepted
- **Date** : YYYY-MM-DD
- **Category** : LLM, Performance
- **Supersedes** : ADR-004 (Proposed, in Notion)

## Context

The app needs a local LLM for column mapping (1× per bank) and transaction categorization. Constraints : runs on CPU, fits in ~2 GB RAM, good French, good structured JSON output.

## Decision

After benchmarking 3 candidates on real bank statements, we selected **[model]** in Q4_K_M quantization.

## Alternatives considered

[Per-model summary with measured numbers — referenced from src/main/llm/README.md]

## Consequences

- Installer downloads ~X GB at install time
- Inference time per bank statement : ~Xs
- Categorization latency per transaction : ~Xms
- Memory footprint at runtime : ~X GB
```

- [ ] **Step 9.8 — Update Notion ADR-004**

Use the Notion MCP to update the existing ADR-004 entry :

- Status : Proposed → Accepted (or replace the model if it changed)
- Add a link to `docs/adr/004-llm-model-selection.md` in the repo
- Update the Summary to reflect the actual chosen model

- [ ] **Step 9.9 — Commit the spike artifacts**

```bash
git add scripts/spike-llm.ts src/main/llm/README.md docs/adr/004-llm-model-selection.md
git commit -m "spike: llm model selection — chose [model] after benchmark"
git push
```

> The `models/` directory and `spike-results.txt` and `spike-fixtures/` stay gitignored (real PDFs and large binaries).

---

## Task 10 : GitHub Project + Epic Issues + Sync Notion

**Files:** none locally — pure project management setup.

- [ ] **Step 10.1 — Create GitHub Project**

```bash
gh project create --owner denispianelli --title "Finance Dashboard"
```

Note the project URL.

- [ ] **Step 10.2 — Create labels**

```bash
gh label create epic --color "8B5CF6" --description "Epic-level work item"
gh label create story --color "3B82F6" --description "User story under an epic"
gh label create task --color "10B981" --description "Concrete task under a story"
gh label create spike --color "F59E0B" --description "Time-boxed research"
gh label create bug --color "EF4444"
gh label create "phase:foundation" --color "6B7280"
gh label create "phase:import" --color "3B82F6"
gh label create "phase:dashboard" --color "8B5CF6"
gh label create "phase:categorization" --color "EC4899"
gh label create "phase:ia" --color "10B981"
gh label create "phase:robustesse" --color "F59E0B"
gh label create "phase:distribution" --color "EF4444"
```

- [ ] **Step 10.3 — Create Epic 1 issue**

```bash
gh issue create --title "Epic 1 — Setup & Foundation" \
  --label epic,phase:foundation \
  --body "$(cat <<'EOF'
## Description

Bootstrap du projet : repo, CI/CD, Electron + React skeleton, IPC typé, SQLite, schéma initial. Inclut le spike LLM.

## Spec

See [docs/superpowers/specs/2026-05-14-finance-dashboard-design.md](../blob/main/docs/superpowers/specs/2026-05-14-finance-dashboard-design.md).

## Plan

See [docs/superpowers/plans/2026-05-14-epic-1-setup-foundation.md](../blob/main/docs/superpowers/plans/2026-05-14-epic-1-setup-foundation.md).

## Notion

EPIC-1 : https://www.notion.so/360e531ab5ff817ba4f0e65999e5d78b

## Definition of Done

- [ ] App launches in dev and prod build
- [ ] Navigation between 2 stub pages working
- [ ] SQLite creates DB on first launch with schema applied
- [ ] LLM model chosen and documented in ADR-004
- [ ] CI pipeline green on Linux + macOS + Windows
- [ ] Notion ADR-004 updated to Accepted with chosen model
EOF
)"
```

Note the issue number (e.g. #1).

- [ ] **Step 10.4 — Add Epic 1 to the Project**

```bash
gh project item-add <PROJECT_NUMBER> --owner denispianelli --url https://github.com/denispianelli/finance-dashboard/issues/1
```

- [ ] **Step 10.5 — Update Notion EPIC-1 with GitHub link**

Use the Notion MCP to update the EPIC-1 entry in the Epics database :

- `GitHub` : URL of the issue
- `Status` : Next → In Progress

- [ ] **Step 10.6 — Update parent page état actuel**

Use the Notion MCP to update the "État actuel" table in the parent page : add a row "GitHub Project" → ✅ Créé.

---

## Final Definition of Done — Epic 1

Verify all of the following before closing the Epic:

**Code & app**

- [ ] `npm run dev` launches the app, sidebar visible, navigation works
- [ ] `npm run build` produces a working production build
- [ ] `npm test` passes (Vitest unit tests including db migrate)
- [ ] `npm run test:e2e` passes (Playwright launches app and checks Dashboard)
- [ ] `npm run lint` returns 0 errors
- [ ] `npm run typecheck` returns 0 errors
- [ ] SQLite DB is created on first launch with all 7 tables
- [ ] IPC `app:ping` roundtrip works from the renderer

**Repo pro setup**

- [ ] LICENSE (AGPL-3.0), README, CHANGELOG, CONTRIBUTING at the repo root
- [ ] `.github/` contains PR template + 4 issue templates + dependabot + codeql
- [ ] commitlint + husky enforce conventional commits locally
- [ ] Branch protection on `main` : CI required, linear history, no force-pushes
- [ ] Repo settings : squash-merge only, auto-delete head branches, wiki off

**CI**

- [ ] CI green on Linux + macOS + Windows
- [ ] CodeQL workflow runs successfully on main

**Docs & decisions**

- [ ] ADR-001 to ADR-006 committed under `docs/adr/` (mirrors of Notion)
- [ ] ADR-004 promoted to "Accepted" in Notion with chosen model + measured numbers
- [ ] Spec committed under `docs/superpowers/specs/`

**Project management**

- [ ] GitHub Project created, Epic 1 issue (#1) added to board
- [ ] Notion EPIC-1 in "In Progress" with GitHub URL filled in
- [ ] Notion parent page "État actuel" table reflects all green checkmarks
- [ ] Notion DEC-003 updated with the real repo URL

When all are checked, close issue #1 on GitHub and mark EPIC-1 as "Done" in the Notion Epics database. Run `/sync-notion-end` to make sure the parent page "État actuel" reflects the new state. Tag a `v0.1.0` release :

```bash
gh release create v0.1.0 --title "v0.1.0 — Phase 0 Foundation" --notes-from-tag
```
