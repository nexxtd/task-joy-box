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
  await ensureDatabase();
  return serverless(app)(req, context);
};