/**
 * Trigger a browser download of raw content (CSV, JSON, …) as a file. The single
 * source of truth for the "Blob + anchor + revoke" boilerplate that every export
 * button used to hand-roll. `content` may be a string or any BlobPart.
 */
export function downloadBlob(
  filename: string,
  content: BlobPart,
  type = 'text/csv;charset=utf-8;',
): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
