import type { PingPayload, PingResponse } from '@shared/types/ipc';

export function handlePing(payload: PingPayload): PingResponse {
  return { pong: true, receivedAt: payload.now, serverNow: Date.now() };
}
