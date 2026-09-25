import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../shared/schema.js';

if (!process.env.DATABASE_URL || !(process.env.DATABASE_URL.startsWith('postgresql://') || process.env.DATABASE_URL.startsWith('postgres://'))) {
  console.error('\n=============================================================');
  console.error('CRITICAL ERROR: Invalid or missing DATABASE_URL environment variable.');
  console.error('This application requires a PostgreSQL connection string starting with postgresql:// or postgres://');
  console.error('For example: postgresql://postgres:password@db.localhost:5432/postgres');
  console.error('If you are using Supabase, look for the unpooled connection string.');
  console.error('=============================================================\n');
  if (process.env.VERCEL === '1') {
    throw new Error('Missing or invalid DATABASE_URL');
  }
  process.exit(1);
}

const { Pool } = pg;
// Fix: Render free tier cannot connect via IPv6 (ENETUNREACH).
// Supabase direct connection (db.*.supabase.co:5432) resolves to IPv6 only.
// Prefer an explicit pooler URL via SUPABASE_POOLER_URL when set; otherwise
// use DATABASE_URL as-is with SSL. Never fabricate a pooler user from the
// project ref — that breaks non-Supabase DBs and region moves.
function buildPoolConfig(): any {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return {};
  const isServerless = process.env.VERCEL === '1';
  const max = parseInt(process.env.PG_POOL_MAX || (isServerless ? '3' : '10'), 10) || 3;
  const baseOpts: Record<string, any> = {
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max,
    allowExitOnIdle: !isServerless && process.env.NODE_ENV !== 'production',
    statement_timeout: 30000,
    query_timeout: 30000,
  };

  // Explicit pooler override wins (e.g. Supabase 6543 transaction pooler).
  const poolerUrl = process.env.SUPABASE_POOLER_URL;
  if (poolerUrl && (poolerUrl.startsWith('postgresql://') || poolerUrl.startsWith('postgres://'))) {
    return { connectionString: poolerUrl, ...baseOpts, ssl: { rejectUnauthorized: false } };
  }

  const needsSsl =
    process.env.NODE_ENV === 'production' ||
    rawUrl.includes('supabase.co') ||
    rawUrl.includes('pooler.supabase.com') ||
    process.env.PGSSL === '1';
  if (needsSsl) {
    return { connectionString: rawUrl, ...baseOpts, ssl: { rejectUnauthorized: false } };
  }

  return { connectionString: rawUrl, ...baseOpts };
}

export const pool = new Pool(buildPoolConfig());
pool.on('error', (err: any) => {
  console.error('Unexpected pool error:', err?.message || err);
});

export const db = drizzle(pool, { schema });

// Drizzle ORM does not use a raw `eq` function exported from db, 
// eq is imported directly from drizzle-orm where needed.

