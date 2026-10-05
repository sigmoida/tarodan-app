# İlan Kaldırma Nedenleri — neden, kim, nerede, nasıl sayılır

Bir ilan vitrinden dört statüyle düşer: `inactive` (pasif), `deleted`
(kaldırıldı), `rejected` (reddedildi), `suspended` (askıda). Statü NE
olduğunu söyler; bu özellik NEDEN olduğunu kaydeder: satıcı vazgeçti mi,
ürünü başka bir platformda mı sattı (hangisinde), ilanın süresi mi doldu, stok
mu bitti, yoksa Tarodan bir ihlal yüzünden mi kaldırdı.

Tek kaynak: `packages/types/src/listing-removal.ts` (katalog + doğrulama kuralı

- etiket anahtarları + admin/dashboard sözleşmeleri). API, web ve admin aynı
  fonksiyonları çağırır.

## Nedenler

| Kod                  | Aktör   | Kim koyar / ne zaman                                                                           | Ek alan                                       |
| -------------------- | ------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `changed_mind`       | satıcı  | Silerken / pasife alırken "Vazgeçtim"                                                          | not (ops.)                                    |
| `sold_elsewhere`     | satıcı  | Silerken / pasife alırken "Başka bir platformda sattım"                                        | **platform zorunlu**; `other` ise not zorunlu |
| `paused_temporarily` | satıcı  | **Yalnız pasife alırken** "Geçici olarak durdurdum"                                            | not (ops.)                                    |
| `not_given`          | satıcı  | Sunucu yazar: neden göndermeyen eski istemci (yayındaki mobil sürümler). Formda seçenek değil. | —                                             |
| `expired`            | sistem  | İlan ömrü işi (`listingTtlDays`, eylem `deactivate`)                                           | —                                             |
| `out_of_stock`       | sistem  | Stok 0'a indi: düzenleme (satıcı/yönetici), takasla düşüm, kargoda kayıp, rezervasyon bırakma  | —                                             |
| `return_quarantine`  | sistem  | Teslim SONRASI iade stoğu geri yükledi, ilan karantinada                                       | —                                             |
| `seller_suspended`   | sistem  | Satıcı yasaklandı: aktif ilanlar `suspended`, onay bekleyenler `rejected`                      | işlemi yapan yönetici kayda geçer             |
| `policy_violation`   | Tarodan | Yönetici reddi (`rejected`) ya da yönetici kaldırması (`deleted`)                              | **ihlal kodu**; `other` ise açıklama zorunlu  |

Başka platformda satış — platformlar: `letgo`, `instagram`, `dolap`,
`sahibinden`, `in_person` (elden satış), `other` (serbest metinle).

İhlal kodları — **YER TUTUCU LİSTE, müşteri onayı bekliyor**:
`counterfeit_replica` (sahte/replika), `prohibited_item` (yasaklı ürün),
`misleading_content` (yanıltıcı açıklama/görsel), `inappropriate_content`
(uygunsuz içerik), `duplicate_listing` (mükerrer ilan), `wrong_category_or_price`
(yanlış kategori/fiyat), `other`. Kodlar DB'de metin olarak tutulur (enum
değil): listeyi değiştirmek bir göç gerektirmez — `LISTING_VIOLATION_CODES` +
iki dilde `status.listingRemoval.violation.<kod>` anahtarı. Listeden çıkan kod
eski kayıtlarda kalır ve ekranda ham kodla görünür. Yöneticinin satıcıya giden
serbest açıklaması (`Product.rejectionReason`) aynen sürer; ihlal kodu onun
YANINA eklenir.

Doğrulama kuralı (`listingRemovalIssue`): neden zorunlu ve aktör × eylem için
izinli olmalı; platform yalnız `sold_elsewhere`de ve zorunlu; ihlal kodu yalnız
`policy_violation`da ve zorunlu; serbest metin opsiyonel (yukarıdaki iki `other`
dışında), en fazla 500 karakter.

## Nerede kaydedilir

- **`ProductRemovalEvent`** (`product_removal_events`) — her kaldırma için
  EKLEME-YALNIZ bir satır: neden, platform, ihlal kodu, serbest metin, önceki ve
  sonraki statü, işlemi yapan kullanıcı (sistemde boş), an. UPDATE bir DB
  tetikleyicisiyle engellidir. İlan kaldırılıp yeniden açılıp tekrar
  kaldırılırsa İKİ satır vardır.
- **`Product.removalReason`** — ilanın GÜNCEL nedeni (son olayın kopyası);
  admin listesi ve filtre JOIN'siz okur. İlan kaldırma statülerinin dışına
  çıktığında (yeniden yayın, onaya gönderme, satış, rezervasyon) Prisma
  middleware'i temizler. Boş + kaldırma statüsü = **bilinmiyor** (bu
  özellikten önce düşmüş ilan; geri doldurma yapılmadı, yapılmayacak).
- **Tek yazıcı:** `recordListingRemovals` (`apps/api/src/modules/product/helpers/listing-removal.ts`).
  Statü yazımıyla aynı transaction'da çağrılır; kaldırma olmayan geçişlerde
  (vitrine dönüş, aynı statünün yeniden yazımı) hiçbir şey yazmaz.

### `inactiveReason` ile ilişki

`Product.inactiveReason` bir **davranış işaretidir**: satıcı bu pasif ilanla
ne yapabilir — `expired` ise tek eylemle yeniler, `return_quarantine` ise admin
onayı beklemeden doğrudan açar. Okuyanları (yenileme, karantinadan açma, eski
süre-dolumu bakımı) değişmedi; yazanları da değişmedi (statüyle aynı yazımda).

`removalReason` bir **açıklamadır** ve dört kaldırma statüsünün hepsini
kapsar. İki değer ortaktır ve aynı adı taşır (`expired`, `return_quarantine`;
bir kontrat spec'i her `inactiveReason` değerinin aynı adlı bir sistem nedeni
olduğunu sabitler). O iki işareti koyan yollar nedeni de aynı adla kaydeder.
Tek bilinçli istisna: yönetici bakım işlemi `markExpired` (bu özellikten önce
süresi dolmuş eski ilanlara `expired` davranış işareti koyar) kaldırma olayı
**yazmaz** — o kaldırma geçmişte oldu, nedeni tahmin edilmez.

### Yazıcılar (kaldırma statüsü yazan her yol)

| Yol                                                                            | Geçiş                                          | Neden                                      |
| ------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------ |
| `ProductUpdateService.remove` (satıcı silmesi)                                 | → `deleted`                                    | satıcının seçimi / `not_given`             |
| `ProductUpdateService.updateAsActor` (satıcı `status: inactive`)               | → `inactive`                                   | satıcının seçimi / `not_given`             |
| `ProductUpdateService.updateAsActor` (satıcı ya da yönetici stok 0)            | `active` → `inactive`                          | `out_of_stock`                             |
| `ProductSchedulerService.runExpireOldListings`                                 | `active` → `inactive`                          | `expired`                                  |
| `PaymentRefundService.processRefund` (stok geri yükleme)                       | → `inactive` (karantina)                       | `return_quarantine` (yoksa `out_of_stock`) |
| `PaymentExpiryReconciliationService` (satıcı göndermedi, stok geri yükleme)    | → `inactive`                                   | `return_quarantine` / `out_of_stock`       |
| `PaymentExpiryReconciliationService` (ödeme süresi doldu, rezervasyon bırakma) | → `inactive` (stok 0)                          | `out_of_stock`                             |
| `ReservationReconciliationService` (rezervasyon bırakma)                       | → `inactive` (stok 0)                          | `out_of_stock`                             |
| `ProductLockService.releaseReservation`                                        | → `inactive` (stok 0)                          | `out_of_stock`                             |
| `FulfillmentStockService.decrementForOrder` (oversell, rezervasyon bırakma)    | → `inactive` (stok 0)                          | `out_of_stock`                             |
| `TradeLifecycleService` (takas tamamlandı — iki yol)                           | → `inactive` (stok 0)                          | `out_of_stock`                             |
| `TradeReconciliationService` (oto-tamamlama, kargoda kayıp)                    | → `inactive` (stok 0)                          | `out_of_stock`                             |
| `finalizeReturningTradeIfResolved` (iade kolisi kayıp)                         | → `inactive` (stok 0)                          | `out_of_stock`                             |
| `AdminStaffService.banUser`                                                    | `active` → `suspended`, `pending` → `rejected` | `seller_suspended`                         |
| `AdminProductService.rejectProduct` (+ toplu red, moderasyon kuyruğu)          | → `rejected`                                   | `policy_violation` + ihlal kodu            |
| `AdminProductService.deleteProduct` (yumuşak)                                  | → `deleted`                                    | `policy_violation` + ihlal kodu            |

Satışla stoğu biten ilan `sold` olur — bu bir kaldırma değildir, kayıt yok.
Yönetici kalıcı silmesi ürün satırını sildiği için (yalnız siparişi/teklifi
olmamış ilan) olay satırları da CASCADE ile gider.

## Gizlilik

Satıcının serbest metni yalnız olay tablosundadır ve yalnız admin uçları okur
(`GET /admin/products/:id` → `removalHistory`). Vitrin ve satıcı yanıtları
(`formatProductResponse`) neden alanı taşımaz; bir kontrat spec'i
(`listing-removal-privacy.contract.spec.ts`) olay tablosunu okuyan kodun yalnız
admin/yazıcı olmasını şart koşar. Dışa aktarım (CSV) neden kodunu, kaldıranı,
platformu, ihlal kodunu ve tarihi içerir; serbest metni içermez.

## Admin

- Ürün listesi: "Kaldırma nedeni" kolonu (+ platform / ihlal ikinci satırda),
  "Kaldırma nedeni" (her neden + **bilinmiyor**) ve "Kaldıran" (satıcı /
  sistem / Tarodan) filtreleri (`removalReason`, `removalActor`; nötr ilk
  seçenekle).
- Ürün detayı: kaldırma geçmişi (serbest metin dahil).
- Red ve kaldırma pencereleri: ihlal türü seçimi (zorunlu) + açıklama.
- Dışa aktarım (`GET /admin/products-export`): aynı filtreler + neden kolonları.

## Dashboard — nasıl sayılır

`GET /admin/dashboard/listing-removals?period=daily|monthly|custom&from&to` —
**Zone C (Dönem özeti)** içinde, dönem kartlarının altında. Bir AKIŞ olduğu
için orada: seçili dönemde kaç ilan vitrinden düştü (bekleyen iş, uyarı ya da
bakiye değil). Zone C'nin kurallarını aynen izler:

- Aynı dönem seçicisi ve pencere çözümü (`resolveDashboardRange`, Türkiye takvimi).
- **Olay damgası:** `ProductRemovalEvent.createdAt` (kaldırma anı). İlanın
  bugünkü statüsü sayımı etkilemez; Eylül'de kaldırılıp Ekim'de yeniden açılan
  ilan Eylül'ün sayısında kalır. Kaldır → aç → kaldır iki olaydır.
- Sunucu tarafı `groupBy` (neden; `sold_elsewhere` için platform;
  `policy_violation` için ihlal kodu); test şeridi hariç (`LIVE_PRODUCT`).
- Önbellek: canlı pencere 5 dk, kapalı özel aralık 6 saat; "Yenile" düşürür.
- Dönem kartlarının dört rakamlı (dönem / dün / bu ay / tüm zamanlar) biçimini
  taşımaz — kırılım tek pencereyi okur.
- Bu özellikten önceki kaldırmaların kaydı olmadığı için sayılmaz.

## Mobil sözleşme değişikliği

İki uç da **yeni, opsiyonel** alanlar kabul eder; eski sürümler hiçbir şey
göndermeden çalışmaya devam eder (kaldırma `not_given` kaydedilir).

`DELETE /products/:id` — opsiyonel JSON gövde:

```json
{
  "removalReason": "sold_elsewhere",
  "removalPlatform": "dolap",
  "removalDetail": "Hafta sonu sattım"
}
```

`PATCH /products/:id` — pasife alırken aynı alanlar:

```json
{
  "status": "inactive",
  "removalReason": "paused_temporarily",
  "removalDetail": "Tatildeyim"
}
```

- `removalReason`: silmede `changed_mind | sold_elsewhere`; pasife almada ek
  olarak `paused_temporarily`.
- `removalPlatform`: `sold_elsewhere`de zorunlu —
  `letgo | instagram | dolap | sahibinden | in_person | other`.
- `removalDetail`: opsiyonel, ≤500 karakter; `removalPlatform = other` ise
  zorunlu (platformun adı). Yalnız Tarodan yöneticileri görür.
- Herhangi bir alan gönderilip kural ihlal edilirse `400`, `i18nKey`
  `validation.listingRemoval.<sorun>` (`reason_required`, `reason_not_allowed`,
  `platform_required`, `platform_invalid`, `platform_not_allowed`,
  `detail_required`, `detail_too_long` …). Etiketler:
  `status.listingRemoval.reason.*`, `status.listingRemoval.platform.*`.
- Yeni mobil sürümün de satıcıya nedeni **zorunlu** sorması beklenir (web ile aynı).
