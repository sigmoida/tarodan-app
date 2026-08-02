import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(webRoot, "..", "..");
const sourceDir = join(repoRoot, "photos", "logolar");
const outputDir = join(webRoot, "public", "photos", "logolar");

test("syncs every manufacturer logo into the web public directory", () => {
  rmSync(outputDir, { recursive: true, force: true });
  // Depo kökünden çalıştırılamaz: betik `@tarodan/brand`'i ÇAĞIRANIN
  // node_modules'ından çözüyor, kök workspace'te o bağlantı yok.
  execFileSync(
    process.execPath,
    ["../../scripts/sync-brand-assets.mjs", "public", "--manufacturer-logos"],
    { cwd: webRoot, stdio: "pipe" },
  );

  const sourceFiles = readdirSync(sourceDir).filter((file) =>
    /\.(png|jpe?g|webp|svg)$/i.test(file),
  );
  assert.ok(sourceFiles.length > 0);

  for (const file of sourceFiles) {
    const outputFile = join(outputDir, file);
    assert.equal(existsSync(outputFile), true, `${file} was not generated`);
    assert.deepEqual(
      readFileSync(outputFile),
      readFileSync(join(sourceDir, file)),
    );
  }
});
