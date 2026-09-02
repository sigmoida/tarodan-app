import { Prisma } from "@prisma/client";

/**
 * Fatura numarası sayacındaki YAZMA ÇAKIŞMASI politikası.
 *
 * Belge kaydı ve numara tahsisi SERIALIZABLE bir transaction'da yapılır; aynı
 * anda iki belge (komisyon + hizmet bedeli, ya da teslim tetiği + outbox) aynı
 * `elogo_doc_sequences` satırını artırınca Postgres kaybedeni serialization
 * hatasıyla düşürür ve Prisma bunu P2034 ("write conflict or deadlock") olarak
 * yükseltir. Kaybeden transaction geri alınır — numara tüketilmez, kayıt
 * oluşmaz — dolayısıyla tek doğru tepki AYNI işi kısa bir bekleme sonrası
 * yeniden denemektir. Hata yutulup cron'a bırakıldığında fatura 10 dakikaya
 * kadar gecikiyor ve her çok belgeli teslimat Sentry'ye hata düşürüyordu.
 */

/** Postgres serialization/deadlock hatası mı? Prisma kodu ve mesaj birlikte bakılır. */
export function isWriteConflictError(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  ) {
    return true;
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "P2034") return true;
  const message = (
    error instanceof Error ? error.message : String(error ?? "")
  ).toLowerCase();
  return (
    message.includes("write conflict") ||
    message.includes("could not serialize") ||
    message.includes("deadlock detected")
  );
}

export const WRITE_CONFLICT_MAX_ATTEMPTS = 4;

/**
 * `fn`'i yazma çakışmasında kısa ve artan beklemeyle yeniden dener; başka her
 * hata olduğu gibi yükselir. Deneme sayısı tükenince son çakışma hatası fırlar.
 */
export async function retryOnWriteConflict<T>(
  fn: () => Promise<T>,
  opts: {
    attempts?: number;
    baseDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (attempt: number, error: unknown) => void;
  } = {},
): Promise<T> {
  const attempts = opts.attempts ?? WRITE_CONFLICT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? 40;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isWriteConflictError(error) || attempt === attempts) throw error;
      lastError = error;
      opts.onRetry?.(attempt, error);
      // 40, 80, 160 ms + küçük jitter: eşzamanlı kaybedenler aynı anda dönmesin.
      const delay =
        baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 25);
      await sleep(delay);
    }
  }
  throw lastError;
}
