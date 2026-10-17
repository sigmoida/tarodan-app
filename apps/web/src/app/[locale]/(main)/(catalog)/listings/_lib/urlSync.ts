/** @format */

/** Parametre sırasından bağımsız karşılaştırma için URL sorgusunu sıralar. */
export function normalizeParams(p: URLSearchParams): string {
  return new URLSearchParams(
    Array.from(p.entries()).sort((a, b) => a[0].localeCompare(b[0])),
  ).toString();
}

export interface UrlWriteTracker {
  /** Durum→URL yönünde `router.replace` ile yazılan sorguyu kaydet. */
  recordWrite(params: URLSearchParams): void;
  /**
   * Gelen URL bizim yazdıklarımızdan biri mi? Evetse o yazım ve ondan ÖNCEKİ
   * (artık eskimiş) yazımlar düşülür ve `true` döner — durum zaten daha yeni,
   * URL'den geri okunmaz. Hayırsa dışarıdan bir gezinmedir (geri/ileri, menü
   * linki): bekleyen yazımlar unutulur ve `false` döner, URL benimsenir.
   */
  isOwnWrite(params: URLSearchParams): boolean;
}

/**
 * URL→durum eşitlemesinin kendi yazımlarımızı geri okumasını engeller.
 *
 * Hızlı ardışık seçimlerde (kırmızı, sonra siyah) ilk `router.replace` URL'e
 * yansıdığında durum çoktan [kırmızı, siyah] olur; o eski URL'i benimsemek
 * siyahı silerdi. Bu yüzden yalnızca bizden gelmeyen URL değişiklikleri
 * duruma yazılır.
 */
export function createUrlWriteTracker(): UrlWriteTracker {
  const pending: string[] = [];
  return {
    recordWrite(params) {
      pending.push(normalizeParams(params));
    },
    isOwnWrite(params) {
      const idx = pending.indexOf(normalizeParams(params));
      if (idx >= 0) {
        pending.splice(0, idx + 1);
        return true;
      }
      pending.length = 0;
      return false;
    },
  };
}
