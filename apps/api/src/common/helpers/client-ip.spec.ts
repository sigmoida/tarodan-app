import { GATEWAY_CLIENT_IP_HEADER } from "@tarodan/types";
import {
  USER_AGENT_MAX_LENGTH,
  clientIpThrottleTracker,
  isPrivateAddress,
  resolveClientIp,
  resolveUserAgent,
} from "./client-ip";

describe("client-ip", () => {
  it("başlık adı web gateway'iyle sözleşmelidir (packages/auth proxy.ts)", () => {
    // Gateway types paketine bağlı değil; iki taraf da bu değere iğnelenir.
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
    ])("%s özel ağdır", (ip) => {
      expect(isPrivateAddress(ip)).toBe(true);
    });

    it.each(["85.105.10.20", "8.8.8.8", "2a00:1450::1", "", "not-an-ip"])(
      "%s özel ağ değildir",
      (ip) => {
        expect(isPrivateAddress(ip)).toBe(false);
      },
    );
  });

  describe("resolveClientIp", () => {
    it("gateway'den (özel ağ) gelen istekte taşınan tarayıcı IP'sini kullanır", () => {
      expect(
        resolveClientIp({
          ip: "172.18.0.4",
          headers: { [GATEWAY_CLIENT_IP_HEADER]: "85.105.10.20" },
        }),
      ).toBe("85.105.10.20");
    });

    it("dışarıdan gelen istekte başlığı YOK sayar — uydurulan IP kanıta geçmez", () => {
      expect(
        resolveClientIp({
          ip: "31.200.1.1",
          headers: { [GATEWAY_CLIENT_IP_HEADER]: "1.2.3.4" },
        }),
      ).toBe("31.200.1.1");
    });

    it("geçersiz başlık değerini yok sayıp bağlantı IP'sine düşer", () => {
      expect(
        resolveClientIp({
          ip: "10.0.0.2",
          headers: { [GATEWAY_CLIENT_IP_HEADER]: "<script>" },
        }),
      ).toBe("10.0.0.2");
    });

    it("IPv4-mapped bağlantı adresini düz IPv4 yazar", () => {
      expect(resolveClientIp({ ip: "::ffff:85.105.10.20", headers: {} })).toBe(
        "85.105.10.20",
      );
    });

    it("hiç adres yoksa null döner", () => {
      expect(resolveClientIp({ headers: {} })).toBeNull();
    });
  });

  it("kullanıcı ajanını üst sınırda keser", () => {
    const ua = "x".repeat(USER_AGENT_MAX_LENGTH + 50);
    expect(resolveUserAgent({ headers: { "user-agent": ua } })).toHaveLength(
      USER_AGENT_MAX_LENGTH,
    );
    expect(resolveUserAgent({ headers: {} })).toBeNull();
  });

  it("hız sınırı iz sürücüsü gateway trafiğini tarayıcı başına ayırır", async () => {
    await expect(
      clientIpThrottleTracker({
        ip: "10.0.0.9",
        headers: { [GATEWAY_CLIENT_IP_HEADER]: "85.105.10.21" },
      }),
    ).resolves.toBe("85.105.10.21");
  });
});
