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

# Verify server.js exists
RUN ls -la . || (echo "ERROR: standalone directory is empty!" && exit 1)
RUN test -f server.js || (echo "ERROR: server.js not found in standalone build!" && exit 1)

# Set ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
