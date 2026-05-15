# ADR-007 — Electron Security Model and Typed IPC Pattern

- **Status** : Accepted
- **Date** : 2026-05-15
- **Category** : Architecture | Security

## Context

Electron apps run two separate processes:

- **Main process** (Node.js): full access to the filesystem, OS, databases, and native modules. Owns all sensitive I/O.
- **Renderer process** (Chromium): renders the React UI. By default it can import Node.js APIs — a critical security risk, because any XSS or malicious dependency could read files or execute arbitrary code on the user's machine.

We need a communication channel between these two processes that:

1. Gives the renderer zero direct access to Node.js APIs
2. Enforces a strict, typed contract for all messages
3. Is auditable: the surface exposed to the renderer is explicit and minimal

## Decision

We adopt the following security configuration and IPC pattern:

### Security Configuration (`BrowserWindow`)

```typescript
webPreferences: {
  contextIsolation: true,   // renderer runs in an isolated JS context
  nodeIntegration: false,   // renderer cannot require() Node modules
  sandbox: true,            // renderer is sandboxed like a browser tab
}
```

- `contextIsolation: true` — the preload script and renderer run in separate JS worlds. Even if renderer JS is compromised, it cannot access Node globals injected by the preload.
- `nodeIntegration: false` — `require`, `process`, `fs`, etc. are not available in the renderer.
- `sandbox: true` — the renderer process runs in a Chromium sandbox with no OS-level access.

### IPC Contract (`src/shared/types/ipc.ts`)

A single `IpcContract` interface defines every channel with its payload and response types:

```typescript
export interface IpcContract {
  'app:ping': { payload: PingPayload; response: PingResponse };
}
```

Utility types `IpcPayload<C>` and `IpcResponse<C>` derive argument and return types from the contract, giving full TypeScript inference on both sides of the bridge.

### Preload Script

The preload runs in a privileged context (has access to `ipcRenderer`) but exposes only one narrow function to the renderer world via `contextBridge`:

```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>) =>
    ipcRenderer.invoke(channel, payload),
});
```

The renderer can call `window.electronAPI.invoke('app:ping', { now })` — nothing else.

### Handler Registration (`src/main/ipc/register.ts`)

A generic `register<C>` function wraps `ipcMain.handle` and enforces that the handler signature matches the contract:

```typescript
function register<C extends IpcChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, async (_event, payload: IpcPayload<C>) => handler(payload));
}
```

All handlers are pure functions (no Electron imports), making them independently unit-testable.

### Renderer IPC Client (`src/renderer/ipc/client.ts`)

A thin wrapper provides typed `invoke` on the renderer side:

```typescript
export const ipc = {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>): Promise<IpcResponse<C>> =>
    window.electronAPI.invoke(channel, payload),
};
```

## Alternatives considered

**`nodeIntegration: true`** — exposes all Node.js APIs to the renderer. Rejected: any XSS vulnerability would give full filesystem access. This is explicitly deprecated by the Electron security guide.

**No contract type (untyped `ipcRenderer.invoke`)** — simpler to start but loses type safety across the process boundary. Rejected: channel name typos and payload shape mismatches become runtime bugs with no compile-time signal.

**Separate IPC layer per feature** — each feature defines its own channel registration. Rejected: impossible to audit the full surface area. A single `IpcContract` makes the entire communication surface visible in one file.

## Consequences

**Easier:**

- Adding a new IPC channel: add one entry to `IpcContract` → TypeScript guides the rest.
- Auditing the renderer's capabilities: read `IpcContract` and the `contextBridge.exposeInMainWorld` call.
- Unit-testing main-process logic: handlers are pure functions, no Electron mock needed.

**Harder:**

- Sending complex objects (class instances, functions, Buffers): `contextBridge` serializes via the structured clone algorithm. Passing non-cloneable values will throw at runtime.
- Streaming / progress updates: `ipcMain.handle` is request/response. Long-running operations will need `ipcRenderer.on` / `ipcMain.webContents.send` (push model), which must be added to the contract separately.

**New risks introduced:**

- None beyond what the pattern solves. The surface is narrower than the defaults.
