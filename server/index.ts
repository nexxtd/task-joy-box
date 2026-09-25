import 'dotenv/config';
import { app, allowedOrigins, frontendUrl } from './app.js';
import { initDatabase } from './init-db.js';
import { pool } from './db.js';

const PORT = parseInt(process.env.PORT || '3001');

// Avoid silent crashes / hanging promises taking down throughput.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

// Initialize database and start server
async function startServer() {
  await initDatabase();

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`API server running on port ${PORT}`);
    console.log(`Frontend URL configured as: ${frontendUrl}`);
    console.log(`Additional allowed origins:`, [...allowedOrigins].join(', '));
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      pool.end().then(
        () => process.exit(0),
        () => process.exit(0),
      );
    });
    // Force exit if graceful shutdown hangs
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();