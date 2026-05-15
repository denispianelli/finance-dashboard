import { describe, it, expect } from 'vitest';
import { handlePing } from '../../../src/main/ipc/handlers/ping';

describe('handlePing', () => {
  it('returns pong with the received timestamp', () => {
    const now = Date.now();
    const result = handlePing({ now });
    expect(result.pong).toBe(true);
    expect(result.receivedAt).toBe(now);
    expect(result.serverNow).toBeGreaterThanOrEqual(now);
  });

  it('serverNow is close to now (within 100ms)', () => {
    const now = Date.now();
    const result = handlePing({ now });
    expect(result.serverNow - now).toBeLessThan(100);
  });
});
