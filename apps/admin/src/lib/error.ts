/**
 * Extracts the backend error message used by NestJS/axios responses.
 * Validation failures can contain multiple messages; keep all of them visible.
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { message?: unknown } } })
    ?.response?.data?.message;

  if (typeof message === "string" && message.trim()) return message;

  if (Array.isArray(message)) {
    const messages = message.filter(
      (item): item is string =>
        typeof item === "string" && Boolean(item.trim()),
    );
    if (messages.length > 0) return messages.join(" ");
  }

  return fallback;
}

/**
 * Sunucu hatasının katalog anahtarı (API `AllExceptionsFilter` gövdedeki
 * `i18nKey`); yoksa null. Belirli bir hatada farklı davranmak için (ör.
 * iptalde "tür değişti" → önizlemeyi tazele) metne değil anahtara bakılır.
 */
export function extractErrorI18nKey(error: unknown): string | null {
  const key = (error as { response?: { data?: { i18nKey?: unknown } } })
    ?.response?.data?.i18nKey;
  return typeof key === "string" && key ? key : null;
}

/**
 * Toplu içe aktarma uçlarının satır bazlı hata listesini çıkarır.
 *
 * Sunucu `BadRequestException({ code, message, errors })` gövdesi döner; bu
 * gövde NestJS'in exception filtresinden geçerken sarmalanabildiği için üç
 * olası yol da denenir. Liste yoksa tek satırlık genel mesaja düşülür.
 */
export function extractImportErrors(
  error: unknown,
  fallback: string,
): string[] {
  const body = (error as { response?: { data?: any } })?.response?.data;
  const candidates = [
    body?.errors,
    body?.message?.errors,
    body?.message?.details?.errors,
  ];
  const errors = candidates.find(Array.isArray) as unknown[] | undefined;
  return errors ? errors.map(String) : [extractErrorMessage(error, fallback)];
}

export function isNotFoundError(error: unknown): boolean {
  return (
    (error as { response?: { status?: number } })?.response?.status === 404
  );
}
