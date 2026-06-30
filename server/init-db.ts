import { pool } from './db';

export async function initDatabase() {
  try {
    console.log('Initializing database tables...');
    
    // First, check if support_tickets table exists
    const checkSupportTickets = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'support_tickets'
      );
    `);
    
    if (!checkSupportTickets.rows[0].exists) {
      console.log('Creating support tickets tables...');
      
      // Create support_tickets table
      await pool.query(`
        CREATE TABLE support_tickets (
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
        CREATE TABLE ticket_messages (
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
      await pool.query(`CREATE INDEX support_tickets_user_id_idx ON support_tickets(user_id);`);
      await pool.query(`CREATE INDEX support_tickets_status_idx ON support_tickets(status);`);
      await pool.query(`CREATE INDEX ticket_messages_ticket_id_idx ON ticket_messages(ticket_id);`);
      await pool.query(`CREATE INDEX ticket_messages_sender_id_idx ON ticket_messages(sender_id);`);
      
      console.log('Support tickets tables created successfully!');
    }

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
    await addColumnIfNotExists('tasks', 'assigned_to_user_id', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');
    await addColumnIfNotExists('tasks', 'assigned_to_user_name', 'TEXT');

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
    await addColumnIfNotExists('notes', 'pinned', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists('goals', 'pinned', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists('habits', 'pinned', 'BOOLEAN DEFAULT FALSE');

    // User settings table new columns
    await addColumnIfNotExists('user_settings', 'energy_tracker_enabled', 'BOOLEAN DEFAULT TRUE');

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

    // --- PROJECTS TABLES ---
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        color TEXT NOT NULL DEFAULT '#3b82f6',
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invite_code TEXT NOT NULL UNIQUE,
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_members (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(project_id, user_id)
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS project_members_user_id_idx ON project_members(user_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS project_members_project_id_idx ON project_members(project_id);
    `);
    console.log('Project tables verified');

    // --- UNIFIED TAGS TABLE (shared across notes, goals, habits, tasks) ---
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS tags_user_id_idx ON tags(user_id);`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS tags_user_name_idx ON tags(user_id, lower(name));`);

    // One-time migration: copy old note_tags, goal_tags, habit_tags into unified tags table
    for (const oldTable of ['note_tags', 'goal_tags', 'habit_tags']) {
      await pool.query(`
        INSERT INTO tags (user_id, name, color, created_at, updated_at)
        SELECT nt.user_id, nt.name, nt.color, nt.created_at, nt.updated_at
        FROM ${oldTable} nt
        WHERE NOT EXISTS (
          SELECT 1 FROM tags t WHERE t.user_id = nt.user_id AND lower(t.name) = lower(nt.name)
        );
      `);
    }

    // Drop old FK constraints if they still reference the legacy tag tables
    for (const { juncTable } of [
      { juncTable: 'note_tag_assignments' },
      { juncTable: 'goal_tag_assignments' },
      { juncTable: 'habit_tag_assignments' },
    ]) {
      await pool.query(`
        ALTER TABLE ${juncTable} DROP CONSTRAINT IF EXISTS ${juncTable}_tag_id_fkey;
      `).catch(() => {});
    }

    // Update junction table FK constraints to point to tags.id
    // (old tables' tag_id pointed to note_tags/goal_tags/habit_tags — we migrate IDs)
    for (const { juncTable, oldTagTable } of [
      { juncTable: 'note_tag_assignments', oldTagTable: 'note_tags' },
      { juncTable: 'goal_tag_assignments', oldTagTable: 'goal_tags' },
      { juncTable: 'habit_tag_assignments', oldTagTable: 'habit_tags' },
    ]) {
      await pool.query(`
        UPDATE ${juncTable} nta
        SET tag_id = t.id
        FROM ${oldTagTable} nt
        INNER JOIN tags t ON t.user_id = nt.user_id AND lower(t.name) = lower(nt.name)
        WHERE nta.tag_id = nt.id;
      `);

      // Re-add FK constraint pointing to the unified tags table
      await pool.query(`
        ALTER TABLE ${juncTable}
        ADD CONSTRAINT ${juncTable}_tag_id_fkey
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;
      `).catch(() => {});
    }

    // Create junction tables if not exist (for features that may not have them yet)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS note_tag_assignments (
        id SERIAL PRIMARY KEY,
        note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(note_id, tag_id)
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS note_tag_assignments_note_id_idx ON note_tag_assignments(note_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS note_tag_assignments_tag_id_idx ON note_tag_assignments(tag_id);`);

    // Task tag assignments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS task_tag_assignments (
        id SERIAL PRIMARY KEY,
        task_id TEXT NOT NULL,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(task_id, tag_id)
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS task_tag_assignments_task_id_idx ON task_tag_assignments(task_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS task_tag_assignments_tag_id_idx ON task_tag_assignments(tag_id);`);
    console.log('Unified tags tables verified');

    // --- SUPPORT TICKETS TABLES ---
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
    
    console.log('Support tickets tables verified');

    // --- MILESTONES TABLE ---
    await pool.query(`
      CREATE TABLE IF NOT EXISTS milestones (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS milestones_project_id_idx ON milestones(project_id);
    `);
    console.log('Milestones table verified');

    // --- COUPON NEW COLUMNS ---
    await addColumnIfNotExists('coupons', 'restricted_to_plan', 'TEXT');
    await addColumnIfNotExists('coupons', 'start_date', 'TEXT');
    await addColumnIfNotExists('coupons', 'one_time_per_user', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists('coupons', 'sort_order', 'INTEGER DEFAULT 0');

    // --- COUPON REDEMPTIONS TABLE ---
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coupon_redemptions (
        id SERIAL PRIMARY KEY,
        coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_id_idx ON coupon_redemptions(coupon_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS coupon_redemptions_user_id_idx ON coupon_redemptions(user_id);`);
    console.log('Coupon redemptions table verified');

    // --- PROJECT/COLUMN COLUMNS FOR NOTES, GOALS, HABITS ---
    await addColumnIfNotExists('notes', 'project_id', 'INTEGER REFERENCES projects(id) ON DELETE SET NULL');
    await addColumnIfNotExists('notes', 'column_id', 'INTEGER');
    await addColumnIfNotExists('goals', 'project_id', 'INTEGER REFERENCES projects(id) ON DELETE SET NULL');
    await addColumnIfNotExists('goals', 'column_id', 'INTEGER');
    await addColumnIfNotExists('habits', 'project_id', 'INTEGER REFERENCES projects(id) ON DELETE SET NULL');
    await addColumnIfNotExists('habits', 'column_id', 'INTEGER');
    console.log('Project/column columns added to notes, goals, habits');

    // --- JUNCTION TABLES (habit + goal assignments reference unified tags) ---
    await pool.query(`
      CREATE TABLE IF NOT EXISTS habit_tag_assignments (
        id SERIAL PRIMARY KEY,
        habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(habit_id, tag_id)
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS habit_tag_assignments_habit_id_idx ON habit_tag_assignments(habit_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS habit_tag_assignments_tag_id_idx ON habit_tag_assignments(tag_id);`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS goal_tag_assignments (
        id SERIAL PRIMARY KEY,
        goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(goal_id, tag_id)
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS goal_tag_assignments_goal_id_idx ON goal_tag_assignments(goal_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS goal_tag_assignments_tag_id_idx ON goal_tag_assignments(tag_id);`);
    console.log('Junction tables (habit + goal) verified');

    // --- ACTIVITY LOG TABLE ---
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS activity_logs_user_id_idx ON activity_logs(user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS activity_logs_entity_idx ON activity_logs(entity_type, entity_id);`);
    console.log('Activity logs table verified');

    // Task Templates
    await pool.query(`
      CREATE TABLE IF NOT EXISTS task_templates (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        description TEXT DEFAULT '',
        priority TEXT DEFAULT 'medium',
        duration INTEGER,
        start_date TEXT,
        start_time TEXT,
        due_date TEXT,
        due_time TEXT,
        project_id INTEGER,
        column_id TEXT,
        labels TEXT DEFAULT '[]',
        subtasks TEXT DEFAULT '[]',
        checklists TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS task_templates_user_id_idx ON task_templates(user_id);`);
    console.log('Task templates table verified');

  } catch (error) {
    console.error('Database initialization error:', error);
    // Don't throw - let the server start even if init fails
    // Tables might already exist or be created by migrations
  }
}
