/**
 * Panoya yazar; başarıyı döner. Pano API'si yoksa (eski tarayıcı / güvensiz
 * bağlam) ya da `writeText` reddederse (izin yok) `false` — asla fırlatmaz.
 */
export async function writeToClipboard(text: string): Promise<boolean> {
  const clipboard =
    typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (!clipboard?.writeText) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
