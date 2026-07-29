import { readFileSync } from "fs";
import { resolve } from "path";

describe("cookie authentication CSRF contract", () => {
  const appModule = readFileSync(resolve(__dirname, "app.module.ts"), "utf8");
  const main = readFileSync(resolve(__dirname, "main.ts"), "utf8");

  it("registers a global CSRF guard for cookie-authenticated mutations", () => {
    expect(appModule).toMatch(
      /provide:\s*APP_GUARD[\s\S]{0,200}useClass:\s*CsrfGuard/,
    );
  });

  it("allows the web client to send the CSRF token header", () => {
    expect(main).toContain("X-CSRF-Token");
  });
});
