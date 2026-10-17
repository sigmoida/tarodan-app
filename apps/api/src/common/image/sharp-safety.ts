// Loaders with open libvips/librsvg advisories on the pinned sharp 0.34.5
// (docs/SHARP_HOST_UPGRADE.md). SVG is never a valid upload; blocking its
// loader keeps librsvg (GHSA-wq5f-xc86-pv6w) out of reach of user content.
const BLOCKED_SHARP_LOADERS = [
  "VipsForeignLoadNsgif",
  "VipsForeignLoadSvg",
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
