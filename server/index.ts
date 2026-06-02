import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import authRoutes from './routes/auth';
import aiRoutes from './routes/ai';
import calendarRoutes from './routes/calendar';
import paymentRoutes from './routes/payment';
import collaborationRoutes from './routes/collaboration';
import organizationsRoutes from './routes/organizations';  // New organizations routes
import workspaceRoutes from './routes/workspace';  // New workspace routes
import projectsRoutes from './routes/projects';
import projectsV2Routes from './routes/projects-v2';
import goalsRoutes from './routes/goals';
import habitsRoutes from './routes/habits';
import notesRoutes from './routes/notes';
import settingsRoutes from './routes/settings';
import attachmentRoutes from './routes/attachments';
import adminRoutes from './routes/admin';
import boardRoutes from './routes/boards';
import columnRoutes from './routes/columns'; // Import added for reference
import projectColumnRoutes from './routes/project-columns'; // New import added
import whiteboardsRoutes from './routes/whiteboards';
import deepFocusRoutes from './routes/deepFocus';
import path from 'path';
import connectPg from 'connect-pg-simple';
import { pool } from './db';
import { initDatabase } from './init-db';

const PostgresStore = connectPg(session);
const sessionStore = new PostgresStore({
  pool: pool,
  createTableIfMissing: true
});

sessionStore.on('error', (error: any) => {
  console.error('Session store error:', error);
});

const app = express();
const PORT = parseInt(process.env.PORT || '3001');
const isProduction = process.env.NODE_ENV === 'production';
// Use the RENDER_EXTERNAL_URL if available, otherwise default to a standard URL
const renderExternalUrl = process.env.RENDER_EXTERNAL_URL || 'https://task-joy-box.onrender.com';
const frontendUrl = process.env.FRONTEND_URL || renderExternalUrl || 'http://localhost:5173';
const sessionSecret = process.env.SESSION_SECRET || 'fallback_secret_for_dev_only';
const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';
const crossSiteCookies = process.env.CROSS_SITE_COOKIES === 'true';

// Additional allowed origins for ngrok and development
const additionalAllowedOrigins = process.env.ADDITIONAL_ALLOWED_ORIGINS?.split(',') || [];

// Additional origins for Cloudflare tunnel
const cfTunnelOrigins = process.env.CF_TUNNEL_URL ? [process.env.CF_TUNNEL_URL] : [];

if (isProduction) {
  const missingVars = ['FRONTEND_URL', 'SESSION_SECRET', 'JWT_SECRET'].filter((key) => !process.env[key]);
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables for production: ${missingVars.join(', ')}`);
  }
} else {
  // Log warnings in development if using fallback secrets
  if (!process.env.SESSION_SECRET) {
    console.warn('WARNING: Using fallback session secret. Set SESSION_SECRET in production.');
  }
  if (!process.env.JWT_SECRET) {
    console.warn('WARNING: Using fallback JWT secret. Set JWT_SECRET in production.');
  }
}

// Database initialization via Drizzle ORM pushing migrations is recommended for Postgres

app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Allow popups for Google Sign-In - must use same-origin-allow-popups for postMessage to work
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

const allowedOrigins = new Set<string>();
if (frontendUrl) {
  allowedOrigins.add(frontendUrl);
}

// Add Render external URL if available
if (process.env.RENDER_EXTERNAL_URL) {
  allowedOrigins.add(process.env.RENDER_EXTERNAL_URL);
}

// Add ngrok URL to allowed origins if present
if (process.env.NGROK_URL) {
  allowedOrigins.add(process.env.NGROK_URL);
}

// Add Cloudflare tunnel URL to allowed origins if present
if (process.env.CF_TUNNEL_URL) {
  allowedOrigins.add(process.env.CF_TUNNEL_URL);
}

// Add any additional allowed origins from environment
const additionalOriginsVar = process.env.ADDITIONAL_ALLOWED_ORIGINS;
if (additionalOriginsVar) {
  additionalOriginsVar.split(',').forEach(origin => {
    const trimmedOrigin = origin.trim();
    if (trimmedOrigin) {
      allowedOrigins.add(trimmedOrigin);
    }
  });
}

// Additionally, if running in development, allow common tunnel/testing domains
if (!isProduction) {
  allowedOrigins.add('http://localhost:5173');  // Vite default
  allowedOrigins.add('http://127.0.0.1:5173');
  allowedOrigins.add('http://localhost:3000');  // Common alternative
  allowedOrigins.add('http://127.0.0.1:3000');
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      // Allow non-browser requests (like mobile apps or direct API calls)
      return callback(null, true);
    }
    
    // Allow all localhost for development
    if (!isProduction && /^http:\/\/localhost:\d+$/.test(origin)) {
      return callback(null, true);
    }
    
    // Allow all 127.0.0.1 addresses for development
    if (!isProduction && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
      return callback(null, true);
    }
    
    // Allow all origins ending with .trycloudflare.com (Cloudflare tunnels)
    if (/\.trycloudflare\.com$/.test(origin)) {
      return callback(null, true);
    }
    
    // Allow all origins ending with .workers\.dev (Cloudflare pages)
    if (/\.workers\.dev$/.test(origin)) {
      return callback(null, true);
    }
    
    // Allow Render's default domain pattern
    if (origin.includes('onrender.com')) {
      return callback(null, true);
    }

    // Allow all Replit dev domains
    if (/\.replit\.dev$/.test(origin) || /\.riker\.replit\.dev$/.test(origin) || /\.replit\.app$/.test(origin)) {
      return callback(null, true);
    }
    
    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    console.error(`CORS error: Origin ${origin} not allowed. Allowed origins:`, [...allowedOrigins]);
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true,
}));

// Removed Stripe webhook endpoints - now using only PayPal
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// Serve uploads folder if it exists
if (fs.existsSync(path.join(process.cwd(), 'uploads'))) {
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
}

// Session configuration - we'll keep this for potential use with other parts of the app
// But the main auth is now handled with JWT tokens
app.use(session({
  store: sessionStore,
  secret: sessionSecret || 'fallback_secret_for_dev_only',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction, // Only true in production, otherwise false for local/dev
    httpOnly: true, // Prevent XSS attacks
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: crossSiteCookies ? 'none' : 'lax', // Use 'none' for cross-site requests if enabled
  },
  name: 'sessionId', // Custom session cookie name
}));

// Middleware to log requests and potential issues
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  const originalSend = res.send;
  res.send = function(body: any) {
    if (res.statusCode >= 400) {
      console.error(`${new Date().toISOString()} - ${req.method} ${req.path} - Status: ${res.statusCode}`, body);
    }
    return originalSend.call(this, body);
  };
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/collaboration', collaborationRoutes);
app.use('/api/organizations', organizationsRoutes);  // Add organizations routes
app.use('/api/workspace', workspaceRoutes);  // Add workspace routes
app.use('/api/projects', projectsV2Routes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/habits', habitsRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/whiteboards', whiteboardsRoutes);
app.use('/api/deep-focus', deepFocusRoutes);

app.get('/api/health', async (_req, res) => {
  try {
    // Test database connection
    const dbTest = await pool.query('SELECT NOW()');
    
    // Check environment variables
    const envStatus = {
      DATABASE_URL: !!process.env.DATABASE_URL,
      JWT_SECRET: !!process.env.JWT_SECRET,
      SESSION_SECRET: !!process.env.SESSION_SECRET,
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT
    };
    
    res.json({ 
      ok: true, 
      database: 'connected',
      dbTime: dbTest.rows[0].now,
      environment: envStatus
    });
  } catch (error: any) {
    console.error('Health check failed:', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message,
      database: 'failed',
      environment: {
        DATABASE_URL: !!process.env.DATABASE_URL,
        JWT_SECRET: !!process.env.JWT_SECRET,
        SESSION_SECRET: !!process.env.SESSION_SECRET,
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT
      }
    });
  }
});

// Serve static files in production
if (isProduction) {
  const distPath = path.join(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      // Don't serve index.html for API routes
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

// Initialize database and start server
async function startServer() {
  await initDatabase();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API server running on port ${PORT}`);
    console.log(`Frontend URL configured as: ${frontendUrl}`);
    console.log(`Additional allowed origins:`, [...allowedOrigins].join(', '));
  });
}

startServer();

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error occurred:', err);
  res.status(500).json({ error: 'Internal server error' });
});
