export type ModelState = 'absent' | 'downloading' | 'paused' | 'ready' | 'error';

export interface ModelStatus {
  state: ModelState;
  receivedBytes?: number;
  totalBytes?: number;
  error?: string;
}
