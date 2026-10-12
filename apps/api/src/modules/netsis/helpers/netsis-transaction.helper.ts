import type { NetsisTransactionContext } from "./netsis.types";

/** Bir transaction'ı açıp kapatabilen her şey (canlı istemci ya da stub). */
export interface NetsisTransactionControl {
  open(): Promise<string>;
  commit(transactionId: string): Promise<void>;
  rollback(transactionId: string): Promise<void>;
}

/**
 * `fn`'i bir NetOpenX transaction'ı içinde çalıştırır: başarıda commit,
 * hatada rollback, ve HER durumda `fn`'in (ya da commit'in) asıl hatası
 * yükselir — rollback'in kendi hatası onu gölgelemez, yalnız `onRollbackError`
 * ile bildirilir.
 *
 * Commit de patlarsa rollback denenir: ağ yüzünden sonucu bilinmeyen bir
 * commit'te sunucu tarafı ya zaten commit etmiştir (rollback zararsızca
 * düşer) ya da etmemiştir (yarım iş kapanır).
 *
 * Canlı ve stub aynı fonksiyonu kullanır; sıra kuralı iki yerde yazılmaz.
 */
export async function runInNetsisTransaction<T>(
  control: NetsisTransactionControl,
  fn: (tx: NetsisTransactionContext) => Promise<T>,
  onRollbackError?: (error: unknown) => void,
): Promise<T> {
  const transactionId = await control.open();
  const rollbackQuietly = async () => {
    try {
      await control.rollback(transactionId);
    } catch (rollbackError: unknown) {
      onRollbackError?.(rollbackError);
    }
  };

  let result: T;
  try {
    result = await fn({ transactionId });
  } catch (error: unknown) {
    await rollbackQuietly();
    throw error;
  }

  try {
    await control.commit(transactionId);
  } catch (error: unknown) {
    await rollbackQuietly();
    throw error;
  }
  return result;
}
