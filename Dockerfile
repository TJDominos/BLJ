# Build and Runtime container for RandSeed Room Microservice (Wire Protocol room-host-v1)
FROM node:22-alpine AS builder

WORKDIR /app

ARG RANDSEED_GAME_ID
ENV VITE_RANDSEED_GAME_ID=${RANDSEED_GAME_ID}
ENV RANDSEED_GAME_ID=${RANDSEED_GAME_ID}
ENV GAME_ID=${RANDSEED_GAME_ID}

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Copy source and compile
COPY . .
RUN npm run build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ARG RANDSEED_GAME_ID
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
ENV RANDSEED_GAME_ID=${RANDSEED_GAME_ID}
ENV GAME_ID=${RANDSEED_GAME_ID}

COPY package.json package-lock.json* ./
# Install production dependencies only
RUN npm ci --omit=dev || npm install --omit=dev

# Copy compiled bundles from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Expose standard RandSeed room container port
EXPOSE 8080

# Default command launches the Wire Protocol room server
CMD ["node", "build/room-server.mjs"]
