import { BlockList, isIP } from "net";
import { GATEWAY_CLIENT_IP_HEADER } from "@tarodan/types";

/**
 * İsteğin GERÇEK istemci IP'si — onay kayıtlarının "nereden" kanıtı ve o
 * kayıtların hız sınırı için.
 *
 * Web tarayıcısı API'ye doğrudan değil, web sunucusundaki gateway (BFF)
 * üzerinden gelir: API'nin gördüğü bağlantı web sunucusunundur, yani `req.ip`
 * her web ziyaretçisi için aynı değeri verir. Gateway tarayıcının IP'sini
 * `GATEWAY_CLIENT_IP_HEADER` ile taşır.
 *
 * Başlığa YALNIZ özel ağdan gelen bağlantıda güvenilir: gateway API'ye iç
 * ağdan bağlanır, dış dünyadan gelen istek ise API'nin önündeki vekil
 * üzerinden gelir ve `req.ip` (trust proxy) onun gerçek IP'sidir. Böylece
 * API'yi doğrudan çağıran biri başlığı uydurarak ne kanıtı ne de hız sınırı
 * kovasını değiştirebilir.
 */

const PRIVATE_RANGES = (() => {
  const list = new BlockList();
  list.addSubnet("10.0.0.0", 8, "ipv4");
  list.addSubnet("172.16.0.0", 12, "ipv4");
  list.addSubnet("192.168.0.0", 16, "ipv4");
  list.addSubnet("127.0.0.0", 8, "ipv4");
  list.addSubnet("100.64.0.0", 10, "ipv4"); // CGNAT / konteyner ağları
  list.addAddress("::1", "ipv6");
  list.addSubnet("fc00::", 7, "ipv6"); // unique local
  list.addSubnet("fe80::", 10, "ipv6"); // link local
  return list;
})();

/** `::ffff:10.0.0.5` gibi IPv4-mapped adresleri düz IPv4'e indirger. */
function unmapIpv4(ip: string): string {
  return ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}

export function isPrivateAddress(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const plain = unmapIpv4(ip.trim());
  const family = isIP(plain);
  if (family === 0) return false;
  return PRIVATE_RANGES.check(plain, family === 4 ? "ipv4" : "ipv6");
}

interface ClientIpRequest {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: Record<string, string | string[] | undefined>;
}

function headerValue(req: ClientIpRequest, name: string): string | undefined {
  const raw = req.headers?.[name];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() || undefined;
}

export function resolveClientIp(req: ClientIpRequest): string | null {
  const peer = req.ip || req.socket?.remoteAddress || null;
  const forwarded = headerValue(req, GATEWAY_CLIENT_IP_HEADER);
  if (forwarded && isIP(forwarded) !== 0 && isPrivateAddress(peer)) {
    return unmapIpv4(forwarded);
  }
  return peer ? unmapIpv4(peer) : null;
}

/** Kanıt kaydı için kullanıcı ajanı; aşırı uzun değer satırı şişirmesin. */
export const USER_AGENT_MAX_LENGTH = 512;

export function resolveUserAgent(req: ClientIpRequest): string | null {
  const ua = headerValue(req, "user-agent");
  return ua ? ua.slice(0, USER_AGENT_MAX_LENGTH) : null;
}

/**
 * `@Throttle` için iz sürücü: gateway trafiği tek bir web sunucusu IP'sinde
 * toplanmasın, her tarayıcı kendi kovasına düşsün (yukarıdaki güven kuralıyla).
 */
export async function clientIpThrottleTracker(
  req: Record<string, unknown>,
): Promise<string> {
  return resolveClientIp(req as ClientIpRequest) ?? "unknown";
}
