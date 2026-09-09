import { app } from '../server/app.js';
import { initDatabase, initDatabasePoolOnly } from '../server/init-db.js';

let dbInit: Promise<void> | null = null;

function ensureDatabase(): Promise<void> {
  if (process.env.VERCEL === '1') {
    return initDatabasePoolOnly().then(async () => {
      try {
        const { pool } = await import('../server/db.js');
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE`);
        await pool.query(`CREATE TABLE IF NOT EXISTS email_verification_tokens (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, token TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS email_verification_tokens_user_id_idx ON email_verification_tokens(user_id)`);
      } catch {}
    });
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