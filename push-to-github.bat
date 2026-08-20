@echo off
echo Pushing changes to GitHub...

REM Add all changes to git
git add .

REM Commit the changes
git commit -m "Fix support ticket creation issue - Add missing database tables

- Updated server/init-db.ts to automatically create support_tickets and ticket_messages tables
- Created migration file drizzle/0004_add_support_tickets_tables.sql
- Added .env file with database configuration
- Created scripts and documentation for applying the fix
- Fixed 500 Internal Server Error when creating support tickets"

REM Push to GitHub
git push origin main

echo Changes pushed to GitHub successfully!
pause