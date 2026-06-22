# Support Ticket Creation Fix

## Problem
When trying to create a support ticket, the application returns a 500 Internal Server Error. The console shows errors for `/api/support/check` and `/api/support/tickets` endpoints.

## Root Cause
The support tickets and ticket messages tables are defined in the schema but are not being created in the database.

## Solution
The database initialization script has been updated to automatically create these tables when the server starts.

## How to Apply the Fix

### Option 1: Restart the Server (Recommended)
Run one of the following scripts to restart the server with the updated database initialization:

**Windows Command Prompt:**
```bash
restart-server.bat
```

**Windows PowerShell:**
```powershell
./restart-server.ps1
```

### Option 2: Manual Server Restart
1. Stop any running Node.js processes
2. Start the server with:
   ```bash
   npm run dev:server
   ```

### Option 3: Manual Database Table Creation
If the server restart doesn't work, you can manually create the tables using the SQL script:

1. Run the SQL script directly against your database:
   ```bash
   psql "postgresql://postgres:Orel123yy%40%40@db.csjxuecznqdwhzgudnvk.supabase.co:5432/postgres" -f create-support-tables.sql
   ```

## What Was Changed
1. Added support tickets table creation to `server/init-db.ts`
2. Created migration file `drizzle/0004_add_support_tickets_tables.sql`
3. Added scripts to help restart the server

## Verification
After restarting the server:
1. Navigate to the Support page
2. Click on "Submit"
3. Try creating a new support ticket
4. The ticket should be created successfully without errors

## Files Modified
- `server/init-db.ts` - Added support tables initialization
- `drizzle/0004_add_support_tickets_tables.sql` - Migration file
- `server/routes/support.ts` - No changes needed (already correct)

## New Files Created
- `restart-server.bat` - Windows batch script to restart server
- `restart-server.ps1` - PowerShell script to restart server
- `create-support-tables.sql` - SQL script to create tables manually
- `create-support-tables.bat` - Batch script to run SQL
- `create-support-tables.ps1` - PowerShell script to run SQL
- `scripts/init-support-tables.js` - Node.js script to create tables