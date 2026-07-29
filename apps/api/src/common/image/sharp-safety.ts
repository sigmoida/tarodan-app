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
