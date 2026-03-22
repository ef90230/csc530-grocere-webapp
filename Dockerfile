# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy frontend source
COPY frontend/package*.json ./
RUN npm install

COPY frontend ./
RUN npm run build

# Runtime stage
FROM node:24-alpine

WORKDIR /app

# Install serve to run the frontend
RUN npm install -g serve

# Copy built app from builder
COPY --from=builder /app/build ./build

# Expose frontend port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget -q -O /dev/null http://localhost:3000 || exit 1

# Serve the frontend
CMD ["serve", "-s", "build", "-l", "3000"]