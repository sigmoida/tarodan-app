# Admin Panel — Arama Denetimi & Konsolidasyon Raporu

> Hazırlayan: araştırma (Opus). Uygulama: Sonnet.
> Tarih: 2026-06-19
> Kapsam: `apps/admin` (Next.js 14 App Router, port 3002) + `apps/api` admin modülü.

## ✅ UYGULAMA DURUMU (2026-06-19 — tamamlandı)

- **Çatı kuruldu** (`apps/admin/src`): [`hooks/useAdminResource.ts`](../apps/admin/src/hooks/useAdminResource.ts) (react-query üstünde fetch+pagination+arama+filtre+URL senkron+hata/toast; **debounced smooth arama** — yazdıkça, Enter şart değil, default 300ms; toplu seçim + sekme destekli), [`components/ResourceListPage.tsx`](../apps/admin/src/components/ResourceListPage.tsx) (PageHeader+FilterToolbar+DataTable+Pagination+BulkActionBar+AdminTabs tek kabuk), [`components/Pagination.tsx`](../apps/admin/src/components/Pagination.tsx), [`components/QueryProvider.tsx`](../apps/admin/src/components/QueryProvider.tsx).
- **Takaslar araması eklendi**: backend `getTrades` `search` paramı (tradeNumber + başlatan/alıcı ad/email, `AND` birleşimi) + frontend çatı.
- **TÜM liste sayfaları çatıya taşındı** (18+): users, orders, payments, refunds, refund-requests, trade-shipments, collections, discounts, audit-logs, trades, products (toplu seçim), reviews/moderation/notifications/payouts/logs (sekmeli), messages, ai-moderation, shipping (alt-tab component'leri). Manuel pagination kalmadı.
- **Doğrulama**: `pnpm --filter @tarodan/admin typecheck` → 0 hata. API tarafında tek hata önceden var olan alakasız test (`refund-membership-guard.spec.ts`).
- **Sekmeli sayfa deseni**: tek `useAdminResource`, `queryKey`'e `activeTab` katılır, `fetcher`/`columns`/`filters` aktif sekmeye göre branşlanır. Liste-olmayan içerikler (notifications "Gönder" formu, payouts özet kartları) çatı dışında korunur.
- **Yapılmadı**: runtime/tarayıcı smoke testi (yalnızca typecheck). Önerilir: admin'i çalıştırıp özellikle Takaslar araması, toplu seçim (products), sekme geçişleri ve smooth arama elle test edilsin.

---

Bu rapor iki bölüm: **(1)** liste sayfalarında arama denetimi (Takaslar tetikleyici), **(2)** admin liste sayfalarını "tek çatı" altında toplama (mevcut durum + öneri).

---

## BÖLÜM 1 — Arama Denetimi

### Tetikleyici doğrulandı: Takaslar sayfasında arama YOK ✗

[trades/page.tsx](../apps/admin/src/app/(admin)/trades/page.tsx) yalnızca bir durum (`Select`) filtresi içeriyor; metin arama kutusu yok. Diğer liste sayfaları ortak [`FilterToolbar`](../apps/admin/src/components/admin-list.tsx#L34) component'ini kullanıyor, Takaslar kullanmıyor.

Ayrıca backend de desteklemiyor: [`admin.controller.getTrades`](../apps/api/src/modules/admin/admin.controller.ts#L1086) `search` query parametresi kabul etmiyor, [`admin.service.getTrades`](../apps/api/src/modules/admin/admin.service.ts#L4536) `search` işlemiyor. Yani Takaslar araması **hem backend hem frontend** iş istiyor.

> ⚠️ İncelik: `getTrades`'te `where.OR` zaten `userId` filtresi için kullanılıyor (initiatorId/receiverId). Search eklenince ikinci bir OR çakışır — `AND` ile birleştirilmeli (aşağıda Bölüm 1.4).

### 1.1 Ortak arama altyapısı (zaten var)

[`admin-list.tsx`](../apps/admin/src/components/admin-list.tsx) içinde hazır `FilterToolbar` var: arama input'u + `onSearchChange` + `onSearchSubmit` (Enter) + sağ tarafta filtre `children`. [users](../apps/admin/src/app/(admin)/users/page.tsx#L238) ve [orders](../apps/admin/src/app/(admin)/orders/page.tsx) bunu doğru kullanıyor. Yani arama eklemek = mevcut deseni uygulamak; yeni altyapı gerekmiyor.

### 1.2 Denetim tablosu (liste sayfaları)

FE = frontend arama kutusu var mı · BE = backend endpoint `search` destekliyor mu

| Sayfa | FE arama | BE arama | Durum / Aksiyon |
|---|:---:|:---:|---|
| **trades** (Takaslar) | ✗ | ✗ | **Tetikleyici. Backend + frontend gerek.** |
| payments (Ödemeler) | ✗ | ✓ | Sadece frontend — kolay kazanım (BE `fulltextPaymentSearch` hazır) |
| payouts (Satıcı Ödemeleri) | ✗ | ✗ | Backend + frontend (şu an sadece sellerId/status/tarih) |
| messages (Mesajlar) | ✗ | ✗ | Backend + frontend |
| notifications (Bildirimler) | ✗ | ✗ | Backend + frontend (geçmiş listesi) |
| moderation (Ürün denetim kuyruğu) | ✗ | ✗ | Opsiyonel — kuyruk; istenirse BE+FE |
| ai-moderation | ✗ | ✗ | Opsiyonel — kuyruk |
| attributes (Ürün Özellikleri) | ✗ (client filter) | ✓ | Sadece frontend bağlama |
| shipping (Kargo) | ✗ (tab + client) | ✓ | Sadece frontend bağlama (methods/carriers/zones BE hazır) |
| logs (Sistem Logları) | ✗ (tab) | ✓ | Sadece frontend bağlama (error/security/email BE hazır) |
| brands / manufacturers / car-models | ✗ (client filter) | ✗ | Küçük listeler; client-filter yeterli olabilir |
| categories | ✗ (ağaç görünüm) | ✗ | Ağaç yapısı — arama gerekmez |
| ads / roles / pages / email-templates | ✗ | — | Küçük/sabit listeler; client-filter yeterli |
| **Zaten arama var (FilterToolbar):** users, orders, products, reviews, refunds, refund-requests, collections, tags, support, trade-shipments, audit-logs, discounts | ✓ | çoğu ✓ | OK |

**Arama gerekmeyen (doğru şekilde aramasız):** dashboard, analytics, commission, tax, settings, membership-tiers (özet/konfig sayfaları).

### 1.3 Öncelik sırası (arama ekleme)

1. **Takaslar** — tetikleyici, backend + frontend. (Bölüm 1.4 reçetesi)
2. **payments** — backend hazır, sadece frontend; en hızlı kazanım.
3. **attributes, shipping, logs** — backend hazır, frontend `FilterToolbar`'a bağlama.
4. **payouts, messages, notifications** — backend + frontend.
5. moderation / ai-moderation — opsiyonel (kuyruk mantığı).

### 1.4 Takaslar araması — uygulama reçetesi (Sonnet)

**Backend** [admin.controller.ts:1086](../apps/api/src/modules/admin/admin.controller.ts#L1086):
- `@Query('search') search?: string` ekle, `adminService.getTrades({ ..., search })` geçir.

**Backend** [admin.service.ts:4536](../apps/api/src/modules/admin/admin.service.ts#L4536):
- `query` tipine `search?: string` ekle.
- `where`'i kur; `userId` OR'u ile çakışmayı önlemek için `AND` kullan. Orders deseni ([satır ~1614](../apps/api/src/modules/admin/admin.service.ts#L1609)) referans:
  ```ts
  const and: Prisma.TradeWhereInput[] = [];
  if (userId) and.push({ OR: [{ initiatorId: userId }, { receiverId: userId }] });
  if (search) and.push({ OR: [
    { tradeNumber: { contains: search, mode: 'insensitive' } },
    { initiator: { displayName: { contains: search, mode: 'insensitive' } } },
    { receiver:  { displayName: { contains: search, mode: 'insensitive' } } },
    { initiator: { email: { contains: search, mode: 'insensitive' } } },
    { receiver:  { email: { contains: search, mode: 'insensitive' } } },
  ]});
  if (and.length) where.AND = and;
  ```
  (`tradeNumber` filtre deseni [findTradeShipments:4630](../apps/api/src/modules/admin/admin.service.ts#L4630)'da zaten var.)

**Frontend** [trades/page.tsx](../apps/admin/src/app/(admin)/trades/page.tsx):
- `const [search, setSearch] = useState("")` ekle.
- Mevcut durum `Select`'ini `FilterToolbar` içine al (users sayfası birebir örnek):
  ```tsx
  <FilterToolbar search={search} onSearchChange={setSearch}
    onSearchSubmit={() => { setPage(1); loadTrades(); }}
    searchPlaceholder="Takas no, başlatan veya alıcı ara...">
    <Select ...>{statusOptions...}</Select>
  </FilterToolbar>
  ```
- `loadTrades` içinde `getTrades({ ..., search: search || undefined })`.
- `adminApi.getTrades` zaten `params` geçiriyor — api.ts değişikliği gerekmez.

> Not (genel anti-pattern): [users sayfası](../apps/admin/src/app/(admin)/users/page.tsx#L106) hem backend `search` gönderiyor hem `filteredUsers` ile client-side tekrar filtreliyor — gereksiz çift filtreleme. Takasta bunu yapma; tek kaynak = backend.

---

## BÖLÜM 2 — "Tek Çatı" Konsolidasyonu

### 2.1 Mevcut durum: kısmî konsolidasyon var, veri katmanı yok

**Zaten ortaklaşmış (UI primitives):**
- [`DataTable`](../apps/admin/src/components/DataTable.tsx) — `@tanstack/react-table` tabanlı tek tablo; loading/empty/seçim dahili.
- [`admin-list.tsx`](../apps/admin/src/components/admin-list.tsx) — `PageHeader`, `FilterToolbar`, `BulkActionBar`, `ActionButtons`, `ActionIconButton`.
- [`AdminTabs`](../apps/admin/src/components/AdminTabs.tsx), [`ConfirmProvider`](../apps/admin/src/components/ConfirmProvider.tsx), `AdminLayout`, `AdminFinancialSummary`, `RichTextEditor`.

**Eksik olan: veri/durum katmanı.** Her liste sayfası şunları elle yeniden yazıyor:
- `useState` ile `data, loading, search, filter, page, total` (sayfa başına **6–21 useState** — tax 21, products/reviews/moderation 15, brands 14).
- `loadX()` async fonksiyonu: `setLoading(true)` → `adminApi.getX()` → `response.data.data || response.data.x` (savunmacı erişim) → `setTotal(meta.total)` → `try/catch` + `toast.error("... yüklenemedi")` → `finally setLoading(false)`.
- `useEffect(() => loadX(), [page, filter])`.
- **18 sayfada birebir aynı pagination bloğu**: "Sayfa {page} / {Math.ceil(total/20)}" + Önceki/Sonraki butonları (`disabled` mantığıyla).
- `limit: 20` sabiti her sayfada tekrar.

**En büyük bulgu:** `@tanstack/react-query` `package.json`'da kurulu **ama admin'de hiç kullanılmıyor** (`useQuery`/`useMutation`/`QueryClient` = 0 eşleşme). Yani sayfalar elle cache/loading/error/refetch yönetiyor. Provider bile yok ([(admin)/layout.tsx](../apps/admin/src/app/(admin)/layout.tsx) sadece `ConfirmProvider`).

### 2.2 Sorunun maliyeti

- ~30 liste sayfası × (fetch + pagination + arama/filtre + hata) boilerplate'i kopyala-yapıştır.
- Tutarsızlık: kimi sayfa server-side arama, kimi client-side, kimi ikisi birden (users). Kimi sayfada arama yok (Takaslar). Pagination kimi yerde var kimi yerde yok.
- Bir davranışı değiştirmek (örn. debounce arama, URL'e sayfa yazma, limit'i değiştirme) 30 dosyada ayrı ayrı düzeltme demek.
- Yeni sayfa açmak = ~150 satır tekrar.

### 2.3 Önerilen "tek çatı" — 3 katman

**Katman A — Veri hook'u: `useAdminResource` (react-query üstünde)**
Kurulu ama atıl react-query'yi devreye al. Tek hook fetch + pagination + arama + filtre + URL senkron + loading/error/toast'ı standartlaştırsın:
```ts
const { rows, total, page, setPage, search, setSearch, filters, setFilter,
        isLoading, refetch } = useAdminResource({
  queryKey: 'trades',
  fetcher: (params) => adminApi.getTrades(params),   // {page,limit,search,...filters}
  limit: 20,
  syncUrl: true,                                       // ?page=&q=&status=
});
```
- `response.data.data || response.data.x` savunmacı erişimini tek yerde çöz.
- Hata → tek yerde `toast.error`. `keepPreviousData` ile sayfa geçişinde titreme yok.
- İlk adım: önce `QueryClientProvider`'ı `(admin)/layout.tsx`'e ekle.

**Katman B — UI kabuğu: `<ResourceListPage>` + `<Pagination>`**
- 18 sayfada tekrarlanan pagination bloğunu tek `<Pagination page total limit onChange />` component'ine çıkar.
- `<ResourceListPage>` = `PageHeader` + `FilterToolbar` + `DataTable` + `Pagination`'ı birleştiren ince kabuk. Sayfa sadece kolon/filtre/aksiyon verir.

**Katman C — Bildirimsel (declarative) sayfa konfigürasyonu**
Her liste sayfası bir config'e iner:
```tsx
export default function TradesPage() {
  return <ResourceListPage
    title="Takaslar"
    resource={{ queryKey: 'trades', fetcher: adminApi.getTrades, limit: 20, syncUrl: true }}
    search={{ placeholder: "Takas no, başlatan veya alıcı ara..." }}
    filters={[{ key: 'status', options: statusOptions }]}
    columns={tradeColumns}
    rowActions={(t) => [{ icon: EyeIcon, href: `/trades/${t.id}` }]}
  />;
}
```

### 2.4 Migrasyon stratejisi (Sonnet için, artımlı — büyük patlama yok)

1. **Altyapı:** `QueryClientProvider` ekle + `useAdminResource` hook + `<Pagination>` component (3 küçük PR).
2. **Pilot:** Takaslar'ı yeni çatıyla yaz (aynı anda Bölüm 1 araması da çözülür). Tek sayfada deseni kanıtla.
3. **Düşük riskli dalga:** users, orders, payments, reviews gibi "FilterToolbar zaten var" sayfaları teker teker geçir (davranış birebir korunur).
4. **Kalanlar:** client-side filtreli sayfaları server-side aramaya çevir, arama eksikleri (payouts/messages/notifications) backend + config ile ekle.
5. **Kural:** her sayfa migrasyonunda davranışı bire bir koru; sadece tekrar eden kodu kaldır. Detay (`[id]`) sayfaları bu kapsamda değil (farklı desen).

### 2.5 Net kararlar (uygulamaya geçmeden netleştirilmeli)

- **react-query benimseyelim mi**, yoksa react-query'siz sade bir `useAdminResource` mu? (Kurulu olduğu için react-query önerilir; ama mevcut kod hiç kullanmıyor — takım tercihi.)
- **URL senkronu** (paylaşılabilir filtreli linkler) standart olsun mu? (Takaslar zaten `?userId=` kullanıyor — evet öneririm.)
- **Arama debounce** + otomatik fetch mi, yoksa mevcut "Enter'a bas" davranışı mı korunsun?
- Konsolidasyon kapsamı: tüm ~30 sayfa mı, yoksa önce pilot + yüksek değerli birkaç sayfa mı?

---

## Özet

- **Takaslar araması yok — doğrulandı.** Backend (`getTrades` search yok) + frontend (`FilterToolbar` yok) iş gerektiriyor. Reçete Bölüm 1.4'te.
- En hızlı kazanım: **payments** (backend hazır, sadece frontend).
- **Asıl konsolidasyon fırsatı:** kurulu ama kullanılmayan **react-query** + 18 sayfada tekrarlanan pagination + sayfa başına 6–21 useState. Çözüm: `useAdminResource` hook + `<ResourceListPage>`/`<Pagination>` + bildirimsel sayfa konfigürasyonu. UI primitive'leri (DataTable, admin-list) zaten hazır; eksik olan veri katmanı.
</content>
</invoke>
