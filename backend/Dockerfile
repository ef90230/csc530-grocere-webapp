FROM node:24-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Expose backend port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget -q -O /dev/null http://localhost:5000/health || exit 1

# Start the backend server
CMD ["npm", "start"]
