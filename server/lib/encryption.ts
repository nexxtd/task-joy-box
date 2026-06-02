/**
 * AES-256-GCM field-level encryption utility.
 *
 * Encrypted format (Base64-URL):  <iv(12B)>:<authTag(16B)>:<ciphertext>
 * All three parts are Base64-encoded and joined with ':'.
 *
 * The ENCRYPTION_KEY env var must be a 64-character hex string (32 raw bytes).
 * Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;  // 128-bit auth tag

// Sentinel prefix so we can detect already-encrypted values and skip double-encryption
const ENCRYPTED_PREFIX = 'enc:';

function getKey(): Buffer {
  const hexKey = process.env.ENCRYPTION_KEY;
  if (!hexKey) {
    throw new Error(
      'ENCRYPTION_KEY is not set. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  if (hexKey.length !== 64) {
    throw new Error(`ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Got length ${hexKey.length}.`);
  }
  return Buffer.from(hexKey, 'hex');
}

/**
 * Encrypts a plaintext string.
 * Returns a string in the format: enc:<iv_b64>:<tag_b64>:<ciphertext_b64>
 * Returns null/undefined as-is.
 */
export function encrypt(plaintext: string | null | undefined): string | null | undefined {
  if (plaintext == null) return plaintext;
  // Already encrypted — idempotent
  if (plaintext.startsWith(ENCRYPTED_PREFIX)) return plaintext;

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv) as crypto.CipherGCM;

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return (
    ENCRYPTED_PREFIX +
    iv.toString('base64') +
    ':' +
    tag.toString('base64') +
    ':' +
    encrypted.toString('base64')
  );
}

/**
 * Decrypts a previously encrypted string.
 * Returns the original plaintext, or the value untouched if it looks like plaintext.
 * Returns null/undefined as-is.
 */
export function decrypt(ciphertext: string | null | undefined): string | null | undefined {
  if (ciphertext == null) return ciphertext;
  // Not encrypted — return as-is (for backwards compat during migration)
  if (!ciphertext.startsWith(ENCRYPTED_PREFIX)) return ciphertext;

  try {
    const payload = ciphertext.slice(ENCRYPTED_PREFIX.length);
    const parts = payload.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted format');

    const [ivB64, tagB64, dataB64] = parts;
    const key = getKey();
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv) as crypto.DecipherGCM;
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (e) {
    console.error('Decryption failed:', e instanceof Error ? e.message : e);
    // Return a placeholder rather than crashing — this happens when the key changes
    return '[decryption error]';
  }
}

/**
 * Convenience: encrypt only if the value is a non-empty string.
 */
export function encryptField(value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  return encrypt(value);
}

/**
 * Decrypt all specified fields on a DB row object in-place and return the mutated object.
 */
export function decryptRow<T extends Record<string, any>>(
  row: T,
  fields: (keyof T)[]
): T {
  for (const field of fields) {
    if (typeof row[field] === 'string') {
      (row as any)[field] = decrypt(row[field] as string);
    }
  }
  return row;
}

/**
 * Decrypt the specified fields on every row in an array.
 */
export function decryptRows<T extends Record<string, any>>(
  rows: T[],
  fields: (keyof T)[]
): T[] {
  return rows.map(row => decryptRow({ ...row }, fields));
}

/**
 * Returns true if encryption is configured (key exists in env).
 */
export function isEncryptionEnabled(): boolean {
  return !!process.env.ENCRYPTION_KEY;
}
