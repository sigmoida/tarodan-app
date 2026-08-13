# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Ensure devDependencies are installed during build
ENV NODE_ENV=development

# Keep Docker builds on the repository's audited package-manager line.
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

# Copy root package files (monorepo)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./

# Copy packages (monorepo dependencies)
COPY packages ./packages

# Repo-root build scripts — the app's `build` runs sync-brand-assets.mjs first
COPY scripts ./scripts

# Copy app package files
COPY apps/web/package.json ./apps/web/

# Install dependencies (shamefully-hoist: flat node_modules, no symlinks)
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Copy app source
COPY apps/web ./apps/web

# Switch to production for Next.js build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Public env vars are inlined at build time — must be present before `next build`.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_APPLE_SERVICES_ID
ARG NEXT_PUBLIC_APPLE_REDIRECT_URI
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
# Blank here is safe and intentional: the sign-in buttons render nothing when
# their provider is unconfigured, so a build without these ships without Apple.
ENV NEXT_PUBLIC_APPLE_SERVICES_ID=$NEXT_PUBLIC_APPLE_SERVICES_ID
ENV NEXT_PUBLIC_APPLE_REDIRECT_URI=$NEXT_PUBLIC_APPLE_REDIRECT_URI
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
# public/ already contains the brand marks via sync-brand-assets.mjs (prebuild)
COPY --from=builder /app/apps/web/public ./apps/web/public

# Set ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
