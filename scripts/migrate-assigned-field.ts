import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from '../server/db';

async function runMigrations() {
  console.log('Running database migrations...');
  
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Migrations completed successfully!');
  } catch (error) {
    console.error('Error running migrations:', error);
    process.exit(1);
  }
}

runMigrations();