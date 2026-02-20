# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Ensure devDependencies are installed during build
ENV NODE_ENV=development

# Install pnpm
RUN npm install -g pnpm

# Copy root package files (monorepo)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./

# Copy packages (monorepo dependencies)
COPY packages ./packages

# Copy app package files
COPY apps/admin/package.json ./apps/admin/

# Install dependencies (shamefully-hoist: flat node_modules, no symlinks)
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Copy app source
COPY apps/admin ./apps/admin

# Switch to production for Next.js build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @tarodan/admin build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build (outputFileTracingRoot makes monorepo-aware output)
# With outputFileTracingRoot, server.js is at apps/admin/server.js
COPY --from=builder /app/apps/admin/.next/standalone ./
COPY --from=builder /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder /app/apps/admin/public ./apps/admin/public

# Set ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3002

ENV PORT=3002
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/admin/server.js"]
