# Create support tables in the database
Write-Host "Creating support tables in database..."

# Import required modules
Import-Module postgres

# Set the database URL
$env:DATABASE_URL = "postgresql://postgres:Orel123yy%40%40@db.csjxuecznqdwhzgudnvk.supabase.co:5432/postgres"

# Read and execute the SQL script
$sqlScript = Get-Content -Path "create-support-tables.sql" -Raw

# Connect to the database and execute the script
try {
    # Using Npgsql for PostgreSQL connection
    $connectionString = "Host=db.csjxuecznqdwhzgudnvk.supabase.co;Port=5432;Username=postgres;Password=Orel123yy@@;Database=postgres"
    
    # Install Npgsql if not available
    if (-not (Get-Module -ListAvailable -Name Npgsql)) {
        Write-Host "Installing Npgsql module..."
        Install-Module -Name Npgsql -Force
    }
    
    # Connect and execute
    $connection = New-Object Npgsql.NpgsqlConnection($connectionString)
    $connection.Open()
    
    $command = $connection.CreateCommand()
    $command.CommandText = $sqlScript
    $command.ExecuteNonQuery()
    
    $connection.Close()
    
    Write-Host "Support tables created successfully!"
} catch {
    Write-Host "Error creating support tables: $_"
    Write-Host "Please ensure PostgreSQL tools are installed or run the SQL manually."
}

Read-Host "Press Enter to exit"