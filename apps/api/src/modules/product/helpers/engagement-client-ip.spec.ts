import { engagementClientIp } from "./engagement-client-ip";

describe("engagementClientIp", () => {
  const req = (headers: Record<string, string | string[]>) => ({ headers });

  it("takes the first hop of X-Forwarded-For", () => {
    expect(
      engagementClientIp(
        req({ "x-forwarded-for": " 85.105.10.20 , 10.0.0.3" }),
        "10.0.0.9",
      ),
    ).toBe("85.105.10.20");
  });

  it("falls back to X-Real-IP, then the socket address, then unknown", () => {
    expect(
      engagementClientIp(req({ "x-real-ip": "85.105.10.21" }), "10.0.0.9"),
    ).toBe("85.105.10.21");
    expect(engagementClientIp(req({}), "10.0.0.9")).toBe("10.0.0.9");
    expect(engagementClientIp(undefined, undefined)).toBe("unknown");
  });

  it("reads the first value of a repeated header", () => {
    expect(
      engagementClientIp(
        req({ "x-real-ip": ["85.105.10.22", "85.105.10.23"] }),
        undefined,
      ),
    ).toBe("85.105.10.22");
  });
});
