export type ModelState = 'absent' | 'downloading' | 'paused' | 'ready' | 'error';

/** A model identified for the UI: registry id, user-facing label, real byte size. */
export interface ModelInfo {
  id: string;
  label: string;
  sizeBytes: number;
}

export interface ModelStatus {
  state: ModelState;
  receivedBytes?: number;
  totalBytes?: number;
  error?: string;
  /** Best-present model (sync) — drives the "Présent · {label} · {size}" display. */
  active?: ModelInfo;
  /** Download target: the cached hardware selection once detected, else the fallback. */
  target?: ModelInfo;
  /** Set only when ready + a better, not-yet-downloaded model fits the hardware. */
  upgrade?: ModelInfo;
}
