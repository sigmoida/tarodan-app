import type { Prisma, PrismaClient } from "@prisma/client";

type TransactionRunner = Pick<PrismaClient, "$transaction">;

export interface ReadSnapshotLimits {
  /** Postgres `statement_timeout` for each statement, transaction-local. */
  statementTimeoutMs: number;
  /** Prisma interactive transaction timeout (the whole callback). */
  transactionTimeoutMs: number;
}

export interface BoundedWriteLimits extends ReadSnapshotLimits {
  /** Postgres `lock_timeout`: give up instead of queueing behind a lock. */
  lockTimeoutMs: number;
}

/** A bound connection can wait for a pool slot this long before failing. */
const MAX_WAIT_MS = 5_000;

const ms = (value: number): string => String(Math.max(1, Math.floor(value)));

/**
 * Runs `fn` in a READ ONLY, REPEATABLE READ transaction: every statement sees
 * one snapshot, nothing can be written, and each statement is cut off by
 * `statement_timeout`. For background batch reads over hot tables: plain MVCC
 * reads, no row locks, and a slow plan fails the batch instead of running on.
 *
 * Both settings are transaction-local (`SET TRANSACTION`, `set_config(..,
 * true)`), so they end with the transaction and never leak into the pool.
 */
export function inReadOnlySnapshot<T>(
  prisma: TransactionRunner,
  limits: ReadSnapshotLimits,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      // Must be the first statement: the snapshot is taken by the next query.
      await tx.$executeRaw`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`;
      await tx.$queryRaw`SELECT set_config('statement_timeout', ${ms(limits.statementTimeoutMs)}, true)`;
      return fn(tx);
    },
    { timeout: limits.transactionTimeoutMs, maxWait: MAX_WAIT_MS },
  );
}

/**
 * Runs `fn` in a write transaction with a short `lock_timeout` and a
 * `statement_timeout`, both transaction-local. For background writes that must
 * never queue behind (or hold up) interactive traffic: a lock wait fails fast
 * and the caller retries on the next run.
 */
export function inBoundedWrite<T>(
  prisma: TransactionRunner,
  limits: BoundedWriteLimits,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT
        set_config('lock_timeout', ${ms(limits.lockTimeoutMs)}, true),
        set_config('statement_timeout', ${ms(limits.statementTimeoutMs)}, true)`;
      return fn(tx);
    },
    { timeout: limits.transactionTimeoutMs, maxWait: MAX_WAIT_MS },
  );
}
