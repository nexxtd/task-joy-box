import { pgTable, serial, integer, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  avatarUrl: text('avatar_url'),
  googleId: text('google_id').unique(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  subscriptionTier: text('subscription_tier').default('free'),
  subscriptionStatus: text('subscription_status').default('inactive'),
  subscriptionEndsAt: text('subscription_ends_at'),
});

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  token: text('token').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  token: text('token').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  used: boolean('used').default(false).notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
});

export const boards = pgTable('boards', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const columns = pgTable('columns', {
  id: serial('id').primaryKey(),
  boardId: integer('board_id').references(() => boards.id).notNull(),
  title: text('title').notNull(),
  order: integer('order').notNull(),
  color: text('color').default('hsl(var(--muted-foreground))'),
  icon: text('icon'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  boardId: integer('board_id').references(() => boards.id).notNull(),
  columnId: integer('column_id').references(() => columns.id).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority').default('none'),
  dueDate: text('due_date'),
  dueTime: text('due_time'),
  duration: integer('duration'),
  sessionsNeeded: integer('sessions_needed').default(1),
  completed: boolean('completed').default(false),
  completedAt: text('completed_at'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  order: integer('order').notNull(),
  recurrencePattern: text('recurrence_pattern'),
  nextOccurrence: text('next_occurrence'),
});

export const boardSnapshots = pgTable('board_snapshots', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  snapshot: text('snapshot').notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const labels = pgTable('labels', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').references(() => tasks.id).notNull(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
});

export const checklists = pgTable('checklists', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').references(() => tasks.id).notNull(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
});

export const checklistItems = pgTable('checklist_items', {
  id: serial('id').primaryKey(),
  checklistId: integer('checklist_id').references(() => checklists.id).notNull(),
  text: text('text').notNull(),
  completed: text('completed').default('false'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
});

export const aiRequests = pgTable('ai_requests', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  prompt: text('prompt').notNull(),
  response: text('response').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
});

export const googleCalendarTokens = pgTable('google_calendar_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull().unique(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: text('expires_at'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const workspaces = pgTable('workspaces', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: integer('owner_id').references(() => users.id).notNull(),
  inviteCode: text('invite_code').notNull().unique(),
  type: text('type').default('family'),
  maxGroups: integer('max_groups').notNull().default(1),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
  seatTier: text('seat_tier'),
  seatCount: integer('seat_count').notNull().default(1),
  billingStatus: text('billing_status').notNull().default('free'),
  paypalSubscriptionId: text('paypal_subscription_id'),
  paypalCustomerId: text('paypal_customer_id'),
});

export const workspaceMembers = pgTable('workspace_members', {
  id: serial('id').primaryKey(),
  workspaceId: integer('workspace_id').references(() => workspaces.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const groups = pgTable('groups', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  workspaceId: integer('workspace_id').references(() => workspaces.id).notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const groupMembers = pgTable('group_members', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id').references(() => groups.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const sharedTasks = pgTable('shared_tasks', {
  id: serial('id').primaryKey(),
  workspaceId: integer('workspace_id').references(() => workspaces.id).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  assignedToUserId: integer('assigned_to_user_id').references(() => users.id),
  assignedToGroupId: integer('group_id').references(() => groups.id),
  createdByUserId: integer('created_by_user_id').references(() => users.id).notNull(),
  priority: text('priority').default('none'),
  dueDate: text('due_date'),
  status: text('status').default('pending'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  workspaceId: integer('workspace_id').references(() => workspaces.id).notNull(),
  groupId: integer('group_id').references(() => groups.id),
  userId: integer('user_id').references(() => users.id).notNull(),
  message: text('message').notNull(),
  messageType: text('message_type').default('text'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
});

export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  ownerId: integer('owner_id').references(() => users.id).notNull(),
  maxSeats: integer('max_seats').notNull().default(1),
  currentSeats: integer('current_seats').notNull().default(1),
  tier: text('tier').notNull().default('premium'),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const organizationMembers = pgTable('organization_members', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').references(() => organizations.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const notes = pgTable('notes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  color: text('color').notNull(),
  pinned: boolean('pinned').default(false).notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const noteTags = pgTable('note_tags', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const noteTagAssignments = pgTable('note_tag_assignments', {
  id: serial('id').primaryKey(),
  noteId: integer('note_id').references(() => notes.id, { onDelete: 'cascade' }).notNull(),
  tagId: integer('tag_id').references(() => noteTags.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
});

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').default(''),
  color: text('color').default('#3b82f6').notNull(),
  ownerId: integer('owner_id').references(() => users.id).notNull(),
  inviteCode: text('invite_code').notNull().unique(),
  archived: boolean('archived').default(false).notNull(),
  completed: boolean('completed').default(false).notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const projectMembers = pgTable('project_members', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const goals = pgTable('goals', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  progress: integer('progress').default(0).notNull(),
  target: integer('target').notNull(),
  unit: text('unit').notNull(),
  color: text('color').default('hsl(var(--primary))').notNull(),
  category: text('category').default('Personal'),
  timeframe: text('timeframe').default('1month'),
  subGoals: text('sub_goals').default('[]'),
  completed: boolean('completed').default(false),
  completedAt: text('completed_at'),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const habits = pgTable('habits', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  category: text('category').default('Personal').notNull(),
  color: text('color').default('primary').notNull(),
  streak: integer('streak').default(0).notNull(),
  completedDays: text('completed_days').default('[]').notNull(), // JSON array of ISO dates
  dailyTime: integer('daily_time'), // minutes per day required
  durationDays: integer('duration_days'), // e.g. 30, 60, 90 days
  displayOrder: integer('display_order').default(0),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const userSettings = pgTable('user_settings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull().unique(),

  // Appearance
  theme: text('theme').default('system'),
  fontFamily: text('font_family').default('Inter'),
  fontSize: text('font_size').default('medium'), // small | medium | large
  location: text('location').default('United States'),
  accentColor: text('accent_color').default('#111827'),
  accentHsl: text('accent_hsl').default('220 39% 11%'),

  // Language + notifications
  language: text('language').default('English'),
  smartAlerts: boolean('smart_alerts').default(true), // Premium
  emailNotifs: boolean('email_notifs').default(true),   // Free

  // Upcoming task reminders / warnings (Free)
  upcomingTaskReminders: boolean('upcoming_task_reminders').default(true),
  dueTimeWarningEnabled: boolean('due_time_warning_enabled').default(true),
  overdueTaskAlertsEnabled: boolean('overdue_task_alerts_enabled').default(true),
  dailySummaryEnabled: boolean('daily_summary_enabled').default(true),
  habitRemindersEnabled: boolean('habit_reminders_enabled').default(true),
  goalDeadlineAlertsEnabled: boolean('goal_deadline_alerts_enabled').default(true),

  // Notification sound (Free)
  notificationSoundEnabled: boolean('notification_sound_enabled').default(true),

  // DND (do not disturb)
  doNotDisturbEnabled: boolean('do_not_disturb_enabled').default(false),
  doNotDisturbStart: text('do_not_disturb_start').default('22:00'),
  doNotDisturbEnd: text('do_not_disturb_end').default('07:00'),

  autoSortTasks: boolean('autoSortTasks').default(false),
  energyMorning: text('energy_morning').default('medium'),
  energyAfternoon: text('energy_afternoon').default('high'),
  energyEvening: text('energy_evening').default('low'),
  energyTrackerEnabled: boolean('energy_tracker_enabled').default(true),

  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const notificationHistory = pgTable('notification_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
});

export const energyLogs = pgTable('energy_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  date: text('date').notNull(), // Format: YYYY-MM-DD
  timeSlot: text('time_slot').notNull(), // 'morning', 'midday', 'afternoon'
  energyLevel: text('energy_level').notNull(), // 'low', 'medium', 'high'
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
});

export const taskAttachments = pgTable('task_attachments', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').references(() => tasks.id).notNull(),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  fileUrl: text('file_url').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
});

export const coupons = pgTable('coupons', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  discountType: text('discount_type').notNull(),
  discountValue: integer('discount_value').notNull(),
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').default(0).notNull(),
  restrictedToEmail: text('restricted_to_email'),
  expiresAt: text('expires_at'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
});

export const systemSettings = pgTable('system_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  amount: integer('amount').notNull(),
  currency: text('currency').default('USD').notNull(),
  status: text('status').notNull(),
  provider: text('provider').notNull(),
  providerTransactionId: text('provider_transaction_id').notNull().unique(),
  couponId: integer('coupon_id').references(() => coupons.id),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
});

// New table for whiteboards
export const whiteboards = pgTable('whiteboards', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

// New table for whiteboard items
export const whiteboardItems = pgTable('whiteboard_items', {
  id: serial('id').primaryKey(),
  whiteboardId: integer('whiteboard_id').references(() => whiteboards.id).notNull(),
  type: text('type').notNull(), // 'sticky-note', 'text', 'document', 'image', 'shape', 'task', 'mindmap', 'file'
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  width: integer('width').default(200),
  height: integer('height').default(150),
  content: text('content'), // For text content
  color: text('color'), // For color properties
  title: text('title'), // For titles
  tasks: text('tasks'), // JSON string for task lists
  imageUrl: text('image_url'), // For image URLs
  fileUrl: text('file_url'), // For file URLs
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

// New table for whiteboard connections
export const whiteboardConnections = pgTable('whiteboard_connections', {
  id: serial('id').primaryKey(),
  whiteboardId: integer('whiteboard_id').references(() => whiteboards.id).notNull(),
  sourceItemId: integer('source_item_id').references(() => whiteboardItems.id).notNull(),
  targetItemId: integer('target_item_id').references(() => whiteboardItems.id).notNull(),
  connectionType: text('connection_type').default('curved'), // 'straight', 'curved', 'elbow', 'dotted'
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const deepFocusSessions = pgTable('deep_focus_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  taskId: text('task_id'),
  taskName: text('task_name').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  completed: boolean('completed').default(false).notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
});

export const supportTickets = pgTable('support_tickets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  type: text('type').notNull(),
  subject: text('subject').notNull(),
  status: text('status').default('open').notNull(),
  staffReplied: boolean('staff_replied').default(false).notNull(),
  closedAt: text('closed_at'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().notNull(),
});

export const ticketMessages = pgTable('ticket_messages', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id').references(() => supportTickets.id).notNull(),
  senderId: integer('sender_id').references(() => users.id).notNull(),
  senderType: text('sender_type').notNull(),
  message: text('message').notNull(),
  readByUser: boolean('read_by_user').default(false).notNull(),
  readByStaff: boolean('read_by_staff').default(false).notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
});

// Types exported via any to avoid inference issues on Render
export type InsertUser = any;
export type UpdateUser = any;
export type InsertWorkspace = any;
export type UpdateWorkspace = any;
export type InsertWorkspaceMember = any;
export type InsertOrganization = any;
export type UpdateOrganization = any;
export type InsertOrganizationMember = any;
export type InsertChatMessage = any;
export type InsertGoal = any;
export type InsertHabit = any;
export type UpdateUserSettings = any;
