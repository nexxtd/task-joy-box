import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../shared/schema.js';

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('postgresql://')) {
  console.error('\n=============================================================');
  console.error('CRITICAL ERROR: Invalid or missing DATABASE_URL environment variable.');
  console.error('This application requires a PostgreSQL connection string starting with postgresql://');
  console.error('For example: postgresql://postgres:password@db.localhost:5432/postgres');
  console.error('If you are using Supabase, look for the unpooled connection string.');
  console.error('=============================================================\n');
  process.exit(1);
}

const { Pool } = pg;
// Fix: Render free tier cannot connect via IPv6 (ENETUNREACH).
// Supabase direct connection (db.*.supabase.co:5432) resolves to IPv6 only.
// Use Supabase connection pooler (aws-0-*.pooler.supabase.com:6543) which resolves to IPv4.
function buildPoolConfig(): any {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return {};
  const baseOpts = {
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 10,
    allowExitOnIdle: true,
  };

  if (process.env.NODE_ENV === 'production') {
    if (rawUrl.includes('pooler.supabase.com')) {
      console.log('Pool config - using existing pooler URL (masked):', rawUrl.replace(/:([^:@]+)@/, ':***@'));
      return { connectionString: rawUrl, ...baseOpts };
    }
    try {
      const parsed = new URL(rawUrl);
      const projectRef = parsed.hostname.replace('db.', '').replace('.supabase.co', '');
      const decodedPassword = decodeURIComponent(parsed.password);
      const poolerUrl = `postgresql://postgres.${projectRef}:${encodeURIComponent(decodedPassword)}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;
      console.log('Pool config - projectRef:', projectRef);
      console.log('Pool config - URL (masked):', poolerUrl.replace(/:([^:@]+)@/, ':***@'));
      return { connectionString: poolerUrl, ...baseOpts };
    } catch {
      return { connectionString: rawUrl, ...baseOpts };
    }
  }

  const dbUrl = rawUrl.replace(/%40/g, '@');
  return { connectionString: dbUrl, ...baseOpts };
}

export const pool = new Pool(buildPoolConfig());
pool.on('error', (err: any) => {
  console.error('Unexpected pool error:', err?.message || err);
});

export const db = drizzle(pool, { schema });

// Drizzle ORM does not use a raw `eq` function exported from db, 
// eq is imported directly from drizzle-orm where needed.

