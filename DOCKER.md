# Docker Setup for Grocer-E

This project uses Docker and Docker Compose to manage the frontend, backend, and database services.

## Prerequisites

- Docker (v20.10+)
- Docker Compose (v2.0+)

## Services

- **Frontend**: React app running on `localhost:3000`
- **Backend**: Express API running on `localhost:5000`
- **Database**: PostgreSQL running on `localhost:5432`

## Getting Started

### 1. Set up environment variables

Copy the Docker environment template:

```bash
cp .env.docker .env
```

Edit `.env` if you want to change any default values (optional for development).

### 2. Build and start services

From the project root, run:

```bash
docker-compose up --build
```

This will:
- Build the frontend Docker image
- Build the backend Docker image
- Create and start the PostgreSQL container
- Set up networking between services
- Initialize the database

### 3. Access the application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Database**: localhost:5432

### 4. Stopping services

```bash
docker-compose down
```

To remove volumes (persistent data):

```bash
docker-compose down -v
```

## Development Workflow

### View logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f frontend
docker-compose logs -f backend
docker-compose logs -f db
```

### Rebuild a specific service

```bash
docker-compose up --build frontend
docker-compose up --build backend
```

### Access container shell

```bash
docker-compose exec backend sh
docker-compose exec frontend sh
docker-compose exec db psql -U grocere_user -d grocere_db
```

## Environment Variables

See `.env.docker` for all available configuration options. Key variables:

- `DB_NAME`: PostgreSQL database name (default: grocere_db)
- `DB_USER`: PostgreSQL user (default: grocere_user)
- `DB_PASSWORD`: PostgreSQL password (default: grocere_password)
- `JWT_SECRET`: Secret for JWT tokens
- `GEMINI_API_KEY`: Optional API key for Gemini integration

## Troubleshooting

### Port conflicts

If ports 3000, 5000, or 5432 are already in use, modify the port mappings in `docker-compose.yml`.

### Database connection errors

Ensure the `db` service is healthy before the backend starts. Check logs:

```bash
docker-compose logs db
```

### Frontend not loading

Make sure the frontend package dependencies are installed. If packages failed to install, rebuild:

```bash
docker-compose build --no-cache frontend
```

### Clean rebuild

```bash
docker-compose down -v
docker-compose build --no-cache
docker-compose up
```

## Production Considerations

For production deployment:

1. Update `JWT_SECRET` to a strong random string
2. Set `NODE_ENV=production`
3. Use environment-specific `.env` files
4. Configure proper database backups
5. Set up SSL/TLS certificates
6. Use a reverse proxy (nginx)
7. Configure proper logging and monitoring
