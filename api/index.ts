import { app } from '../server/app.js';
import { initDatabase, initDatabasePoolOnly } from '../server/init-db.js';

let dbInit: Promise<void> | null = null;

function ensureDatabase(): Promise<void> {
  // Vercel serverless functions have tight execution limits — running the
  // full idempotent schema pass on every cold start can exceed them. Tables
  // already exist (created via Render/boot), so on Vercel we only verify the
  // connection instead of re-running every CREATE/ALTER check.
  if (process.env.VERCEL === '1') {
    return initDatabasePoolOnly();
  }
  if (!dbInit) {
    dbInit = initDatabase().catch((err: any) => {
      console.error('initDatabase failed:', err);
      dbInit = null;
      throw err;
    });
  }
  return dbInit;
}

export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  try {
    await ensureDatabase();
    app(req, res);
  } catch (err: any) {
    console.error('Vercel handler crashed:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'Server failed to initialize', details: err?.message || String(err) }));
    } else {
      res.end();
    }
  }
}