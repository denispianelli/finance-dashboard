import { describe, it, expect, vi } from 'vitest';
import { handlePing } from '../../../src/main/ipc/handlers/ping';

describe('handlePing', () => {
  it('returns pong with the received timestamp', () => {
    const now = Date.now();
    const result = handlePing({ now });
    expect(result.pong).toBe(true);
    expect(result.receivedAt).toBe(now);
    expect(result.serverNow).toBeGreaterThanOrEqual(now);
  });

  it('serverNow reflects the time of the call', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const result = handlePing({ now: 999_000 });
    expect(result.serverNow).toBe(1_000_000);
    vi.useRealTimers();
  });
});
