import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(apiRoot, ".env"), quiet: true });

const mode = process.argv[2];
const commands = {
  seed: ["exec", "prisma", "db", "seed"],
  reset: ["exec", "prisma", "migrate", "reset", "--force"],
};

if (!commands[mode]) {
  console.error("Usage: node scripts/run-local-prisma.mjs <seed|reset>");
  process.exit(2);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required in apps/api/.env.");
  process.exit(1);
}

let databaseUrl;
try {
  databaseUrl = new URL(process.env.DATABASE_URL);
} catch {
  console.error("DATABASE_URL is not a valid URL.");
  process.exit(1);
}

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "postgres"]);
const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
const isLocalDatabase =
  ["postgres:", "postgresql:"].includes(databaseUrl.protocol) &&
  localHosts.has(databaseUrl.hostname) &&
  (databaseName === "tarodan" || databaseName.startsWith("tarodan_"));

if (process.env.NODE_ENV === "production" || !isLocalDatabase) {
  console.error(
    `Refusing local ${mode}: DATABASE_URL must target a local tarodan database.`,
  );
  process.exit(1);
}

console.log(
  `Running local ${mode} against ${databaseName}@${databaseUrl.hostname}.`,
);

const result = spawnSync("pnpm", commands[mode], {
  cwd: apiRoot,
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || "development",
    SEED_SKIP_IMAGES: "1",
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
