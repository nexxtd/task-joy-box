import { Pool } from 'pg';
import 'dotenv/config';

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

async function initSupportTables() {
  const pool = new Pool(buildPoolConfig());
  
  try {
    console.log('Creating support tickets tables...');
    
    // Create support_tickets table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        subject TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        staff_replied BOOLEAN NOT NULL DEFAULT FALSE,
        closed_at TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    // Create ticket_messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_messages (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sender_type TEXT NOT NULL,
        message TEXT NOT NULL,
        read_by_user BOOLEAN NOT NULL DEFAULT FALSE,
        read_by_staff BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    // Create indexes for better performance
    await pool.query(`CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx ON support_tickets(user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ticket_messages_ticket_id_idx ON ticket_messages(ticket_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ticket_messages_sender_id_idx ON ticket_messages(sender_id);`);
    
    console.log('Support tickets tables created successfully!');
  } catch (error) {
    console.error('Error creating support tables:', error);
  } finally {
    await pool.end();
  }
}

initSupportTables();