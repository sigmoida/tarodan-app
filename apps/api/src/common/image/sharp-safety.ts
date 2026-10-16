const BLOCKED_SHARP_LOADERS = [
  "VipsForeignLoadNsgif",
  "VipsForeignLoadTiff",
  "VipsForeignLoadVips",
] as const;

type SharpModule = {
  block(options: { operation: readonly string[] }): void;
};

export function configureSharpSafety<T extends SharpModule>(sharp: T): T {
  sharp.block({ operation: BLOCKED_SHARP_LOADERS });
  return sharp;
}

export function isBlockedSharpMimeType(mimeType: string): boolean {
  return ["image/gif", "image/tiff", "image/x-tiff"].includes(
    mimeType.toLowerCase(),
  );
}

type SharpFactory = typeof import("sharp");

let cachedSharp: SharpFactory | null | undefined;

/**
 * Güvenlik ayarlı sharp (bir kez yüklenir); native modül yüklenemezse `null`.
 * Kendi sharp örneği olmayan servisler (ör. satıcı belgeleri) bunu kullanır.
 */
export function loadSafeSharp(): SharpFactory | null {
  if (cachedSharp === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      cachedSharp = configureSharpSafety(require("sharp") as SharpFactory);
    } catch {
      cachedSharp = null;
    }
  }
  return cachedSharp;
}
