/**
 * Cron kataloğu — `scheduled` kuyruğundaki TÜM repeatable işlerin tek kaynağı.
 *
 * `key` alanı Bull job adının TA KENDİSİDİR (@Process(...) ile birebir aynı);
 * sözleşme spec'i (cron-catalog.contract.spec.ts) bu eşitliği iki yönlü zorlar,
 * böylece test araçlarındaki liste ile gerçek işler arasında isim kayması
 * yaşanamaz (eski test-tools listesi 4 işte kaymıştı: check-expired-memberships
 * ↔ membership-expired-downgrades gibi).
 *
 * `triggerable`: admin Test Araçları ekranından elle tetiklenebilir mi?
 * false olanlar üç gruptur ve bilinçlidir:
 *  - toplu gönderim yapanlar (mükerrer e-posta riski),
 *  - zaten dakikada bir koşanlar (butonun kazancı yok),
 *  - başka ekranda düğmesi olan / yalnız zamanlanmış koşması gerekenler
 *    (para transferleri dahil).
 * Elle tetikleme kuyruğa fiş atarak yapılır — iş yine worker'da, runTrackedJob
 * sarmalamasıyla koşar; HTTP process'inde doğrudan servis çağrısı YOKTUR.
 */
export interface CronCatalogEntry {
  /** Bull job adı (`@Process(key)` ile birebir aynı). */
  key: string;
  label: string;
  description: string;
  /** Test Araçları ekranından elle tetiklenebilir mi? */
  triggerable: boolean;
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
      "DB↔Elasticsearch sayı farkını kontrol eder, gerekirse delta senkron",
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

  // ── Elle tetiklenmez (test aracından): gerçek para akışı ──────────────────
  // İKİNCİ üretici: admin manuel escrow release fast-path'i de 'payout-process'
  // fişi atar (admin-payout.service.queueImmediatePayout) — iş yine yalnız
  // worker'da, tek-sefer kilidiyle koşar. triggerable:false yalnız Test
  // Araçları düğmesini kapatır; release sonrası tetikleme bilinçli istisnadır.
  {
    key: "payout-process",
    label: "Payout işleme",
    description: "Bekleyen satıcı ödemelerini (havale) işler",
    triggerable: false,
  },
  {
    key: "payout-check-returned",
    label: "Dönen havale kontrolü",
    description: "Bankadan geri dönen havaleleri tespit eder",
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
