import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { localeMiddleware } from "./localeMiddleware";

/** Tarayıcı dili ve eski dil çerezi İngilizce olan bir ziyaretçi/WebView. */
const EN_VISITOR = {
  "accept-language": "en-US,en;q=0.9",
  cookie: "NEXT_LOCALE=en",
};

const run = (pathname: string, rest: string) =>
  localeMiddleware(
    new NextRequest(new URL(pathname, "https://tarodan.test"), {
      headers: EN_VISITOR,
    }),
    rest,
  );

describe("localeMiddleware — embed (/app/**) locale tespiti yapmaz", () => {
  it("öneksiz yol Türkçedir: İngilizce cihaz/çerez olsa da /en'e yönlendirilmez", () => {
    const res = run("/app/terms", "/app/terms");
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBe(
      "https://tarodan.test/tr/app/terms",
    );
  });

  it("/en öneki İngilizcedir", () => {
    const res = run("/en/app/privacy", "/app/privacy");
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBe(
      "https://tarodan.test/en/app/privacy",
    );
  });

  it("kullanıcının site dil çerezini ezmez ve hreflang başlığı eklemez", () => {
    const res = run("/app/cookies", "/app/cookies");
    expect(res.cookies.get("NEXT_LOCALE")).toBeUndefined();
    expect(res.headers.get("link")).toBeNull();
  });
});

describe("localeMiddleware — site (varsayılan) tespiti korur", () => {
  it("aynı ziyaretçi öneksiz normal yolda /en'e yönlendirilir", () => {
    const res = run("/privacy", "/privacy");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://tarodan.test/en/privacy");
  });
});
