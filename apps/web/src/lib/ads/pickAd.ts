/** @format */

import type { Advertisement } from "@/lib/api/advertisements";

/**
 * Sayfa yüklemesi başına bir kez seçilen rastgele tohum: aynı sayfa görünümü
 * boyunca yuvalar sabit kalır (yeniden çizimde afiş sıçramaz), sayfa yenilenince
 * dönüşüm başlar.
 */
let pageSeed: number | null = null;

export function getRotationSeed(): number {
  if (pageSeed === null) pageSeed = Math.floor(Math.random() * 0x7fffffff);
  return pageSeed;
}

/** Yuva anahtarından kararlı küçük bir sayı (FNV-1a) — yuvalar farklı afiş alsın. */
function hashKey(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Yuvaya TEK afiş seçer. Saf: aynı (liste, yuva, tohum) her zaman aynı sonucu
 * verir. Liste boşsa `null`.
 */
export function pickAd<T>(
  ads: readonly T[],
  slotKey: string,
  seed: number = getRotationSeed(),
): T | null {
  if (ads.length === 0) return null;
  return ads[(seed + hashKey(slotKey)) % ads.length];
}
