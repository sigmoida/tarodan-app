# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy root package files (monorepo)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./

# Copy packages (monorepo dependencies)
COPY packages ./packages

# Copy app package files
COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma/

# Install dependencies (monorepo)
RUN pnpm install --frozen-lockfile

# Copy app source
COPY apps/api ./apps/api

# Generate Prisma client (source'dan sonra, schema'ya erişim için)
# Prisma generate must run from the app directory
WORKDIR /app/apps/api
RUN pnpm prisma generate
WORKDIR /app

# Build
RUN pnpm --filter @tarodan/api build || (echo "❌ Build failed!" && exit 1)

# Verify build succeeded and show dist contents
RUN echo "📦 Checking build output..." && \
    if [ ! -d "/app/apps/api/dist" ]; then \
      echo "❌ dist directory not found! Build may have failed." && \
      exit 1; \
    fi && \
    echo "✅ dist directory exists" && \
    echo "📄 Contents of dist:" && \
    ls -la /app/apps/api/dist/ && \
    echo "📄 Looking for main.js..." && \
    if [ ! -f "/app/apps/api/dist/main.js" ]; then \
      echo "❌ dist/main.js not found!" && \
      echo "📄 Available files:" && \
      find /app/apps/api/dist -type f | head -20 && \
      exit 1; \
    fi && \
    echo "✅ dist/main.js found!"

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Copy built files
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./package.json
COPY --from=builder /app/apps/api/prisma ./prisma

# Verify dist/main.js exists (with better error message)
RUN echo "📦 Checking dist directory..." && \
    ls -la dist/ && \
    echo "📄 Looking for main.js..." && \
    (test -f dist/main.js && echo "✅ dist/main.js found!") || \
    (echo "❌ dist/main.js not found! Contents:" && ls -la dist/ && exit 1)

# Set ownership
RUN chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3001

CMD ["node", "dist/main"]
