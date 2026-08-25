import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import authRoutes from './routes/auth.js';
import aiRoutes from './routes/ai.js';
import calendarRoutes from './routes/calendar.js';
import paymentRoutes from './routes/payment.js';
import collaborationRoutes from './routes/collaboration.js';
import organizationsRoutes from './routes/organizations.js';
import workspaceRoutes from './routes/workspace.js';
import projectsRoutes from './routes/projects.js';
import goalsRoutes from './routes/goals.js';
import habitsRoutes from './routes/habits.js';
import notesRoutes from './routes/notes.js';
import tagsRoutes from './routes/tags.js';
import settingsRoutes from './routes/settings.js';
import attachmentRoutes from './routes/attachments.js';
import adminRoutes from './routes/admin.js';
import boardRoutes from './routes/boards.js';
import noteBoardRoutes from './routes/noteBoards.js';
import goalBoardRoutes from './routes/goalBoards.js';
import habitBoardRoutes from './routes/habitBoards.js';
import whiteboardsRoutes from './routes/whiteboards.js';
import deepFocusRoutes from './routes/deepFocus.js';
import supportRoutes from './routes/support.js';
import { getSettingBoolean, getSetting } from './lib/settings.js';
import milestonesRoutes from './routes/milestones.js';
import taskTemplatesRoutes from './routes/taskTemplates.js';
import noteTemplatesRoutes from './routes/noteTemplates.js';
import notificationsRoutes from './routes/notifications.js';
import dashboardRoutes from './routes/dashboard.js';
import documentsRoutes from './routes/documents.js';
import path from 'path';
import connectPg from 'connect-pg-simple';
import { pool } from './db.js';
import { initDatabase } from './init-db.js';

const PostgresStore = connectPg(session);
const sessionStore = new PostgresStore({
  pool: pool,
  createTableIfMissing: true
});

sessionStore.on('error', (error: any) => {
  console.error('Session store error:', error);
});

const app = express();
app.disable('x-powered-by');
const isProduction = process.env.NODE_ENV === 'production';
const renderExternalUrl = process.env.RENDER_EXTERNAL_URL || 'https://task-joy-box.onrender.com';
const frontendUrl = process.env.FRONTEND_URL || renderExternalUrl || 'http://localhost:5173';
const sessionSecret = process.env.SESSION_SECRET;
const jwtSecret = process.env.JWT_SECRET;
const crossSiteCookies = process.env.CROSS_SITE_COOKIES === 'true';

const additionalAllowedOrigins = process.env.ADDITIONAL_ALLOWED_ORIGINS?.split(',') || [];
const cfTunnelOrigins = process.env.CF_TUNNEL_URL ? [process.env.CF_TUNNEL_URL] : [];

if (isProduction) {
  const missingVars = ['FRONTEND_URL', 'SESSION_SECRET', 'JWT_SECRET'].filter((key) => !process.env[key]);
  if (missingVars.length > 0) {
    console.error(`MISSING REQUIRED ENVIRONMENT VARIABLES IN PRODUCTION: ${missingVars.join(', ')}`);
  }
} else {
  if (!process.env.SESSION_SECRET) {
    console.warn('WARNING: Using fallback session secret. Set SESSION_SECRET in production.');
  }
  if (!process.env.JWT_SECRET) {
    console.warn('WARNING: Using fallback JWT secret. Set JWT_SECRET in production.');
  }
}

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(compression());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

app.use(globalLimiter);

function normalizeOrigin(url: string) {
  return url.replace(/\/+$/, '');
}
const allowedOrigins = new Set<string>();
if (frontendUrl) {
  const n = normalizeOrigin(frontendUrl);
  allowedOrigins.add(n);
  allowedOrigins.add(n + '/');
}

if (process.env.RENDER_EXTERNAL_URL) {
  const n = normalizeOrigin(process.env.RENDER_EXTERNAL_URL);
  allowedOrigins.add(n);
  allowedOrigins.add(n + '/');
}

if (process.env.NGROK_URL) {
  allowedOrigins.add(process.env.NGROK_URL);
}

if (process.env.CF_TUNNEL_URL) {
  allowedOrigins.add(process.env.CF_TUNNEL_URL);
}

const additionalOriginsVar = process.env.ADDITIONAL_ALLOWED_ORIGINS;
if (additionalOriginsVar) {
  additionalOriginsVar.split(',').forEach(origin => {
    const trimmedOrigin = origin.trim().replace(/\/+$/, '');
    if (trimmedOrigin) {
      allowedOrigins.add(trimmedOrigin);
      allowedOrigins.add(trimmedOrigin + '/');
    }
  });
}

if (!isProduction) {
  allowedOrigins.add('http://localhost:5173');
  allowedOrigins.add('http://127.0.0.1:5173');
  allowedOrigins.add('http://localhost:3000');
  allowedOrigins.add('http://127.0.0.1:3000');
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (!isProduction && /^http:\/\/localhost:\d+$/.test(origin)) {
      return callback(null, true);
    }

    if (!isProduction && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
      return callback(null, true);
    }

    if (!isProduction && (/\.replit\.dev$/.test(origin) || /\.riker\.replit\.dev$/.test(origin))) {
      return callback(null, true);
    }

    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// Vercel's filesystem is read-only except /tmp — write uploads there on Vercel.
const uploadsDir = process.env.VERCEL === '1'
  ? path.join('/tmp', 'uploads')
  : path.join(process.cwd(), 'uploads');

// Serve uploads folder with auth check
if (fs.existsSync(uploadsDir)) {
  app.use('/uploads', (req, res, next) => {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }, express.static(uploadsDir));
}

app.use(session({
  store: sessionStore,
  secret: sessionSecret || 'dev-only-fallback',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: crossSiteCookies ? 'none' : 'lax',
  },
  name: 'sessionId',
}));

app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function(body: any) {
    if (res.statusCode >= 500) {
      console.error(`${new Date().toISOString()} - ${req.method} ${req.path} - Status: ${res.statusCode}`);
    }
    return originalSend.call(this, body);
  };
  next();
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/collaboration', collaborationRoutes);
app.use('/api/organizations', organizationsRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/habits', habitsRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/tags', tagsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/note-boards', noteBoardRoutes);
app.use('/api/goal-boards', goalBoardRoutes);
app.use('/api/habit-boards', habitBoardRoutes);
app.use('/api/whiteboards', whiteboardsRoutes);
app.use('/api/deep-focus', deepFocusRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/milestones', milestonesRoutes);
app.use('/api/task-templates', taskTemplatesRoutes);
app.use('/api/note-templates', noteTemplatesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/notifications', notificationsRoutes);

app.get('/api/health', async (_req, res) => {
  try {
    const dbTest = await pool.query('SELECT NOW()');
    res.json({
      ok: true,
      database: 'connected',
      dbTime: dbTest.rows[0].now,
    });
  } catch (error: any) {
    console.error('Health check failed:', error);
    res.status(500).json({
      ok: false,
      database: 'failed',
    });
  }
});

// Public maintenance status - consumed by the client boot check
app.get('/api/status', async (_req, res) => {
  try {
    const maintenanceMode = await getSettingBoolean('maintenance_mode', false);
    const message = maintenanceMode ? await getSetting('maintenance_message', 'We are currently performing scheduled maintenance. Please check back shortly.') : null;
    const supportEmail = await getSetting('support_contact_email', 'support@myplanner.app');
    res.json({ maintenance_mode: maintenanceMode, message, support_email: supportEmail });
  } catch (error) {
    res.status(500).json({ maintenance_mode: false, message: null });
  }
});

// Serve static files in production
if (isProduction) {
  const distPath = path.join(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }));
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api/')) {
        res.sendFile(path.join(distPath, 'index.html'));
      } else {
        res.status(404).json({ error: 'API route not found' });
      }
    });
  } else {
    console.warn('WARNING: "dist" directory not found. Frontend might not be served correctly.');
  }
}

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error occurred:', err);
  res.status(err.statusCode || err.status || 500).json({ error: 'Internal server error' });
});

export { app, allowedOrigins, frontendUrl, isProduction };