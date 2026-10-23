import { GATEWAY_CLIENT_IP_HEADER } from "@tarodan/types";
import {
  USER_AGENT_MAX_LENGTH,
  clientIpThrottleTracker,
  isPrivateAddress,
  resolveClientIp,
  resolveUserAgent,
} from "./client-ip";

describe("client-ip", () => {
  it("the header name matches the web gateway (packages/auth proxy.ts)", () => {
    // The gateway does not depend on the types package; both sides pin this value.
    expect(GATEWAY_CLIENT_IP_HEADER).toBe("x-tarodan-client-ip");
  });

  describe("isPrivateAddress", () => {
    it.each([
      "10.0.0.7",
      "172.18.0.3",
      "192.168.1.20",
      "127.0.0.1",
      "::1",
      "::ffff:10.0.0.5",
      "fd12:3456::1",
    ])("%s is a private address", (ip) => {
      expect(isPrivateAddress(ip)).toBe(true);
    });

    it.each(["85.105.10.20", "8.8.8.8", "2a00:1450::1", "", "not-an-ip"])(
      "%s is not a private address",
      (ip) => {
        expect(isPrivateAddress(ip)).toBe(false);
      },
    );
  });

  describe("resolveClientIp", () => {
    it("uses the forwarded browser IP on a request from the gateway (private network)", () => {
      expect(
        resolveClientIp({
          ip: "172.18.0.4",
          headers: { [GATEWAY_CLIENT_IP_HEADER]: "85.105.10.20" },
        }),
      ).toBe("85.105.10.20");
    });

    it("ignores the header on a request from outside, so a forged IP never becomes evidence", () => {
      expect(
        resolveClientIp({
          ip: "31.200.1.1",
          headers: { [GATEWAY_CLIENT_IP_HEADER]: "1.2.3.4" },
        }),
      ).toBe("31.200.1.1");
    });

    it("ignores an invalid header value and falls back to the connection IP", () => {
      expect(
        resolveClientIp({
          ip: "10.0.0.2",
          headers: { [GATEWAY_CLIENT_IP_HEADER]: "<script>" },
        }),
      ).toBe("10.0.0.2");
    });

    it("writes an IPv4-mapped connection address as plain IPv4", () => {
      expect(resolveClientIp({ ip: "::ffff:85.105.10.20", headers: {} })).toBe(
        "85.105.10.20",
      );
    });

    it("returns null without any address", () => {
      expect(resolveClientIp({ headers: {} })).toBeNull();
    });
  });

  it("cuts the user agent at the upper bound", () => {
    const ua = "x".repeat(USER_AGENT_MAX_LENGTH + 50);
    expect(resolveUserAgent({ headers: { "user-agent": ua } })).toHaveLength(
      USER_AGENT_MAX_LENGTH,
    );
    expect(resolveUserAgent({ headers: {} })).toBeNull();
  });

  describe("clientIpThrottleTracker", () => {
    it("splits gateway traffic into one bucket per browser", async () => {
      await expect(
        clientIpThrottleTracker({
          ip: "10.0.0.9",
          headers: { [GATEWAY_CLIENT_IP_HEADER]: "85.105.10.21" },
        }),
      ).resolves.toBe("85.105.10.21");
    });

    it("keeps an IPv4 connection address as it is", async () => {
      await expect(
        clientIpThrottleTracker({ ip: "85.105.10.22", headers: {} }),
      ).resolves.toBe("85.105.10.22");
    });

    // Like the throttler's own default tracker (`normalizeIp(req.ip, 64)`):
    // one IPv6 /64 is one client, so rotating addresses inside it does not
    // open new buckets.
    const SAME_SUBNET = ["2a00:1450:4001:81a::1", "2a00:1450:4001:81a::2"];

    it("puts two connection addresses of one IPv6 /64 into one bucket", async () => {
      const [first, second] = await Promise.all(
        SAME_SUBNET.map((ip) => clientIpThrottleTracker({ ip, headers: {} })),
      );
      expect(first).toBe(second);
      expect(first).toBe("2a00:1450:4001:81a::/64");
    });

    it("puts two gateway-forwarded addresses of one IPv6 /64 into one bucket", async () => {
      const [first, second] = await Promise.all(
        SAME_SUBNET.map((forwarded) =>
          clientIpThrottleTracker({
            ip: "172.18.0.4",
            headers: { [GATEWAY_CLIENT_IP_HEADER]: forwarded },
          }),
        ),
      );
      expect(first).toBe(second);
      expect(first).toBe("2a00:1450:4001:81a::/64");
    });

    it("keeps different IPv6 /64s apart", async () => {
      const [first, second] = await Promise.all(
        ["2a00:1450:4001:81a::1", "2a00:1450:4001:81b::1"].map((ip) =>
          clientIpThrottleTracker({ ip, headers: {} }),
        ),
      );
      expect(first).not.toBe(second);
    });

    it("falls back to one shared bucket without any address", async () => {
      await expect(clientIpThrottleTracker({ headers: {} })).resolves.toBe(
        "unknown",
      );
    });
  });
});
