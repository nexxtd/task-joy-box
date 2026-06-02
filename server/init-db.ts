import { db } from './db';
import { sql } from 'drizzle-orm';

export async function initDatabase() {
  try {
    console.log('Checking database connection...');
    
    // Just test the connection instead of creating tables
    // Supabase databases should already have tables created via migrations
    await db.execute(sql`SELECT 1 as connection_test`);
    
    console.log('Database connection verified successfully!');
  } catch (error) {
    console.error('Error connecting to database:', error);
    throw error;
  }
}
