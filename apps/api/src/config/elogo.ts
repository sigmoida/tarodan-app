/**
 * eLogo belge numarası öneki — TEK kaynak.
 *
 * Önek `ElogoDocumentService` tarafından `ConfigService` üzerinden okunur
 * (testler sahte config verir); DI dışındaki bakım script'leri ise buradaki
 * düz accessor'ı kullanır. İkisi de aynı varsayılana düşer, böylece bir
 * script'in saydığı sayaç ile runtime'ın ilerlettiği sayaç hiç ayrışmaz.
 */
export const DEFAULT_ELOGO_INVOICE_PREFIX = "TRD";

/** `ELOGO_INVOICE_PREFIX`, boşsa varsayılan önek. */
export function elogoInvoicePrefix(): string {
  return (
    process.env.ELOGO_INVOICE_PREFIX?.trim() || DEFAULT_ELOGO_INVOICE_PREFIX
  );
}
