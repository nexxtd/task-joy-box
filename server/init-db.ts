import { pool } from './db';

export async function initDatabase() {
  try {
    console.log('Initializing database tables...');

    // Create board_snapshots table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS board_snapshots (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        snapshot TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    // Create index on user_id for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS board_snapshots_user_id_idx ON board_snapshots(user_id);
    `);

    // Create habits table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS habits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Personal',
        color TEXT NOT NULL DEFAULT 'primary',
        streak INTEGER NOT NULL DEFAULT 0,
        completed_days TEXT NOT NULL DEFAULT '[]',
        daily_time INTEGER,
        duration_days INTEGER,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    // Create index on user_id for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS habits_user_id_idx ON habits(user_id);
    `);

    // Add energy level columns to user_settings if they don't exist
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'user_settings' AND column_name = 'energy_morning';
    `);

    if (checkColumn.rows.length === 0) {
      await pool.query(`
        ALTER TABLE user_settings 
        ADD COLUMN energy_morning TEXT DEFAULT 'medium',
        ADD COLUMN energy_afternoon TEXT DEFAULT 'high',
        ADD COLUMN energy_evening TEXT DEFAULT 'low';
      `);
      console.log('Added energy level columns to user_settings');
    }

    // Add missing columns to goals table if they don't exist
    const checkGoalsColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'goals' AND column_name = 'timeframe';
    `);

    if (checkGoalsColumns.rows.length === 0) {
      await pool.query(`
        ALTER TABLE goals 
        ADD COLUMN timeframe TEXT DEFAULT '1month',
        ADD COLUMN sub_goals TEXT DEFAULT '[]';
      `);
      console.log('Added timeframe and sub_goals columns to goals table');
    }

    // --- NEW COLUMN MIGRATIONS ---

    // Add missing task columns
    const addColumnIfNotExists = async (table: string, column: string, type: string) => {
      const check = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = $1 AND column_name = $2;
      `, [table, column]);
      if (check.rows.length === 0) {
        await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
        console.log(`Added ${column} to ${table}`);
      }
    };

    // Tasks table new columns
    await addColumnIfNotExists('tasks', 'due_time', 'TEXT');
    await addColumnIfNotExists('tasks', 'duration', 'INTEGER');
    await addColumnIfNotExists('tasks', 'sessions_needed', 'INTEGER DEFAULT 1');
    await addColumnIfNotExists('tasks', 'completed', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists('tasks', 'completed_at', 'TEXT');

    // Habits table new columns
    await addColumnIfNotExists('habits', 'daily_time', 'INTEGER');
    await addColumnIfNotExists('habits', 'duration_days', 'INTEGER');
    await addColumnIfNotExists('habits', 'display_order', 'INTEGER DEFAULT 0');

    // Goals table new columns
    await addColumnIfNotExists('goals', 'category', "TEXT DEFAULT 'Personal'");
    await addColumnIfNotExists('goals', 'completed', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists('goals', 'completed_at', 'TEXT');

    // Columns table new columns
    await addColumnIfNotExists('columns', 'icon', 'TEXT');

    // --- WHITEBOARD TABLES ---
    console.log('Verifying whiteboard tables...');
    
    // Whiteboards table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whiteboards (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    // Whiteboard Items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whiteboard_items (
        id SERIAL PRIMARY KEY,
        whiteboard_id INTEGER NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        width INTEGER DEFAULT 200,
        height INTEGER DEFAULT 150,
        content TEXT,
        color TEXT,
        title TEXT,
        tasks TEXT,
        image_url TEXT,
        file_url TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    // Whiteboard Connections table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whiteboard_connections (
        id SERIAL PRIMARY KEY,
        whiteboard_id INTEGER NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
        source_item_id INTEGER NOT NULL REFERENCES whiteboard_items(id) ON DELETE CASCADE,
        target_item_id INTEGER NOT NULL REFERENCES whiteboard_items(id) ON DELETE CASCADE,
        connection_type TEXT DEFAULT 'curved',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    console.log('Whiteboard tables verified');

    // --- DEEP FOCUS SESSIONS TABLE ---
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deep_focus_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id TEXT,
        task_name TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS deep_focus_sessions_user_id_idx ON deep_focus_sessions(user_id);
    `);
    console.log('Deep focus sessions table verified');

  } catch (error) {
    console.error('Database initialization error:', error);
    // Don't throw - let the server start even if init fails
    // Tables might already exist or be created by migrations
  }
}

