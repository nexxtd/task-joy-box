# Commands to Push Changes to GitHub

## Option 1: Use the Batch Script (Windows)
Run the following command in Command Prompt:
```bash
push-to-github.bat
```

## Option 2: Use the PowerShell Script (Windows)
Run the following command in PowerShell:
```powershell
./push-to-github.ps1
```

## Option 3: Manual Commands
Run these commands in your terminal:

```bash
# Add all changes to git
git add .

# Commit the changes
git commit -m "Fix support ticket creation issue - Add missing database tables

- Updated server/init-db.ts to automatically create support_tickets and ticket_messages tables
- Created migration file drizzle/0004_add_support_tickets_tables.sql
- Added .env file with database configuration
- Created scripts and documentation for applying the fix
- Fixed 500 Internal Server Error when creating support tickets"

# Push to GitHub
git push origin main
```

## Files Being Pushed
- `.env` - Database configuration file
- `server/init-db.ts` - Updated to create support tables
- `drizzle/0004_add_support_tickets_tables.sql` - Migration file
- `SUPPORT-TICKET-FIX.md` - Documentation for the fix
- Various helper scripts for restarting server and creating tables

## Note
Make sure you're authenticated with GitHub before pushing. If you haven't set up authentication, you may need to:
1. Use GitHub CLI: `gh auth login`
2. Or set up SSH keys
3. Or use personal access token with HTTPS