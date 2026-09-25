import { app } from '../server/app.js';
import { initDatabase, initDatabasePoolOnly } from '../server/init-db.js';

let dbInit: Promise<void> | null = null;
let vercelInit: Promise<void> | null = null;

function ensureDatabase(): Promise<void> {
  if (process.env.VERCEL === '1') {
    if (vercelInit) return vercelInit;
    vercelInit = initDatabasePoolOnly().then(async () => {
      try {
        const { pool } = await import('../server/db.js');
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE`);
        await pool.query(`CREATE TABLE IF NOT EXISTS email_verification_tokens (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, token TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS email_verification_tokens_user_id_idx ON email_verification_tokens(user_id)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS pending_signups (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, password_hash TEXT NOT NULL, token TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS pending_signups_token_idx ON pending_signups(token)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS two_factor_tokens (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, code TEXT NOT NULL, expires_at TEXT NOT NULL, used BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
        // Enable RLS on server-only auth tables (Supabase linter 0013/0023).
        // App connects as table owner (RLS bypassed); no permissive policies,
        // so direct PostgREST/anon access stays denied.
        await pool.query(`ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY`);
        await pool.query(`ALTER TABLE pending_signups ENABLE ROW LEVEL SECURITY`);
        await pool.query(`ALTER TABLE two_factor_tokens ENABLE ROW LEVEL SECURITY`);
        // ── Payment tables required by /api/payment/create-checkout-session ──
        // These were missing on Vercel cold-starts because initDatabasePoolOnly()
        // skipped the full migration. Without them the INSERT into pending_payments
        // throws "relation does not exist" → 500.
        await pool.query(`CREATE TABLE IF NOT EXISTS pending_payments (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, order_id TEXT NOT NULL UNIQUE, tier TEXT NOT NULL, plan_type TEXT, seats INTEGER, org_id INTEGER, coupon_id INTEGER, amount_cents INTEGER NOT NULL, status TEXT DEFAULT 'pending' NOT NULL, created_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS pending_payments_user_id_idx ON pending_payments(user_id)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS transactions (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, amount INTEGER NOT NULL, currency TEXT DEFAULT 'USD' NOT NULL, status TEXT NOT NULL, provider TEXT NOT NULL, provider_transaction_id TEXT NOT NULL UNIQUE, coupon_id INTEGER, created_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS coupons (id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, discount_type TEXT NOT NULL, discount_value INTEGER NOT NULL, max_uses INTEGER, used_count INTEGER DEFAULT 0 NOT NULL, restricted_to_email TEXT, restricted_to_plan TEXT, start_date TEXT, expires_at TEXT, one_time_per_user BOOLEAN DEFAULT FALSE NOT NULL, active BOOLEAN DEFAULT TRUE NOT NULL, sort_order INTEGER DEFAULT 0 NOT NULL, group_id INTEGER, created_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS coupon_redemptions (id SERIAL PRIMARY KEY, coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS system_settings (id SERIAL PRIMARY KEY, key TEXT NOT NULL UNIQUE, value TEXT NOT NULL, description TEXT, updated_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, max_seats INTEGER DEFAULT 1 NOT NULL, current_seats INTEGER DEFAULT 1 NOT NULL, tier TEXT DEFAULT 'premium' NOT NULL, status TEXT DEFAULT 'pending' NOT NULL, created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
        await pool.query(`ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);
        await pool.query(`CREATE INDEX IF NOT EXISTS task_attachments_user_id_idx ON task_attachments(user_id)`);
        await pool.query(`ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS file_data TEXT`);
        await pool.query(`ALTER TABLE milestones ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE NOT NULL`);
      } catch (e) {
        console.error('ensureDatabase (Vercel) migration error:', e);
        vercelInit = null;
        throw e;
      }
    });
    return vercelInit;
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