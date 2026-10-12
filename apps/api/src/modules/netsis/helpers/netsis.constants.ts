/**
 * NetOpenX REST sabitleri — yollar, önbellek anahtarları, DI token'ları.
 *
 * Yollar `{NETSIS_BASE_URL}/api/v2/` önekinin ARDINDAN gelen kısımdır; önek
 * yalnız `NetsisTransport` tarafından eklenir. "VERIFY" işaretli her değer
 * resmi kütüphane sayfasından değil, standart NetOpenX REST kurulumundan
 * varsayılmıştır — gerçek sunucuda `pnpm smoke:netsis` ile doğrulanacak
 * (docs/NETSIS.md → "To verify with the Netsis consultant").
 */

/** DI: `NetsisConfig` (config/netsis.ts) — testler düz nesne verir. */
export const NETSIS_CONFIG = "NETSIS_CONFIG";
/** DI: `NETSIS_MODE`'a göre seçilen `NetsisGateway` (live | stub). */
export const NETSIS_GATEWAY = "NETSIS_GATEWAY";

export const NETSIS_API_PREFIX = "api/v2";

export const NETSIS_PATHS = {
  // VERIFY: standart NetOpenX REST'te token ucu `api/v2/token`
  // (x-www-form-urlencoded, grant_type=password). Kütüphane sayfasında yok.
  token: "token",
  revoke: "revoke",
  ping: "ping",
  publicPing: "public/Ping",
  publicVersion: "public/Version",
  publicCompanyList: "public/CompanyList",
  publicAuthorizedBranches: "public/AuthorizedBranches",
  openTransaction: "OpenTransaction",
  commitTransaction: "CommitTransaction",
  rollbackTransaction: "RollBackTransaction",
  arps: "ARPs",
  items: "Items",
  itemSlips: "ItemSlips",
  itemSlipDetails: "ItemSlips/Details",
  itemSlipCalculate: "ItemSlips/Calculate",
  itemSlipHtml: "ItemSlips/Html",
  itemSlipDelete: "ItemSlips/Delete",
  itemSlipNewEInvoiceNumber: "ItemSlips/NewEItemSlipsNumber",
  itemSlipNewEArchiveNumber: "ItemSlips/NewEArchiveNumber",
  eDocumentSend: "EDocument/SendEDocument",
  eDocumentCheck: "EDocument/CheckEDocument",
  eDocumentShow: "EDocument/ShowEDocument",
  eDocumentCancelEArchive: "EDocument/EArchiveCancellationInvoice",
  eDocumentCurrentUpdate: "EDocument/EDocCurrentUpdate",
  mixedReceipts: "MixedReceiptsMain",
  bankRemittanceTransfer: "BankRemittanceTransfer",
  queries: "Queries",
} as const;

/**
 * VERIFY: `transId`'nin sonraki çağrılara nasıl taşındığı dokümante değil.
 * Commit/RollBack `?transId=` aldığı için aynı query parametresi varsayıldı.
 * Değişirse yalnız `NetsisTransport.attachTransaction` değişir.
 */
export const NETSIS_TRANSACTION_QUERY_PARAM = "transId";

/** Ortak oturum token'ı — tüm süreçler (web + worker) bunu paylaşır. */
export const NETSIS_TOKEN_CACHE_KEY = "netsis:token";
/** Token alma kilidi: aynı anda yalnız bir süreç login olur (lisans). */
export const NETSIS_TOKEN_LOCK_KEY = "netsis:token:lock";

/**
 * VERIFY: token yanıtında `expires_in` yoksa ya da bozuksa kullanılan ömür.
 * Kısa tutuldu: gerçek ömürden uzun önbelleklemek 401 → yeniden login
 * döngüsüne, kısası yalnız fazladan bir login'e mal olur.
 */
export const NETSIS_FALLBACK_TOKEN_TTL_SECONDS = 600;

/**
 * VERIFY: NetOpenX `TFaturaTip` adları. Satış iadesi Netsis'te genellikle
 * "alış faturası + iade tipi" olarak girilir; kesin kodu danışman verecek.
 */
export const NETSIS_DOC_TYPES = {
  salesInvoice: "ftSFat",
  salesReturnInvoice: "ftAFat",
} as const;
