import crypto from 'crypto';

// Unambiguous alphabet: no 0/O/1/I so codes read aloud or retyped stay valid.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateShareCode(prefix: 'TASK' | 'NOTE', length = 6): string {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${prefix}-${code}`;
}

export function normalizeShareCode(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
}
