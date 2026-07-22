# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL and pnpm
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

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

# GUARD: sharp'ın platform binary'si (@img/sharp-linuxmusl-*) OPTIONAL dependency
# olarak iner ve pnpm, optional fetch başarısız olursa build'i DÜŞÜRMEZ — yalnız
# warn basıp devam eder. Böyle bir imaj "başarıyla" deploy olup runtime'da
# "Image processing (sharp) is not available" (400) üretti. Sharp'sız imaj asla
# çıkmasın: burada require ile doğrula, inmemişse build burada patlasın.
RUN node -e "const s = require('sharp'); console.log('sharp OK, libvips', s.versions.vips)"


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
# Copy root node_modules (hoisted third-party deps are real files here).
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
# pnpm links workspace deps into apps/api/node_modules/@tarodan/* (symlinks into
# /app/packages) — NOT into the root node_modules copied above. Nothing under
# /app resolves them, so `require("@tarodan/i18n")` from /app/dist threw
# MODULE_NOT_FOUND. Drop the built packages in as REAL dirs where node looks
# from /app/dist. Their own deps (e.g. i18n -> intl-messageformat) are hoisted
# into the root node_modules above, so they resolve upward from here.
# (@tarodan/types is type-only today — tsc emits no require() for it — but it is
# copied too so a future runtime import doesn't reintroduce this failure.)
COPY --from=builder --chown=nestjs:nodejs /app/packages/i18n ./node_modules/@tarodan/i18n
COPY --from=builder --chown=nestjs:nodejs /app/packages/logger ./node_modules/@tarodan/logger
COPY --from=builder --chown=nestjs:nodejs /app/packages/types ./node_modules/@tarodan/types
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/package.json ./package.json
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/prisma ./prisma

# GUARD (runner): node_modules kopyası sonrası sharp hâlâ yükleniyor olmalı —
# builder'daki doğrulamanın kopya katmanında da geçerli olduğunu garantiler.
RUN node -e "require('sharp')"

# Copy entrypoint script (runs migrations before starting)
COPY --chown=nestjs:nodejs apps/api/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER nestjs

EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]
