import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { resolveSentryRelease, sentryBuildOptions, withSentry } =
  require("../sentry.build") as typeof import("../sentry.build");
const { validateEnv } = require("../env.config");

const APP = "web";
const PROJECT = "tarodan-web";
const DSN = "https://public@o1.ingest.sentry.io/1";

describe("resolveSentryRelease", () => {
  it("prefers an explicit release", () => {
    expect(
      resolveSentryRelease({
        NEXT_PUBLIC_SENTRY_RELEASE: " v1.2.3 ",
        SOURCE_COMMIT: "abcdef1234567890",
      }),
    ).toBe("v1.2.3");
  });

  it("falls back to Coolify's commit cut to the short sha (same as the API)", () => {
    expect(resolveSentryRelease({ SOURCE_COMMIT: "abcdef1234567890" })).toBe(
      "abcdef1",
    );
  });

  it("ignores Coolify's placeholder commits", () => {
    expect(resolveSentryRelease({ SOURCE_COMMIT: "unknown" })).toBeUndefined();
    expect(resolveSentryRelease({ SOURCE_COMMIT: "HEAD" })).toBeUndefined();
    expect(resolveSentryRelease({})).toBeUndefined();
  });
});

describe("sentryBuildOptions", () => {
  it("skips source maps entirely without an auth token", () => {
    const options = sentryBuildOptions({ NEXT_PUBLIC_SENTRY_DSN: DSN });
    expect(options.sourcemaps).toEqual({
      disable: true,
      deleteSourcemapsAfterUpload: true,
    });
    expect(options.release.create).toBe(false);
  });

  it("uploads and deletes the served client maps with a token", () => {
    const options = sentryBuildOptions({
      NEXT_PUBLIC_SENTRY_DSN: DSN,
      SENTRY_AUTH_TOKEN: "token",
      SOURCE_COMMIT: "abcdef1234567890",
    });
    expect(options.sourcemaps).toEqual({
      disable: false,
      deleteSourcemapsAfterUpload: true,
    });
    expect(options.release).toEqual({
      name: "abcdef1",
      create: true,
      finalize: true,
    });
  });

  it("never lets an upload failure fail the build", () => {
    const { errorHandler } = sentryBuildOptions(
      {},
    ).unstable_sentryWebpackPluginOptions;
    expect(() => errorHandler(new Error("project not found"))).not.toThrow();
  });
});

describe("withSentry", () => {
  it("leaves the config untouched without a DSN", () => {
    const config = { reactStrictMode: true };
    expect(withSentry(config, {})).toBe(config);
  });

  it("wraps the config and inlines the resolved release with a DSN", () => {
    const wrapped = withSentry(
      { env: { NEXT_PUBLIC_API_URL: "https://api.test" } },
      {
        NEXT_PUBLIC_SENTRY_DSN: DSN,
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: "staging",
        SOURCE_COMMIT: "abcdef1234567890",
      },
    );
    expect(typeof wrapped.webpack).toBe("function");
    expect(wrapped.env).toMatchObject({
      NEXT_PUBLIC_API_URL: "https://api.test",
      NEXT_PUBLIC_SENTRY_RELEASE: "abcdef1",
    });
  });
});

describe("env.config Sentry defaults", () => {
  it("targets this app's Sentry project and treats blanks as unset", () => {
    const env = validateEnv({
      NODE_ENV: "test",
      SENTRY_ORG: "",
      SENTRY_PROJECT: "",
      SENTRY_AUTH_TOKEN: "",
      NEXT_PUBLIC_SENTRY_DSN: "",
    });
    expect(env.SENTRY_ORG).toBe("tarodan");
    expect(env.SENTRY_PROJECT).toBe(PROJECT);
    expect(env.SENTRY_AUTH_TOKEN).toBeUndefined();
    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined();
  });
});

describe(`apps/${APP}/Dockerfile`, () => {
  const dockerfile = readFileSync(
    path.join(__dirname, "..", "Dockerfile"),
    "utf8",
  );
  const lines = dockerfile.split("\n").map((line) => line.trim());

  it("passes the public Sentry values to next build", () => {
    for (const name of [
      "NEXT_PUBLIC_SENTRY_DSN",
      "NEXT_PUBLIC_SENTRY_ENVIRONMENT",
      "NEXT_PUBLIC_SENTRY_RELEASE",
      "SOURCE_COMMIT",
    ]) {
      expect(lines).toContain(`ARG ${name}`);
    }
  });

  it("never takes the auth token as a build arg (image history leak)", () => {
    expect(dockerfile).not.toMatch(/^\s*(ARG|ENV)\s+SENTRY_AUTH_TOKEN/m);
  });

  it("does not re-export public vars as ENV (Coolify build secrets mode)", () => {
    expect(dockerfile).not.toMatch(/^\s*ENV\s+NEXT_PUBLIC_/m);
  });

  it("leaves the build RUN without its own secret mount", () => {
    const build = lines.find(
      (line) => line.startsWith("RUN pnpm --filter") && line.endsWith("build"),
    );
    expect(build).toBeDefined();
    expect(build).not.toContain("--mount");
  });
});
