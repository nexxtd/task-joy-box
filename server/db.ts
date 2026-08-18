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
function buildPoolConfig() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return {};

  if (process.env.NODE_ENV === 'production') {
    // Parse the direct connection string and convert to pooler URL
    const parsed = new URL(rawUrl);
    const projectRef = parsed.hostname.replace('db.', '').replace('.supabase.co', '');
    // URL parser doesn't decode percent-encoded password, must decode first then re-encode
    const decodedPassword = decodeURIComponent(parsed.password);
    const poolerUrl = `postgresql://postgres.${projectRef}:${encodeURIComponent(decodedPassword)}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;
    // Debug: log the URL (masked) to verify it's correct
    console.log('Pool config - projectRef:', projectRef);
    console.log('Pool config - username: postgres.' + projectRef);
    console.log('Pool config - URL (masked):', poolerUrl.replace(/:([^:@]+)@/, ':***@'));
    return { connectionString: poolerUrl };
  }

  // In development, decode URL-encoded password for local use
  const dbUrl = rawUrl.replace(/%40/g, '@');
  return { connectionString: dbUrl };
}

export const pool = new Pool(buildPoolConfig());

export const db = drizzle(pool, { schema });

// Drizzle ORM does not use a raw `eq` function exported from db, 
// eq is imported directly from drizzle-orm where needed.

