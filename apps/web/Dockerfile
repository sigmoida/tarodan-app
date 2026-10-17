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
# Public env vars are inlined at build time, so they must reach `next build`.
# They are declared as ARG only: an ARG is in the environment of every RUN in
# its stage, so no `ENV X=$X` re-export is needed. Do not add one: with
# Coolify's "Build secrets: Docker BuildKit secrets" the values arrive as
# secret mounts on each RUN instead of build args; an ENV built from the then
# empty ARG would compete with (and could shadow) the mounted value.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
# Blank Apple ids are safe and intentional: the sign-in buttons render nothing
# when their provider is unconfigured, so a build without them ships without
# Apple.
ARG NEXT_PUBLIC_APPLE_SERVICES_ID
ARG NEXT_PUBLIC_APPLE_REDIRECT_URI
# Blank skips the Google Ads tag; when set, it still loads only after the
# visitor grants the marketing cookie category.
ARG NEXT_PUBLIC_GOOGLE_ADS_ID
# Sentry (all optional; blank DSN = no Sentry in the bundle). The release
# defaults to the short SOURCE_COMMIT, which Coolify passes only with
# "Source commit availability: Available during build".
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
ARG NEXT_PUBLIC_SENTRY_RELEASE
ARG SOURCE_COMMIT
# SENTRY_AUTH_TOKEN (source map upload) is deliberately NOT an ARG: build args
# are recorded in the image history. Set it in Coolify only after switching the
# app to "Build secrets: Docker BuildKit secrets" (Coolify then mounts it into
# this RUN with `--mount=type=secret`, which leaves no trace in the image).
# Without the token the build still succeeds and skips the upload. Never add
# a `--mount` of your own to this RUN: Coolify skips RUN lines that already
# mount a secret, and the public vars above would then be missing.
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
