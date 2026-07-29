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

async function clearRedis(): Promise<void> {
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
  await clearRedis();
  await clearSearchIndices(prefix);
  console.log("Production Redis database and search indices are clean.");
}

main().catch((error) => {
  console.error("Production runtime reset failed.", error);
  process.exitCode = 1;
});
