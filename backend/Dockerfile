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
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start the backend server
CMD ["npm", "start"]
