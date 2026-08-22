# Stage 1: Build Angular Client
FROM node:20-slim AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Build Express Server
FROM node:20-slim AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Stage 3: Production Runtime
FROM node:20-slim AS runner
WORKDIR /app/server

ENV NODE_ENV=production
ENV PORT=8080

COPY server/package*.json ./
RUN npm ci --only=production

# Copy compiled server code and config
COPY --from=server-builder /app/server/dist ./dist
COPY --from=server-builder /app/server/ai-config.json ./ai-config.json

# Copy compiled client assets into public
COPY --from=client-builder /app/server/public ./public

# Create empty generated directory
RUN mkdir -p generated

EXPOSE 8080

CMD ["node", "dist/app.js"]
