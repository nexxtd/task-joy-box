# Running TaskJoy Box with Cloudflare Tunnel

This guide explains how to run the TaskJoy Box application with Cloudflare Tunnel for external access.

## Prerequisites

1. Install Node.js (v18 or higher)
2. Install all dependencies: `npm install`
3. Install wrangler globally: `npm install -g wrangler`

## Setup Instructions

### 1. Configure Environment Variables

First, make sure your `.env` file is properly configured:

```env
# Server Configuration
PORT=3001
NODE_ENV=development
DATABASE_URL=file:./db.sqlite

# Frontend URL - This should match your tunnel URL when using tunnel
FRONTEND_URL=http://localhost:5173

# Session and Authentication
SESSION_SECRET=your_very_long_and_secure_session_secret
JWT_SECRET=your_very_long_and_secure_jwt_secret_with_complex_characters

# Admin Configuration - Replace with your actual email
ADMIN_EMAILS=your-email@example.com,your-second-email@example.com

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your_google_client_id
```

### 2. Update FRONTEND_URL When Using Tunnel

When you run the application with Cloudflare tunnel, you'll need to update the `FRONTEND_URL` in your `.env` file to match the tunnel URL.

### 3. Running the Application

#### Option A: Run Everything Separately

1. Terminal 1 - Backend server:
   ```bash
   cd server && npx nodemon index.ts
   ```

2. Terminal 2 - Frontend:
   ```bash
   npm run dev
   ```

3. Terminal 3 - Cloudflare Tunnel (after getting both running):
   ```bash
   npx wrangler tunnel quick-start http://localhost:3001
   ```

#### Option B: Using Concurrently (Recommended)

Use the predefined scripts in package.json:

```bash
# Just run the backend and frontend together
npm run dev:all

# Run everything including the tunnel (this will open the tunnel to the backend)
npm run dev:tunnel:full
```

#### Option C: Using the Batch File

Run the batch file to start everything:

```bash
start-with-tunnel.bat
```

### 4. Using the Cloudflare Tunnel

1. After running the tunnel command, you'll receive a unique URL like:
   `https://your-random-name.trycloudflare.com`

2. Update your `.env` file to include this tunnel URL in `ADDITIONAL_ALLOWED_ORIGINS`:
   ```env
   ADDITIONAL_ALLOWED_ORIGINS=https://your-random-name.trycloudflare.com
   ```

3. Restart your backend server to pick up the new environment variable.

4. Access your application via the tunnel URL.

### 5. Setting Up Admin Access

To grant admin access to your account:

1. Update the `ADMIN_EMAILS` variable in your `.env` file with your email address
2. Restart the backend server
3. Log in to the application with that email address
4. Your account should now have admin privileges

### 6. Troubleshooting

- If you get CORS errors, make sure your tunnel URL is added to `ADDITIONAL_ALLOWED_ORIGINS`
- If authentication isn't working, ensure `JWT_SECRET` is set and both frontend and backend are restarted
- If you can't access admin features, confirm your email is in the `ADMIN_EMAILS` list and restart the server
- Make sure the backend server is running on the correct port (default 3001)
- If you get dependency errors, run `npm install` to install missing packages

### 7. Security Notes

- Never commit your `.env` file to version control
- Use strong, unique values for `SESSION_SECRET` and `JWT_SECRET`
- Only add trusted email addresses to `ADMIN_EMAILS`