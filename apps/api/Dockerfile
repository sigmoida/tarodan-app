# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL and pnpm
RUN apk add --no-cache openssl
RUN npm install -g pnpm

# Copy root package files (monorepo)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./

# Copy packages (monorepo dependencies)
COPY packages ./packages

# Copy app package files
COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma/

# Install dependencies (shamefully-hoist: flat node_modules, no symlinks)
RUN pnpm install --frozen-lockfile --shamefully-hoist


# Copy app source
COPY apps/api ./apps/api

# Build workspace packages the API imports. Each publishes a built dist/ (their
# package.json main/types point at ./dist), so neither tsc (build) nor node
# (runtime require) can resolve them until built.
RUN pnpm --filter @tarodan/types build
RUN pnpm --filter @tarodan/i18n build
RUN pnpm --filter @tarodan/logger build

# Generate Prisma client
WORKDIR /app/apps/api
RUN pnpm prisma generate
WORKDIR /app

# Build
RUN pnpm --filter @tarodan/api build

# Build seed (compiled seed runnable in prod: npm run db:reset:prod / seed:prod)
RUN pnpm --filter @tarodan/api build:seed

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install OpenSSL (needed for Prisma)
RUN apk add --no-cache openssl

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy built files with correct ownership (avoids slow chown -R over node_modules)
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist-seed ./dist-seed
# Copy root node_modules. Hoisting makes third-party deps real files here, but
# workspace deps are still SYMLINKS: node_modules/@tarodan/* -> /app/packages/*.
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
# ...so the symlink targets must exist in the runner too, or `require()` throws
# MODULE_NOT_FOUND. The compiled dist requires @tarodan/i18n and @tarodan/logger
# at runtime (@tarodan/types is type-only — tsc erases it, which is why a missing
# packages/ never surfaced before those two landed).
COPY --from=builder --chown=nestjs:nodejs /app/packages ./packages
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/package.json ./package.json
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/prisma ./prisma

# Copy entrypoint script (runs migrations before starting)
COPY --chown=nestjs:nodejs apps/api/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER nestjs

EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]
