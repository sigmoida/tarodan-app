#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }

  return result.stdout?.trim() ?? "";
}

const exists = run(
  "docker",
  [
    "exec",
    "tarodan-postgres",
    "psql",
    "-U",
    "postgres",
    "-tAc",
    "SELECT 1 FROM pg_database WHERE datname='tarodan_test'",
  ],
  { capture: true },
);

if (exists !== "1") {
  console.log("Creating local tarodan_test database.");
  run("docker", [
    "exec",
    "tarodan-postgres",
    "createdb",
    "-U",
    "postgres",
    "tarodan_test",
  ]);
} else {
  console.log("Local tarodan_test database already exists.");
}
