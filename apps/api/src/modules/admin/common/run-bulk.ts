import { HttpException } from "@nestjs/common";
import { errorMessage } from "../../../common/helpers/error-message";
import { isLocalizedMessage } from "../../i18n";

export interface BulkFailure {
  id: string;
  /** Katalog anahtarı (HttpException) ya da ham hata mesajı. */
  error: string;
}

export interface BulkResult {
  succeeded: string[];
  failed: BulkFailure[];
}

/**
 * Toplu admin işlemi: her id için tekil iş mantığı SIRAYLA çalışır, biri
 * düşerse diğerleri devam eder. Tekil yol audit/bildirim/cache yan etkilerini
 * zaten üstlendiği için toplu yol onu sarmalar, kopyalamaz.
 *
 * Sıralı olması bilinçli: ban gibi işlemler ağır transaction'lar ve SMTP
 * çağrıları içerir; paralel koşmak havuzu tüketir.
 */
export async function runBulk(
  ids: readonly string[],
  action: (id: string) => Promise<unknown>,
): Promise<BulkResult> {
  const result: BulkResult = { succeeded: [], failed: [] };
  for (const id of ids) {
    try {
      await action(id);
      result.succeeded.push(id);
    } catch (error) {
      result.failed.push({ id, error: bulkErrorText(error) });
    }
  }
  return result;
}

function bulkErrorText(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (isLocalizedMessage(response)) return response.i18nKey;
  }
  return errorMessage(error);
}
