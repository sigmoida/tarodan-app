import { Client } from "@elastic/elasticsearch";
import Redis from "ioredis";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function productionIndexPrefix(): string {
  if (process.env.APP_ENV !== "production") {
    throw new Error("Runtime reset requires APP_ENV=production");
  }

  const raw =
    process.env.ELASTICSEARCH_INDEX_PREFIX?.trim() ||
    process.env.APP_ENV.trim();
  const prefix = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (prefix !== "production") {
    throw new Error(
      "Runtime reset requires ELASTICSEARCH_INDEX_PREFIX=production (or APP_ENV=production with no override)",
    );
  }
  return prefix;
}

async function clearCacheRedis(): Promise<void> {
  const redis = new Redis(required("REDIS_URL"), {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });
  try {
    // flushdb is deliberately scoped to the database selected by REDIS_URL.
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
}

/**
 * Bull connects to a SEPARATE, durable Redis via REDIS_HOST/REDIS_PORT/REDIS_PASSWORD
 * (bull-root.module.ts) — flushing the cache URL does not touch it. Left alone,
 * every delayed job scheduled before the wipe (payment expiry, payouts, emails,
 * DLQ entries) survives and then fires against order/payment ids that no longer
 * exist. Repeatable crons are re-registered by the schedulers on the API boot
 * that follows this reset, so clearing the queue state is safe.
 */
async function clearQueueRedis(): Promise<void> {
  const redis = new Redis({
    host: required("REDIS_HOST"),
    port: Number(process.env.REDIS_PORT?.trim() || 6379),
    password: process.env.REDIS_PASSWORD?.trim() || undefined,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });
  try {
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
}

async function clearSearchIndices(prefix: string): Promise<void> {
  const node =
    process.env.ELASTICSEARCH_URL?.trim() || required("ELASTICSEARCH_NODE");
  const username = required("ELASTICSEARCH_USERNAME");
  const password = required("ELASTICSEARCH_PASSWORD");
  const client = new Client({ node, auth: { username, password } });

  try {
    await client.indices.delete({
      index: [`${prefix}-products`, `${prefix}-collections`],
      ignore_unavailable: true,
    });
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  const prefix = productionIndexPrefix();
  await clearCacheRedis();
  await clearQueueRedis();
  await clearSearchIndices(prefix);
  console.log(
    "Production cache Redis, queue Redis and search indices are clean.",
  );
}

main().catch((error) => {
  console.error("Production runtime reset failed.", error);
  process.exitCode = 1;
});
