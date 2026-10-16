import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const wellKnown = (file) => `public/.well-known/${file}`;

const STAGING_PACKAGE = "com.tarodan.app.staging";
const PROD_PACKAGE = "com.tarodan.app";
const SHA256 = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

test("staging assetlinks declares only the staging package with valid fingerprints", () => {
  const statements = JSON.parse(read(wellKnown("assetlinks-staging.json")));

  assert.equal(statements.length, 1);
  const [statement] = statements;
  assert.deepEqual(statement.relation, [
    "delegate_permission/common.handle_all_urls",
  ]);
  assert.equal(statement.target.namespace, "android_app");
  // Staging dosyası production paketini ASLA taşımaz: staging host'u canlı
  // uygulamanın bağlantı sahipliğini doğrulayamamalı.
  assert.equal(statement.target.package_name, STAGING_PACKAGE);
  assert.notEqual(statement.target.package_name, PROD_PACKAGE);
  assert.ok(statement.target.sha256_cert_fingerprints.length >= 1);
  for (const fingerprint of statement.target.sha256_cert_fingerprints) {
    assert.match(fingerprint, SHA256);
  }
});

test("production assetlinks declares only the production package with valid fingerprints", () => {
  const statements = JSON.parse(read(wellKnown("assetlinks.json")));

  assert.equal(statements.length, 1);
  const [statement] = statements;
  assert.equal(statement.target.namespace, "android_app");
  // Canlı dosya staging paketini ASLA taşımaz (ve tersi, yukarıda).
  assert.equal(statement.target.package_name, PROD_PACKAGE);
  assert.ok(statement.target.sha256_cert_fingerprints.length >= 1);
  for (const fingerprint of statement.target.sha256_cert_fingerprints) {
    assert.match(fingerprint, SHA256);
  }
});

test("only the staging host is rewritten onto the staging file", () => {
  // Kural `well-known-rewrites.js`te tek kaynak (next.config.js onu yayar);
  // host koşulu sayesinde production kendi assetlinks.json'ını sunar.
  const rules = read("well-known-rewrites.js");
  const start = rules.indexOf("source: '/.well-known/assetlinks.json'");
  assert.notEqual(start, -1, "missing assetlinks rewrite");
  const rule = rules.slice(start, rules.indexOf("},", start));

  assert.match(rule, /type: 'host', value: STAGING_HOST/);
  assert.match(rules, /const STAGING_HOST = 'staging\.tarodan\.com\.tr';/);
  assert.match(rule, /destination: '\/\.well-known\/assetlinks-staging\.json'/);
  assert.ok(existsSync(new URL(wellKnown("assetlinks-staging.json"), root)));
  assert.match(read("next.config.js"), /\.\.\.wellKnownStagingRewrites/);
});
