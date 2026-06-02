import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema';

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('postgresql://')) {
  console.error('\n=============================================================');
  console.error('CRITICAL ERROR: Invalid or missing DATABASE_URL environment variable.');
  console.error('This application requires a PostgreSQL connection string starting with postgresql://');
  console.error('For example: postgresql://postgres:password@db.localhost:5432/postgres');
  console.error('If you are using Supabase, look for the unpooled connection string.');
  console.error('=============================================================\n');
  process.exit(1);
}

// Disable prefetch as it's causing issues with some operations
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
export const db = drizzle(client, { schema });

// Drizzle ORM does not use a raw `eq` function exported from db, 
// eq is imported directly from drizzle-orm where needed.

