#!/bin/bash

# Grocer-E Database Setup Script
# This script helps set up PostgreSQL for the Grocer-E application

echo "Grocer-E Database Setup"
echo "========================"

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed or not in PATH."
    echo "Please install PostgreSQL first."
    exit 1
fi

echo "✅ PostgreSQL found"

# Function to create postgres user if it doesn't exist
create_postgres_user() {
    echo "Setting up postgres user..."

    # Try to create the user (will fail if it exists, but that's ok)
    psql -U postgres -c "CREATE USER postgres WITH PASSWORD '$1';" 2>/dev/null || echo "User 'postgres' already exists or creation failed"

    # Set password and permissions
    psql -U postgres -c "ALTER USER postgres PASSWORD '$1';" 2>/dev/null
    psql -U postgres -c "ALTER USER postgres CREATEDB;" 2>/dev/null

    echo "✅ Postgres user configured"
}

# Function to create database
create_database() {
    echo "Creating grocere_db database..."

    # Drop database if it exists (for clean setup)
    psql -U postgres -c "DROP DATABASE IF EXISTS grocere_db;" 2>/dev/null

    # Create database
    psql -U postgres -c "CREATE DATABASE grocere_db;"

    # Grant permissions
    psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE grocere_db TO postgres;"

    echo "✅ Database 'grocere_db' created"
}

# Function to test connection
test_connection() {
    echo "Testing database connection..."

    if psql -U postgres -d grocere_db -c "SELECT version();" &>/dev/null; then
        echo "✅ Database connection successful"
        return 0
    else
        echo "❌ Database connection failed"
        return 1
    fi
}

# Main setup
echo "Enter password for postgres user:"
read -s POSTGRES_PASSWORD

if [ -z "$POSTGRES_PASSWORD" ]; then
    echo "❌ Password cannot be empty"
    exit 1
fi

create_postgres_user "$POSTGRES_PASSWORD"
create_database

if test_connection; then
    echo ""
    echo "🎉 Database setup complete!"
    echo ""
    echo "Update your .env file with:"
    echo "DB_USER=postgres"
    echo "DB_PASSWORD=$POSTGRES_PASSWORD"
    echo ""
    echo "Then run: npm run dev"
else
    echo "❌ Setup failed. Please check PostgreSQL installation and try again."
    exit 1
fi