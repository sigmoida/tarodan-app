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

# Copy photos for seed data
COPY photos ./photos

# Copy app source
COPY apps/api ./apps/api

# Generate Prisma client
WORKDIR /app/apps/api
RUN pnpm prisma generate
WORKDIR /app

# Build
RUN pnpm --filter @tarodan/api build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install OpenSSL (needed for Prisma)
RUN apk add --no-cache openssl

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy built files
COPY --from=builder /app/apps/api/dist ./dist
# Copy root node_modules (hoisted = real files, not symlinks)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./package.json
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/photos ./photos

# Copy entrypoint script (runs migrations before starting)
COPY apps/api/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Set ownership
RUN chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]
