@echo off
echo Creating support tables in database...

REM Set the database URL from environment variable
set DATABASE_URL=postgresql://postgres:Orel123yy%%40%%40@db.csjxuecznqdwhzgudnvk.supabase.co:5432/postgres

REM Run the SQL script using psql
psql "%DATABASE_URL%" -f create-support-tables.sql

echo Support tables created successfully!
pause