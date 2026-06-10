import sodium from 'libsodium-wrappers-sumo';

// Argon2id with INTERACTIVE limits (~64 MiB, ~2 ops): derivation stays under a
// second on desktop hardware, which matters because it runs on every snapshot
// write/restore. The threat model is an encrypted blob sitting in a personal
// sync folder, not an offline cracking target with a weak passphrase.

export async function generateSalt(): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
}

export async function generateNonce(): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
}

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.crypto_pwhash(
    sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
    passphrase,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
}

export async function encrypt(
  plain: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plain, null, null, nonce, key);
}

/**
 * Null on authentication failure — wrong passphrase and corrupt/truncated file
 * are cryptographically indistinguishable, callers must present both causes.
 */
export async function decrypt(
  cipher: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
): Promise<Uint8Array | null> {
  await sodium.ready;
  try {
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, cipher, null, nonce, key);
  } catch {
    return null;
  }
}
