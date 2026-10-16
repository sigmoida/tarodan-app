/**
 * İçeriğin gösterildiği istemci (Prisma `ContentPlatform`): `web` = site,
 * `app` = mobil uygulama, `all` = ikisi. Hero slaytı ve reklam ortak kullanır.
 */
export const CONTENT_PLATFORMS = ["web", "app", "all"] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];

/** İçeriği isteyen istemci (`?platform=`); `all` bir istemci değildir. */
export const CLIENT_PLATFORMS = ["web", "app"] as const;
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

/** Bir istemcinin gördüğü içerik hedefleri: kendisi + `all`. */
export function contentPlatformsFor(client: ClientPlatform): ContentPlatform[] {
  return [client, "all"];
}

/** Bu hedefteki içerik hangi istemcilerde görünür (`all` → ikisi). */
export function clientPlatformsOf(platform: ContentPlatform): ClientPlatform[] {
  return platform === "all" ? [...CLIENT_PLATFORMS] : [platform];
}
