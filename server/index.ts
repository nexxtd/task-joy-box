import 'dotenv/config';
import { app, allowedOrigins, frontendUrl } from './app.js';
import { initDatabase } from './init-db.js';

const PORT = parseInt(process.env.PORT || '3001');

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