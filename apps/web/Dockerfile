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
COPY apps/web/package.json ./apps/web/

# Install dependencies (shamefully-hoist: flat node_modules, no symlinks)
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Manufacturer logos only — sync-brand-assets.mjs copies them into public/
# at prebuild. Demo product/collection/hero images live in S3 (seed-assets/),
# not in the repo or this image.
COPY photos/logolar ./photos/logolar

# Copy app source
COPY apps/web ./apps/web

# Switch to production for Next.js build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Public env vars are inlined at build time — must be present before `next build`.
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
RUN pnpm --filter @tarodan/web... build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build (outputFileTracingRoot creates monorepo-aware output)
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
# public/ already contains photos/logolar via sync-brand-assets.mjs (prebuild)
COPY --from=builder /app/apps/web/public ./apps/web/public

# Set ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
