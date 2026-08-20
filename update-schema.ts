import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// This script reads the shared schema file and updates the server index file
// to include all the table creation statements

// Read the shared schema file
const schemaPath = join(__dirname, 'shared', 'schema.ts');
const schemaContent = readFileSync(schemaPath, 'utf-8');

// Extract table definitions and generate SQL
const tableRegex = /export const (\w+) = sqliteTable\([^}]+\}\s*\]\s*\)/g;
let match;
const tables: { name: string; definition: string }[] = [];

while ((match = tableRegex.exec(schemaContent)) !== null) {
  tables.push({
    name: match[1],
    definition: match[0]
  });
}

// Generate SQL table creation statements
const tableSql: Record<string, string> = {};

// For users table
tableSql.users = `
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  avatar_url TEXT,
  google_id TEXT UNIQUE,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  subscription_tier TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'inactive',
  subscription_ends_at TEXT
`;

// For workspaces table - now with PayPal fields instead of Stripe
tableSql.workspaces = `
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  invite_code TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  seat_tier TEXT,              -- 'pro' | 'premium' | null (null = free, owner only)
  seat_count INTEGER DEFAULT 1 NOT NULL,
  billing_status TEXT DEFAULT 'free' NOT NULL, -- 'free' | 'active' | 'past_due' | 'canceled'
  paypal_subscription_id TEXT, -- Replaced stripe_subscription_id
  paypal_customer_id TEXT,     -- Replaced stripe_customer_id
  type TEXT DEFAULT 'family',   -- 'family' | 'organization' (removed 'personal')
  max_groups INTEGER DEFAULT 1 NOT NULL -- Maximum number of groups allowed
`;

// Add other tables as needed...

// Read the server index file
const indexPath = join(__dirname, 'server', 'index.ts');
const indexContent = readFileSync(indexPath, 'utf-8');

// Find the position to insert the table creation statements
const startMarker = 'sqlite.exec(`';
const endMarker = ');';

const startIndex = indexContent.indexOf(startMarker);
const endIndex = indexContent.indexOf(endMarker, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
  // Build the new table creation SQL
  let newSql = '\n    CREATE TABLE IF NOT EXISTS users (\n     ' + tableSql.users + '\n    );\n';
  
  // Add other tables
  if (tableSql.workspaces) {
    newSql += `    CREATE TABLE IF NOT EXISTS workspaces (\n     ${tableSql.workspaces}\n    );\n`;
  }

  // Replace the old SQL with the new one
  const newContent = 
    indexContent.substring(0, startIndex + startMarker.length) +
    newSql +
    indexContent.substring(endIndex);

  // Write the updated content back to the file
  writeFileSync(indexPath, newContent, 'utf-8');
  
  console.log('Schema updated successfully!');
} else {
  console.error('Could not find the table creation section in server/index.ts');
}