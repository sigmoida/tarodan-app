import {
  DEFAULT_GITHUB_DISPATCH_REF,
  uatRefreshDispatchConfig,
} from "./uat-refresh";

describe("uatRefreshDispatchConfig", () => {
  it("returns the trigger when token and repo are set, ref defaulting to development", () => {
    expect(
      uatRefreshDispatchConfig({
        GITHUB_DISPATCH_TOKEN: " token ",
        GITHUB_DISPATCH_REPO: "sigmoida/tarodan-app",
      }),
    ).toEqual({
      token: "token",
      repo: "sigmoida/tarodan-app",
      ref: DEFAULT_GITHUB_DISPATCH_REF,
    });
    expect(DEFAULT_GITHUB_DISPATCH_REF).toBe("development");
  });

  it("honours an explicit ref", () => {
    expect(
      uatRefreshDispatchConfig({
        GITHUB_DISPATCH_TOKEN: "token",
        GITHUB_DISPATCH_REPO: "sigmoida/tarodan-app",
        GITHUB_DISPATCH_REF: "master",
      })?.ref,
    ).toBe("master");
  });

  it.each([
    {},
    { GITHUB_DISPATCH_TOKEN: "token" },
    { GITHUB_DISPATCH_REPO: "sigmoida/tarodan-app" },
    { GITHUB_DISPATCH_TOKEN: "token", GITHUB_DISPATCH_REPO: "not a repo" },
  ])("is not configured for %j", (env) => {
    expect(uatRefreshDispatchConfig(env)).toBeNull();
  });
});
