import 'dotenv/config';
import serverless from 'serverless-http';
import { app } from '../server/app.js';
import { initDatabase } from '../server/init-db.js';

let dbInit: Promise<void> | null = null;

function ensureDatabase(): Promise<void> {
  if (!dbInit) {
    dbInit = initDatabase().catch((err) => {
      console.error('initDatabase failed:', err);
      dbInit = null;
      throw err;
    });
  }
  return dbInit;
}

export const config = { maxDuration: 60 };

export const handler = async (req: any, context: any) => {
  try {
    await ensureDatabase();
    return await serverless(app)(req, context);
  } catch (err: any) {
    console.error('Vercel handler crashed:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Server failed to initialize', details: err?.message || String(err) }),
    };
  }
};