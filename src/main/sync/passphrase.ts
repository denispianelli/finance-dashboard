import { safeStorage } from 'electron';
import type { PassphraseCipher } from './state';

/** OS-keychain-backed cipher (Keychain on macOS, DPAPI on Windows). */
export const safeStorageCipher: PassphraseCipher = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
  decrypt: (enc) => safeStorage.decryptString(Buffer.from(enc, 'base64')),
};
