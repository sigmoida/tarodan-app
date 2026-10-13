/**
 * Yeniden denemenin sonucu değiştirmeyeceği handler hatası (ör. sağlayıcının
 * "istemci kimliğin geçersiz" yanıtı, okunamayan anahtar). Drainer bu hatada
 * geri çekilip tekrar denemez, işi doğrudan DLQ'ya (`dead`) alır — alarm hemen
 * görünür ve kuyruk aynı hatayla saatlerce meşgul olmaz. Geçici hatalar (ağ,
 * 5xx, zaman aşımı) düz `Error` fırlatmaya devam eder.
 */
export class PermanentOutboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentOutboxError";
  }
}
