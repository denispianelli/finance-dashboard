import { describe, it, expect } from 'vitest';
import {
  generateSalt,
  generateNonce,
  deriveKey,
  encrypt,
  decrypt,
} from '../../../src/main/sync/crypto';

describe('sync crypto', () => {
  it('round-trips plaintext with the right passphrase', async () => {
    const salt = await generateSalt();
    const nonce = await generateNonce();
    const key = await deriveKey('correct horse battery staple', salt);
    const plain = new TextEncoder().encode('hello snapshot');
    const cipher = await encrypt(plain, key, nonce);
    expect(cipher).not.toEqual(plain);
    const back = await decrypt(cipher, key, nonce);
    expect(back).not.toBeNull();
    if (back === null) throw new Error('decrypt returned null unexpectedly');
    expect(new TextDecoder().decode(back)).toBe('hello snapshot');
  });

  it('returns null with a wrong passphrase', async () => {
    const salt = await generateSalt();
    const nonce = await generateNonce();
    const key = await deriveKey('right', salt);
    const wrongKey = await deriveKey('wrong', salt);
    const cipher = await encrypt(new TextEncoder().encode('secret'), key, nonce);
    expect(await decrypt(cipher, wrongKey, nonce)).toBeNull();
  });

  it('returns null on a truncated ciphertext (MAC failure)', async () => {
    const salt = await generateSalt();
    const nonce = await generateNonce();
    const key = await deriveKey('pw', salt);
    const cipher = await encrypt(new TextEncoder().encode('secret data here'), key, nonce);
    expect(await decrypt(cipher.subarray(0, cipher.length - 4), key, nonce)).toBeNull();
  });

  it('derives the same key for the same passphrase+salt, different for another salt', async () => {
    const salt = await generateSalt();
    const k1 = await deriveKey('pw', salt);
    const k2 = await deriveKey('pw', salt);
    const k3 = await deriveKey('pw', await generateSalt());
    expect(Buffer.from(k1).equals(Buffer.from(k2))).toBe(true);
    expect(Buffer.from(k1).equals(Buffer.from(k3))).toBe(false);
  });
});
