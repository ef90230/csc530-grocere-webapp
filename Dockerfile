FROM node:24-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
ENV REACT_APP_API_URL=/api
RUN npm run build

FROM node:24-alpine AS backend-runtime

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend ./

# Backend server serves static assets from ../frontend/build
COPY --from=frontend-builder /app/frontend/build /app/frontend/build

EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -q -O /dev/null http://localhost:5000/health || exit 1

CMD ["node", "server.js"]