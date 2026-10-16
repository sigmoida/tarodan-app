import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

const run = (pathname: string) =>
  middleware(new NextRequest(new URL(pathname, "https://tarodan.test")));

const rewrite = (res: Response) => res.headers.get("x-middleware-rewrite");

describe("middleware — site kilidi (SITE_LOCKED) ve /app/**", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_LOCKED", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("kilitliyken normal sayfa coming-soon'a yazılır", async () => {
    expect(rewrite(await run("/terms"))).toBe(
      "https://tarodan.test/tr/coming-soon",
    );
  });

  it("/app/** kilitten muaftır (uygulama ve App Review yasal sayfaları görür)", async () => {
    expect(rewrite(await run("/app/terms"))).toBe(
      "https://tarodan.test/tr/app/terms",
    );
    expect(rewrite(await run("/en/app/privacy"))).toBe(
      "https://tarodan.test/en/app/privacy",
    );
  });
});
