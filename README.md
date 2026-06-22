# Task Joy Box

A comprehensive task management application with AI assistance, collaboration features, and advanced analytics.

## Features

- **Task Management**: Organize your tasks with customizable boards, columns, and cards
- **AI Assistance**: Get intelligent task suggestions and productivity insights
- **Collaboration**: Share workspaces with your team or family
- **Calendar Integration**: Sync with Google Calendar
- **Analytics**: Track your productivity with detailed insights
- **Secure Payments**: Process payments securely via PayPal with encrypted data

## Authentication Issues Fix

If you're experiencing issues with logging out after leaving the site or problems with Google authentication, please ensure your environment variables are properly configured:

### Required Environment Variables

Create a `.env` file in the root directory with the following variables:

```
# Application Configuration
NODE_ENV=development
PORT=3001

# Frontend URL (important for CORS)
FRONTEND_URL=http://localhost:5173

# Secrets (generate strong random values for production)
SESSION_SECRET=your_session_secret_here
JWT_SECRET=your_jwt_secret_here

# Database - PostgreSQL
DATABASE_URL=postgresql://username:password@localhost:5432/task_joy_box

# Google Authentication (required for Google login)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
```

### Setting Up Google Authentication

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to APIs & Credentials > Credentials
4. Create an OAuth 2.0 Client ID
5. Add your domain to "Authorized JavaScript origins" and "Authorized redirect URIs"
6. Copy the Client ID and Secret to your `.env` file

### For Production Deployment

When deploying to production, ensure:
- Set `NODE_ENV=production`
- Use HTTPS for your domain
- Set `CROSS_SITE_COOKIES=true` if you need cross-site cookie support
- Generate strong secrets for SESSION_SECRET and JWT_SECRET

## Setup Instructions

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Cloudflare account (for Cloudflare tunnel setup)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd task-joy-box
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example` and configure your environment variables:
   ```bash
   cp .env.example .env
   ```

### Cloudflare Tunnel Setup

To make your locally hosted application accessible from the internet using Cloudflare:

1. Install the Cloudflare CLI (Wrangler):
   ```bash
   npm install -g wrangler
   ```

2. Authenticate with Cloudflare:
   ```bash
   wrangler login
   ```

3. Create a new tunnel:
   ```bash
   wrangler tunnel create myplanner-tunnel
   ```
   Note the tunnel ID that is generated.

4. Update your `.env` file with your tunnel details:
   ```
   FRONTEND_URL=https://myplanner-tunnel.your-account.workers.dev
   BACKEND_URL=https://myplanner-tunnel.your-account.workers.dev
   CF_TUNNEL_URL=https://myplanner-tunnel.your-account.workers.dev
   HOST=myplanner-tunnel.your-account.workers.dev
   ```

5. Configure the tunnel ingress rules in your Cloudflare dashboard:
   - Go to [https://dash.cloudflare.com](https://dash.cloudflare.com)
   - Navigate to Zero Trust > Networks > Tunnels
   - Click on your tunnel name ("myplanner-tunnel")
   - Click "Configure" and add the following ingress rules:
     ```
     - Hostname: myplanner-tunnel.your-account.workers.dev
       Service: http://localhost:5000
     - Hostname: myplanner-tunnel.your-account.workers.dev
       Service: http://localhost:3001
       (for API routes)
     - Path: /*
       Service: http://localhost:5000
     - Path: /api/*
       Service: http://localhost:3001
     - Path: /api/*/*
       Service: http://localhost:3001
     ```
   - Save the configuration

6. Start your backend server:
   ```bash
   npm run server
   ```

7. In another terminal, start your frontend with Vite:
   ```bash
   npm run client
   ```

8. In another terminal, run the tunnel:
   ```bash
   wrangler tunnel run myplanner-tunnel
   ```

9. Your application will now be accessible via the Cloudflare tunnel URL.

### Cloudflare Tunnel Setup (Alternative Method)

To make your locally hosted application accessible from the internet using Cloudflare without Zero Trust:

1. Install the Cloudflare CLI (Wrangler):
   ```bash
   npm install -g wrangler
   ```

2. Authenticate with Cloudflare:
   ```bash
   wrangler login
   ```

3. Create a new tunnel:
   ```bash
   wrangler tunnel create myplanner-tunnel
   ```
   Note the tunnel ID that is generated.

4. Update your `.env` file with your tunnel details:
   ```
   FRONTEND_URL=https://myplanner-tunnel.your-account.workers.dev
   BACKEND_URL=https://myplanner-tunnel.your-account.workers.dev
   CF_TUNNEL_URL=https://myplanner-tunnel.your-account.workers.dev
   HOST=myplanner-tunnel.your-account.workers.dev
   ```

5. Generate credentials file for the tunnel:
   ```bash
   wrangler tunnel route dns myplanner-tunnel --hostname myplanner-tunnel.your-account.workers.dev
   ```
   This creates a credentials file in your home directory that the tunnel will use.

6. Start your backend server:
   ```bash
   npm run server
   ```

7. In another terminal, start your frontend with Vite:
   ```bash
   npm run client
   ```

8. In another terminal, run the tunnel with manual routing:
   ```bash
   wrangler tunnel --name myplanner-tunnel --hostname myplanner-tunnel.your-account.workers.dev --url http://localhost:5000
   ```

   If you need to route API requests to the backend server as well, you can use:
   ```bash
   # For the main application (frontend)
   wrangler tunnel --name myplanner-tunnel --hostname myplanner-tunnel.your-account.workers.dev --url http://localhost:5000
   
   # And for API requests (in another terminal)
   wrangler tunnel --name myplanner-tunnel-api --hostname api-myplanner-tunnel.your-account.workers.dev --url http://localhost:3001
   ```

9. Your application will now be accessible via the Cloudflare tunnel URL.

### Cloudflare Tunnel Setup (Simple Temporary Method)

To make your locally hosted application accessible from the internet using a temporary Cloudflare tunnel:

1. Install the Cloudflare CLI (Wrangler):
   ```bash
   npm install -g wrangler
   ```

2. Make sure both your backend and frontend servers are running:
   - Start your backend server: `npm run server`
   - In another terminal, start your frontend: `npm run client`

3. In another terminal, create and run a temporary tunnel:
   ```bash
   wrangler tunnel quick-start http://localhost:5000
   ```
   
   This will create a temporary tunnel with a URL like `https://xxxxxx.trycloudflare.com`.

4. Update your `.env` file with the temporary tunnel URL:
   ```
   FRONTEND_URL=https://xxxxxx.trycloudflare.com
   BACKEND_URL=https://xxxxxx.trycloudflare.com
   CF_TUNNEL_URL=https://xxxxxx.trycloudflare.com
   HOST=xxxxxx.trycloudflare.com
   ```

5. Restart your backend server after updating the environment variables:
   ```bash
   npm run server
   ```

6. Your application will now be accessible via the temporary Cloudflare tunnel URL.

⚠️ **Note**: This temporary tunnel method is ideal for testing and development but is not recommended for production use. These tunnels have no uptime guarantee and are subject to Cloudflare's terms of use.

### Google OAuth Configuration for Tunnels

If you're experiencing issues with Google OAuth (sign-in button not appearing or authentication failing):

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create one if needed)
3. Navigate to APIs & Credentials > OAuth 2.0 Client IDs
4. Edit your application's OAuth 2.0 client
5. Under "Authorized JavaScript origins", add:
   - `https://valve-individually-morning-isp.trycloudflare.com` (or your specific tunnel URL)
6. Under "Authorized redirect URIs", add:
   - `https://valve-individually-morning-isp.trycloudflare.com/api/auth/google/callback`
   - `https://valve-individually-morning-isp.trycloudflare.com/login` (if applicable)
7. Save your changes

### Local Development

For local development without external access:

1. Start the backend server:
   ```bash
   npm run server
   ```

2. In another terminal, start the frontend:
   ```bash
   npm run client
   ```

3. Access the application at `http://localhost:5000`

### Environment Variables

| Variable | Description |
|----------|-------------|
| `FRONTEND_URL` | Your application's frontend URL |
| `BACKEND_URL` | Your application's backend URL |
| `CF_TUNNEL_URL` | Your Cloudflare tunnel URL (if using) |
| `HOST` | Host address for your application |
| `PORT` | Port for the backend server (defaults to 3001) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `JWT_SECRET` | Secret for JWT token signing |
| `SESSION_SECRET` | Secret for session encryption |
| `DATABASE_URL` | Database connection string |
| `ENCRYPTION_KEY` | A 64-character hex string for field-level encryption |
| `PAYPAL_CLIENT_ID` | Your PayPal client ID |
| `PAYPAL_CLIENT_SECRET` | Your PayPal client secret |
| `OPENROUTER_API_KEY` | OpenRouter API key for AI features |

### Running in Production

Use the build command to create optimized assets:

```bash
npm run build
```

Then serve the `dist` folder with your preferred web server.

## Technologies Used

- **Frontend**: React, TypeScript, Tailwind CSS, Shadcn UI
- **Backend**: Node.js, Express
- **Database**: SQLite with Drizzle ORM
- **Authentication**: JWT, OAuth with Google
- **Payments**: Stripe
- **AI**: OpenRouter API
- **Deployment**: Cloudflare Workers (for tunneling)

## Payment System

The application now uses PayPal as the sole payment processor. All sensitive data is encrypted using AES-256-GCM encryption to ensure that even the application owner cannot access user payment information.

### Encryption Details

- Field-level encryption using AES-256-GCM algorithm
- Encrypted values stored in the format: `enc:<iv_b64>:<tag_b64>:<ciphertext_b64>`
- All payment-related data is encrypted before storage
- The encryption key must be a 64-character hex string (32 raw bytes)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Your Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRICE_PRO_SEAT` | Price ID for Pro tier seats |
| `STRIPE_PRICE_PREMIUM_SEAT` | Price ID for Premium tier seats |
| `APP_URL` | Your application's base URL |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.