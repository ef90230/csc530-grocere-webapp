#!/bin/bash
# Quick start script for Grocer-E development with Docker

set -e

echo "========================================="
echo "Grocer-E Docker Startup Script"
echo "========================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

echo "✓ Docker is running"
echo ""

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install Docker Compose."
    exit 1
fi

echo "✓ docker-compose is available"
echo ""

# Build and start services
echo "🔨 Building and starting services..."
echo ""

docker-compose up --build

echo ""
echo "========================================="
echo "✓ Services started successfully!"
echo "========================================="
echo ""
echo "Access the application:"
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   http://localhost:5000"
echo "  Database:  localhost:5432"
echo ""
echo "To stop services, press Ctrl+C or run: docker-compose down"
echo "=========================================
