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

test("the staging host serves the staging file at the canonical path", () => {
  const config = read("next.config.js");
  const start = config.indexOf("source: '/.well-known/assetlinks.json'");
  assert.notEqual(start, -1, "missing assetlinks rewrite");
  const rule = config.slice(start, config.indexOf("},", start));

  assert.match(rule, /type: 'host', value: 'staging\.tarodan\.com\.tr'/);
  assert.match(rule, /destination: '\/\.well-known\/assetlinks-staging\.json'/);
  assert.ok(existsSync(new URL(wellKnown("assetlinks-staging.json"), root)));
});

test("the rewrite is host-scoped, so production keeps answering 404", () => {
  // Production dosyası Play App Signing parmak iziyle hazır olunca
  // public/.well-known/assetlinks.json olarak EKLENİR; o zamana dek eklenmemeli
  // (eksik parmak izi Android doğrulamasını kesin düşürür). Bu test o gün
  // bilinçli olarak güncellenir.
  assert.equal(
    existsSync(new URL(wellKnown("assetlinks.json"), root)),
    false,
    "assetlinks.json must not ship until the Play App Signing fingerprint is known",
  );
  const config = read("next.config.js");
  const start = config.indexOf("source: '/.well-known/assetlinks.json'");
  const rule = config.slice(start, config.indexOf("},", start));
  assert.match(rule, /has: \[/, "rewrite must be conditional on the host");
});
