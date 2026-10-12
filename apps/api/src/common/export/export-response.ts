import { StreamableFile } from "@nestjs/common";
import type { Response } from "express";

import type { ExportFile } from "./export-file";

/**
 * Admin dökümlerinin HTTP yanıtı — başlıkların TEK yazıldığı yer. Her `/export`
 * ucu dosyayı buradan döner; sözleşme spec'i (`export-catalog.contract.spec`)
 * bunu denetler. Panel bu başlıkları okur: dosya adı, kırpılma tavanı, kayıt
 * sayısı. Gateway (`packages/auth/src/proxy.ts`) aynı başlıkları tarayıcıya
 * taşır.
 */

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Tavan aşıldıysa tavan; dosya ilk N kaydı taşır. */
export const EXPORT_TRUNCATED_AT_HEADER = "X-Export-Truncated-At";

/** Dosyadaki kayıt sayısı (uzun biçimde üst kayıt). */
export const EXPORT_ROW_COUNT_HEADER = "X-Export-Row-Count";

/**
 * `attachment; filename="…"`. Ad ASCII değilse RFC 5987 `filename*` eklenir;
 * eski istemci için `filename` ASCII'ye indirgenmiş kopyayı taşır.
 */
export function contentDisposition(filename: string): string {
  if (/^[\x20-\x7e]+$/.test(filename) && !/["\\]/.test(filename)) {
    return `attachment; filename="${filename}"`;
  }
  const fallback = filename
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/["\\]/g, "");
  return `attachment; filename="${fallback || "export.xlsx"}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Dosyayı ek olarak döner. Controller `@Res({ passthrough: true })` alır ve
 * bu fonksiyonun sonucunu `return` eder — Nest akışı (interceptor, filter)
 * korunur, başlıklar yine tek yerden yazılır.
 */
export function sendExport(
  res: Pick<Response, "setHeader">,
  file: ExportFile,
): StreamableFile {
  const disposition = contentDisposition(file.filename);
  res.setHeader("Content-Type", XLSX_CONTENT_TYPE);
  res.setHeader("Content-Disposition", disposition);
  // Kişisel veri taşıyan dosya ara önbelleklerde kalmamalı.
  res.setHeader("Cache-Control", "no-store");
  res.setHeader(EXPORT_ROW_COUNT_HEADER, String(file.rowCount));
  if (file.truncatedAt !== null) {
    res.setHeader(EXPORT_TRUNCATED_AT_HEADER, String(file.truncatedAt));
  }
  return new StreamableFile(file.body, {
    type: XLSX_CONTENT_TYPE,
    disposition,
    length: file.body.length,
  });
}
