/**
 * Trigger a browser download of raw content as a file. The single source of
 * truth for the "Blob + anchor + revoke" boilerplate. `content` may be a string
 * or any BlobPart.
 */
export function downloadBlob(
  filename: string,
  content: BlobPart,
  type = "text/csv;charset=utf-8;",
): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Safari/Firefox indirmeyi click()'ten SONRA başlatır; URL'yi hemen bırakmak
  // dosyayı boş/iptal bırakabilir.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

const REVOKE_DELAY_MS = 10_000;
