/** @format */

import { describe, expect, it } from "vitest";
import { Linter, type Rule } from "eslint";
import plugin from "@tarodan/eslint-plugin";

/**
 * The guard that keeps listing links on `listingPath()` (ADR 0017): the
 * `@tarodan/no-hand-built-listing-path` rule, enabled for web and admin.
 */
const RULE = "no-hand-built-listing-path";

function problems(code: string): number {
  const linter = new Linter();
  // The plugin is plain CommonJS, so its JSON-ish literal types are widened.
  linter.defineRule(RULE, plugin.rules[RULE] as Rule.RuleModule);
  return linter.verify(code, {
    rules: { [RULE]: "error" },
    parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  }).length;
}

describe("no-hand-built-listing-path", () => {
  it.each([
    "const href = `/listings/${id}`;",
    "const href = `/en/listings/${id}`;",
    "const url = `${SITE_URL}/listings/${p.id}`;",
    "const url = `https://tarodan.com.tr/listings/${id}`;",
    "const href = '/listings/' + id;",
  ])("reports %s", (code) => {
    expect(problems(code)).toBe(1);
  });

  it.each([
    "const href = listingPath({ id, title });",
    "const edit = `/listings/${id}/edit`;",
    "const back = `/login?redirect=/listings/${id}/edit`;",
    "const api = `/admin/listings/${id}`;",
    "const list = '/listings';",
    "const q = `/listings?categoryId=${id}`;",
  ])("allows %s", (code) => {
    expect(problems(code)).toBe(0);
  });
});
