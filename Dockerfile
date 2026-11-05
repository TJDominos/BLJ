# Build and Runtime container for RandSeed Room Microservice (Wire Protocol room-host-v1)
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

# Copy source and compile
COPY . .
RUN npm run build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

COPY package.json ./
# Install production dependencies only
RUN npm install --omit=dev

# Copy compiled bundles from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Expose standard RandSeed room container port
EXPOSE 8080

# Default command launches the Wire Protocol room server
CMD ["node", "dist/room-server.cjs"]
