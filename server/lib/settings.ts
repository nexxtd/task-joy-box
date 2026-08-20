import { db } from '../db.js';
import { systemSettings } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';

// Cached reads of system_settings so hot paths (auth, payments, boards) don't
// hit the DB on every request. Admins bump the cache via invalidateSettingCache
// whenever they PATCH a setting.
const cache = new Map<string, { value: string; ts: number }>();
const TTL = 30_000;

export async function getSetting(key: string, def = ''): Promise<string> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.value;
  try {
    const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
    const value = row?.value ?? def;
    cache.set(key, { value, ts: Date.now() });
    return value;
  } catch {
    return def;
  }
}

export async function getSettingNumber(key: string, def: number): Promise<number> {
  const raw = await getSetting(key);
  if (raw === '') return def;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : def;
}

export async function getSettingBoolean(key: string, def = false): Promise<boolean> {
  const raw = await getSetting(key);
  if (raw === '') return def;
  return raw === 'true';
}

export function invalidateSettingCache(): void {
  cache.clear();
}
