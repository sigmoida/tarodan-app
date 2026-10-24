/**
 * Cron catalog: the single source of every repeatable job on the `scheduled`
 * queue.
 *
 * `key` IS the Bull job name (identical to `@Process(...)`); the contract spec
 * (cron-catalog.contract.spec.ts) enforces the equality both ways, so the test
 * tools list cannot drift from the real jobs (the old hand-written list had
 * drifted on 4 jobs, e.g. check-expired-memberships vs
 * membership-expired-downgrades).
 *
 * `triggerable`: can it be run by hand from the admin Test Tools screen?
 * The false ones fall into three deliberate groups:
 *  - bulk senders (duplicate e-mail risk),
 *  - jobs that already run every minute (a button gains nothing),
 *  - jobs with a button on another screen or that must only run on schedule
 *    (money transfers included).
 * A manual run puts a job on the queue: it still runs in the worker, wrapped
 * by runTrackedJob; the HTTP process never calls the service directly.
 *
 * `monitor`: a Sentry cron monitor (missed, failed or overrunning runs open an
 * issue). Only an entry with one sends check-ins, and only from the
 * production environment (CronTrackerService). The Sentry plan includes one
 * cron monitor, so it is spent on the job whose silent stop costs the most:
 * `payout-process`. Adding another is a plan and alert decision, not a
 * code-only change.
 */
export interface CronMonitorConfig {
  /** Minutes after the expected start before a run counts as missed. */
  checkinMarginMinutes: number;
  /** Minutes a run may stay in progress before it counts as timed out. */
  maxRuntimeMinutes: number;
  /** Consecutive failed, missed or timed-out runs that open an issue. */
  failureIssueThreshold: number;
  /** Consecutive successful runs that resolve it. */
  recoveryThreshold: number;
}

export interface CronCatalogEntry {
  /** Bull job name (identical to `@Process(key)`). */
  key: string;
  label: string;
  description: string;
  /** Can it be run by hand from the Test Tools screen? */
  triggerable: boolean;
  /** Sentry cron monitor; absent = no check-ins (see above). */
  monitor?: CronMonitorConfig;
}

export const CRON_CATALOG: CronCatalogEntry[] = [
  // ── Yaşam döngüsü (zaman makinesinin test döngüsü) ─────────────────────────
  {
    key: "membership-expired-downgrades",
    label: "Süresi dolan üyelikleri düşür",
    description:
      "currentPeriodEnd geçmiş üyelikleri free katmana indirir; takas ilanlarını yeniden dizinler",
    triggerable: true,
  },
  {
    key: "membership-auto-renewals",
    label: "Üyelik oto-yenileme",
    description:
      "autoRenew açık ve vadesi gelen üyelikleri kayıtlı kartla yeniler",
    triggerable: true,
  },
  {
    key: "expire-boosts",
    label: "Öne çıkarma süre dolumu",
    description: "boostedUntil geçmiş ürünlerin boost'unu kapatır",
    triggerable: true,
  },
  {
    key: "payment-expired",
    label: "Süresi dolan ödemeleri iptal et",
    description:
      "Süresi geçen bekleyen ödemeleri iptal eder ve stok rezervasyonlarını serbest bırakır",
    triggerable: true,
  },
  {
    key: "payment-release-holds",
    label: "Vadesi gelen escrow hold serbest",
    description: "releaseAt geçmiş ödeme hold'larını satıcıya serbest bırakır",
    triggerable: true,
  },
  {
    key: "payment-expired-preparing",
    label: "Takılı 'hazırlanıyor' ödemeleri temizle",
    description: "preparing durumunda takılı, süresi dolmuş ödemeleri kapatır",
    triggerable: true,
  },
  {
    key: "expire-offers",
    label: "Süresi dolan teklifleri kapat",
    description: "expiresAt geçmiş teklifleri sonlandırır",
    triggerable: true,
  },
  {
    key: "trade-expired",
    label: "Süresi dolan takasları iptal et",
    description:
      "Aşamasına göre deadline'ı geçmiş takasları otomatik iptal eder",
    triggerable: true,
  },
  {
    key: "refund-crons",
    label: "İade cron'ları",
    description:
      "İade akışının tüm adımları: iade gönderisi açma, dönenleri finalize etme, bayat iadeleri iptal",
    triggerable: true,
  },
  {
    key: "order-auto-complete",
    label: "Siparişleri otomatik tamamla",
    description: "Teslim sonrası onay penceresi dolan siparişleri tamamlar",
    triggerable: true,
  },
  {
    key: "process-delivered-orders",
    label: "Teslim sonrası işlemler",
    description:
      "Teslim edilen siparişlere fatura keser, tamamlanacakları işler, takas komisyonlarını faturalar",
    triggerable: true,
  },

  // ── Dış senkronlar (ops: "şimdi çek/yenile/dene") ──────────────────────────
  {
    key: "paytr-statement-sync",
    label: "PayTR ekstre senkronu",
    description: "PayTR işlem ekstresini çekip mutabakat kayıtlarını günceller",
    triggerable: true,
  },
  {
    key: "paytr-settlement-sync",
    label: "PayTR hakediş senkronu",
    description: "PayTR hakediş (settlement) verisini senkronlar",
    triggerable: true,
  },
  {
    key: "sync-surat-tracking",
    label: "Sürat kargo takip senkronu",
    description: "Aktif gönderilerin kargo takip durumlarını günceller",
    triggerable: true,
  },
  {
    key: "sync-surat-post-delivery",
    label: "Sürat teslim sonrası takip (sıcak)",
    description:
      "Son 48 saatte teslim edilen kolileri sorgular — taşıyıcı tarafında başlatılan iade aynı etiket üzerinde teslimden SONRA yürür",
    triggerable: true,
  },
  {
    key: "sync-surat-post-delivery-tail",
    label: "Sürat teslim sonrası takip (kuyruk)",
    description:
      "2-14 gün önce teslim edilen kolileri günde bir sorgular; geç başlatılan iadeler için",
    triggerable: true,
  },
  {
    // The id carries the eLogo name but the job is provider-independent
    // (InvoiceSchedulerService). The Bull repeatable key and the run history are
    // bound to it; renaming it is an ops step (docs/INVOICING_PROVIDERS.md).
    key: "elogo-retry-pending",
    label: "e-Fatura gönderimlerini yeniden dene",
    description: "Bekleyen/başarısız e-Logo faturalarını yeniden dener",
    triggerable: true,
  },

  // ── Bakım ──────────────────────────────────────────────────────────────────
  {
    key: "log-retention-purge",
    label: "Log temizliği",
    description:
      "Saklama süresi dolan hata/güvenlik/e-posta loglarını siler (denetim izi ve aktif IP engelleri korunur)",
    triggerable: true,
  },
  {
    key: "media-temp-cleanup",
    label: "Geçici medya temizliği",
    description: "Süresi geçen geçici medya dosyalarını siler",
    triggerable: true,
  },
  {
    key: "product-import-stale-batches",
    label: "Yarıda kalan toplu yüklemeler",
    description:
      "Süreç çökmesi nedeniyle 'işleniyor' durumunda asılı kalan toplu ürün yükleme kayıtlarını kapatır",
    triggerable: true,
  },
  {
    key: "ledger-reconcile",
    label: "Defter mutabakatı",
    description:
      "Defter invaryantlarını doğrular (grup toplamı sıfır, fazla iade yok); ihlalde alarm üretir",
    triggerable: true,
  },
  {
    key: "pending-moderation-digest",
    label: "Bekleyen ilan özeti",
    description:
      "Moderasyonda 48 saatten uzun bekleyen ilanlar için adminlere günlük özet",
    triggerable: true,
  },
  // Mail Yönlendirme özetleri: yalnız personele gider ve satırlar sahiplenilip
  // gönderildi işaretlendiği için elle tetiklemek mükerrer e-posta üretmez —
  // yalnız özeti öne çeker.
  {
    key: "mail-digest-hourly",
    label: "Personel bildirimi saatlik özeti",
    description:
      "Saatlik teslim seçilmiş iç bildirimleri alan başına tek e-postada gönderir",
    triggerable: true,
  },
  {
    key: "mail-digest-daily",
    label: "Personel bildirimi günlük özeti",
    description:
      "Günlük teslim seçilmiş iç bildirimleri 09:00'da alan başına tek e-postada gönderir; 90 günden eski gönderilmiş kayıtları siler",
    triggerable: true,
  },

  // Triggerable so a staging run can calibrate the formula (ADR 0014). It only
  // rewrites its own table; a manual production run still needs the user's go.
  {
    key: "seller-trust-refresh",
    label: "Satıcı güven skorları",
    description: "Satıcı güven skorlarını gece toplu hesaplar",
    triggerable: true,
  },

  // ── Elle tetiklenmez: zaten dakikada bir koşuyor — butonun kazancı yok ─────
  {
    key: "outbox-drain",
    label: "Outbox boşaltma",
    description:
      "Outbox'taki bekleyen olayları e-posta/push kuyruklarına aktarır",
    triggerable: false,
  },
  {
    key: "process-scheduled-notifications",
    label: "Planlanmış bildirimler",
    description: "Zamanı gelen planlanmış bildirimleri gönderime alır",
    triggerable: false,
  },

  // ── Elle tetiklenmez: düğmesi başka ekranda (Sistem Ayarları → Yeniden Dizinle) ──
  {
    key: "search-periodic-sync",
    label: "ES periyodik senkron",
    description:
      "DB ile Elasticsearch arasındaki sayı farkını kontrol eder, gerekirse delta senkron",
    triggerable: false,
  },
  {
    key: "search-hourly-reconcile",
    label: "ES saatlik mutabakat",
    description: "ID bazlı yetim/eksik doküman eşitlemesi",
    triggerable: false,
  },

  // ── Elle tetiklenmez: gerçek TOPLU GÖNDERİM — mükerrer e-posta riski ───────
  {
    key: "marketing-weekly",
    label: "Haftalık pazarlama gönderimi",
    description: "Haftalık pazarlama e-postalarını gönderir",
    triggerable: false,
  },
  {
    key: "marketing-monthly",
    label: "Aylık pazarlama gönderimi",
    description: "Aylık pazarlama e-postalarını gönderir",
    triggerable: false,
  },
  {
    key: "membership-expiration-reminders",
    label: "Üyelik bitiş hatırlatmaları",
    description: "Üyeliği bitmek üzere olan kullanıcılara e-posta gönderir",
    triggerable: false,
  },
  {
    key: "membership-monthly-offers",
    label: "Aylık üyelik teklifleri",
    description: "Aylık üyelik kampanya e-postalarını gönderir",
    triggerable: false,
  },
  {
    key: "send-expiration-warnings",
    label: "İlan süre uyarıları",
    description: "İlan süresi dolmak üzere olan satıcılara uyarı gönderir",
    triggerable: false,
  },

  // ── Not triggerable (from the test tools): real money movement ───────────
  // A SECOND producer: the admin manual escrow release fast path also queues a
  // 'payout-process' job (admin-payout.service.queueImmediatePayout); it still
  // runs only in the worker, under the single-run lock. triggerable:false only
  // hides the Test Tools button; the post-release trigger is a deliberate
  // exception. Manual runs are not check-ins (runTrackedJob).
  {
    key: "payout-process",
    label: "Payout işleme",
    description: "Bekleyen satıcı ödemelerini (havale) işler",
    triggerable: false,
    // Tuned to the "*/15 * * * *" schedule registered in
    // payout/jobs/payout-scheduler.service.ts (the contract spec pins it, so
    // a schedule change revisits these): a slot not started 10 minutes late
    // is missed, one still running after 30 minutes (two slots) timed out.
    // A slot is one check-in across its Bull retries; two failed slots in a
    // row open the issue and the first good slot resolves it.
    monitor: {
      checkinMarginMinutes: 10,
      maxRuntimeMinutes: 30,
      failureIssueThreshold: 2,
      recoveryThreshold: 1,
    },
  },
  {
    key: "payout-check-returned",
    label: "Dönen havale kontrolü",
    description:
      "Bankadan geri dönen havaleleri tespit eder; ödemesi kapanan silinmiş hesapların IBAN'ını siler",
    triggerable: false,
  },

  // ── Elle tetiklenmez: elle koşturma ihtiyacı olmayan hesaplamalar ──────────
  {
    key: "featured-refresh",
    label: "Haftanın kazananları",
    description: "Haftanın koleksiyoneri/şirketi snapshot'ını yeniden hesaplar",
    triggerable: false,
  },
  {
    key: "update-popularity",
    label: "Popülerlik skorları",
    description: "Ürün popülerlik skorlarını yeniden hesaplar",
    triggerable: false,
  },
  {
    key: "expire-old-listings",
    label: "Eski ilan süre dolumu",
    description: "Süresi dolan eski ilanları yayından kaldırır",
    triggerable: false,
  },
];

const MONITORS = new Map(
  CRON_CATALOG.flatMap((entry) =>
    entry.monitor ? [[entry.key, entry.monitor] as const] : [],
  ),
);

/** The Sentry cron monitor of a catalog job, if it has one. */
export function cronMonitorFor(key: string): CronMonitorConfig | undefined {
  return MONITORS.get(key);
}
