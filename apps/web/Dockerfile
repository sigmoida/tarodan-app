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
COPY apps/web/package.json ./apps/web/

# Install dependencies (monorepo)
RUN pnpm install --frozen-lockfile

# Copy app source
COPY apps/web ./apps/web

# Build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @tarodan/web build

# Debug: Check standalone build output
RUN echo "📦 Checking standalone build..." && \
    if [ ! -d "/app/apps/web/.next/standalone" ]; then \
      echo "❌ .next/standalone not found! Build may have failed." && \
      exit 1; \
    fi && \
    echo "✅ .next/standalone exists" && \
    echo "📄 Contents:" && \
    ls -la /app/apps/web/.next/standalone/ && \
    echo "📄 Checking for node_modules:" && \
    (test -d /app/apps/web/.next/standalone/node_modules && echo "✅ node_modules found" || echo "⚠️  node_modules not found in standalone") && \
    echo "📄 Checking for server.js:" && \
    (test -f /app/apps/web/.next/standalone/server.js && echo "✅ server.js found" || echo "❌ server.js not found")

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built files (standalone includes node_modules)
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static

# Verify standalone build structure
RUN echo "📦 Verifying standalone build..." && \
    ls -la . && \
    echo "📄 Checking for server.js:" && \
    (test -f server.js && echo "✅ server.js found" || (echo "❌ server.js not found!" && exit 1)) && \
    echo "📄 Checking for node_modules:" && \
    (test -d node_modules && echo "✅ node_modules found" || (echo "❌ node_modules not found in standalone!" && ls -la . && exit 1)) && \
    echo "📄 Checking for next in node_modules:" && \
    (test -d node_modules/next && echo "✅ next module found" || (echo "❌ next module not found!" && ls -la node_modules/ 2>/dev/null | head -20 || echo "node_modules is empty or missing" && exit 1))

# Set ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
