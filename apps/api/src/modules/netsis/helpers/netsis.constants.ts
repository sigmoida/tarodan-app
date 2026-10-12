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

/**
 * VERIFY: fiş başlığında (`FatUst`) BİZİM izleme anahtarımızın (faturanın
 * ETTN'i) yazıldığı ek açıklama alanı. Netsis ETTN'i kendisi atayabildiği
 * için fişi yeniden bulmanın tek güvenilir yolu budur.
 */
export const NETSIS_SLIP_TRACKING_KEY_FIELD = "EKACK1";

/**
 * VERIFY: izleme anahtarıyla fiş arayan salt okunur sorgu — `Queries` ucuna
 * gider, `assertNetsisReadOnlySelect` bekçisinden geçer. Kayıp yanıt (Netsis
 * transaction'ı commit etti, HTTP yanıtı bize ulaşmadı) sonrası yeniden
 * denemenin İKİNCİ bir fiş açmasını önler.
 *
 * Tablo/kolon adları tahmin: satış faturası başlığı `TBLFATUIRS`, belge
 * numarası `FATIRS_NO`, belge tipi `FTIRSIP` (`NETSIS_DOC_TYPE_BY_FTIRSIP`),
 * ek açıklama `EKACK1` (Netsis'te ek açıklamalar `TBLFATUEK`'te de
 * tutulabilir — danışmana sorulacak). `@trackingKey` değeri
 * `bindNetsisQueryParams` ile bağlanır, asla elle birleştirilmez.
 *
 * `scripts/netsis-smoke.mjs` aynı sorguyu `--ettn` ile koşar (Node TS
 * okuyamaz): oradaki kopyayı `netsis-smoke-script.contract.spec.ts` kilitler.
 */
export const NETSIS_SLIP_BY_TRACKING_KEY_SQL =
  "SELECT FATIRS_NO, FTIRSIP FROM TBLFATUIRS WHERE EKACK1 = @trackingKey ORDER BY FATIRS_NO";

/**
 * VERIFY: `TBLFATUIRS.FTIRSIP` (veritabanı belge tipi kodu) → NetOpenX
 * `FaturaTip`. "1" satış faturası, "2" alış faturası — satış iadesi alış
 * faturası + iade tipi olarak girilir (`NETSIS_DOC_TYPES`). Tanınmayan kod
 * okuyucuda hatadır, "bulunamadı" sayılmaz.
 */
export const NETSIS_DOC_TYPE_BY_FTIRSIP: Readonly<Record<string, string>> = {
  "1": NETSIS_DOC_TYPES.salesInvoice,
  "2": NETSIS_DOC_TYPES.salesReturnInvoice,
};
