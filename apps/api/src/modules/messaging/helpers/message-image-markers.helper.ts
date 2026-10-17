/**
 * Mesaj gövdesindeki görsel işaretleri: `[IMG:<hedef>]`.
 *
 * Web ve mobil istemciler eki gövdeye bu biçimde gömer ve işareti görsel
 * olarak çizer. Sunucu gövdeyi olduğu gibi sakladığı için kullanıcı elle
 * `[IMG:https://saldirgan/x.png]` yazabilir; gönderimde HER işaretin hedefi
 * doğrulanır (bkz. `MediaService.findInvalidMessageAttachmentTargets`).
 *
 * Tarama istemcilerden GENİŞ tutulur ki bir istemcinin çizeceği hiçbir işaret
 * gözden kaçmasın: büyük/küçük harf duyarsız, her `[IMG:` başlangıcı ayrı ayrı
 * ele alınır (iç içe/üst üste binen işaretler dahil) ve hedef bir sonraki
 * `]`'e kadar boşluk dahil her şeydir. Kapanmayan işaretin hedefi boş sayılır
 * — geçersizdir.
 */
const IMAGE_MARKER_START_RE = /\[IMG:/gi;

/** Gövdedeki her `[IMG:` işaretinin hedefi, sırasıyla (kapanmayan → ""). */
export function extractImageMarkerTargets(content: string): string[] {
  const targets: string[] = [];
  for (const match of content.matchAll(IMAGE_MARKER_START_RE)) {
    const start = (match.index ?? 0) + match[0].length;
    const end = content.indexOf("]", start);
    targets.push(end === -1 ? "" : content.slice(start, end));
  }
  return targets;
}
