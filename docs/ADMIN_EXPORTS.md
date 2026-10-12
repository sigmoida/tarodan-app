# Admin Excel dökümleri

Admin panelindeki her "Excel İndir" düğmesi tek bir hattan geçer
(`apps/api/src/common/export/`). Kural: **dosya = ekran** — aynı filtre, arama,
sıralama ve kolonlar. Yalnız XLSX; CSV yok (Türkçe Excel CSV'yi tek kolonda
açıyor, negatif tutarları metne çeviriyordu).

## HTTP sözleşmesi

- Uç: `GET …/export`, listenin **aynı** sorgu DTO'su (filtreler + `search` +
  `sortBy`/`sortOrder`). Sayfalama alanları yok sayılır.
- `200`, gövde xlsx (`StreamableFile`), başlıklar `sendExport`
  (`export-response.ts`) tarafından tek yerde yazılır:
  - `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `Content-Disposition: attachment; filename="<slug>-<YYYY-AA-GG>.xlsx"` —
    tarih İstanbul takviminde; slug ASCII. Ad ASCII değilse RFC 5987
    `filename*` eklenir.
  - `X-Export-Row-Count: <n>` — dosyadaki kayıt (liste satırı) sayısı.
  - `X-Export-Truncated-At: <n>` — **yalnız** tavan aşıldığında.
  - `Cache-Control: no-store`.
- Gateway (`packages/auth/src/proxy.ts`) `content-disposition`,
  `cache-control`, `x-export-row-count`, `x-export-truncated-at` başlıklarını
  tarayıcıya taşır.
- Tavan: 20.000 kayıt (`EXPORT_ROW_CAP`). İptaller 5.000 (birleşik sayfalama
  maliyeti karesel büyür). Tavan aşılırsa sessiz kırpma yok: başlık + Özet notu.
- Denetim: her indirme `createRequiredAuditLog` ile **fail-closed** kayıt
  bırakır; kayıt yazılamazsa dosya dönmez. Arama terimi (ve kişisel arama
  alanları, ör. iptallerde `party`) **asla** yazılmaz: yalnız
  `searchApplied` + `searchLength`.

## Kitap şekli

1. **Özet** — rapor adı, oluşturulma anı (İstanbul), uygulanan filtreler
   (etiket/değer; arama terimi değil "Uygulandı (N karakter)"), sıralama,
   kayıt sayısı, varsa toplamlar ve notlar (kırpılma, uzun biçim).
2. Veri sayfası (bazen birden çok) — başlıklar kolon kataloğundaki
   `labelKey`'den, isteğin dilinde.
3. Varsa sözleşmeli ek sayfalar (ör. silinen hesap bildiriminin **Bilgi**
   sayfası).

Hücreler: para = sayı + `#,##0.00 ₺`; tarih = gerçek tarih hücresi, İstanbul
duvar saati, `dd.mm.yyyy` / `dd.mm.yyyy hh:mm`; sayı = sayı; evet/hayır =
"Evet/Hayır"; durum = katalog etiketi. **Yalnız metin** formüle karşı nötrlenir
(`=`, `+`, `-`, `@`, sekme, satır başı → `'` öneki). Başlık satırı kalın,
dondurulmuş, otomatik filtreli; kolon genişliği tipten.

Maskeli kolonlar (`masked: true`: TCKN, vergi no, IBAN) uç `unmask: true`
demedikçe `••••1234` yazılır. `unmask` yalnız `@Roles`'u kimliği zaten
yetkiliye kapatan uçlarda verilir (GİB raporu, silinen hesap bildirimi).

## Uzun biçim (iç içe satırlar)

Bir kayıt birden çok kalem taşıyorsa (iptaller: sepet → kalemler) veri sayfası
**kalem başına bir satır** yazar; üst kaydın kolonları her satırda tekrarlanır
(`CANCELLATION_EXPORT_PARENT_KEYS`). Üst kaydın tutarı veri sayfasında
toplanmaz — Özet'teki "Toplamlar"dadır ve Özet bunu not olarak söyler.
`X-Export-Row-Count` üst kayıt sayısıdır; kalem sayısı Özet'te.

## Uçlar

| Uç                                      | Katalog                      | Denetim eylemi            |
| --------------------------------------- | ---------------------------- | ------------------------- |
| `GET /admin/payouts/export`             | `payoutHolds`                | `payout_holds_export`     |
| `GET /admin/payouts/transfers/export`   | `payoutTransfers`            | `payout_transfers_export` |
| `GET /admin/discounts/:id/codes/export` | `voucherCodes`               | `voucher_codes_export`    |
| `GET /admin/consents/export`            | `consents`                   | `consent_records_export`  |
| `GET /admin/gib-report/export`          | `gibReport`                  | `gib_report_export`       |
| `GET /admin/cancellations/export`       | `cancellations` (uzun biçim) | `cancellations_export`    |
| `GET /admin/deleted-identities/export`  | `deletedIdentities`          | `deleted_identity_export` |
| `GET /admin/analytics/:tab/export`      | — (istisna)                  | `analytics_export`        |

**Analitik tek istisnadır:** liste değil; ekranın çizdiği yanıt nesnesini alan
adlarıyla (makine-okunur başlık) yazar, kolon kataloğu yoktur. Yazıcı, Özet,
başlıklar ve denetim ortaktır.

Silinen hesap bildirimi dönemlidir (`year` + `month`, ay sınırları İstanbul),
başlıkları her zaman Türkçedir (resmî biçim) ve Bilgi sayfası biçim sürümünü
taşır.

## Yeni bir döküm eklemek (5 adım)

1. **Katalog:** `packages/types/src/export-catalog.ts` içinde
   `defineExportCatalog("kaynak", [...])` ile kolonları tanımla ve
   `EXPORT_CATALOGS`'a ekle. Anahtar = admin tablosunun `col.*` sıralama
   anahtarı; başlık için var olan i18n anahtarını kullan, yoksa tr + en ekle
   (aynı metni ikinci bir adla ekleme).
2. **Sorguyu paylaş:** listenin `where`/`orderBy`'ını üreten kodu tek bir
   fonksiyona çıkar; liste ve döküm onu çağırsın. Sayfa sınırı kaymasın diye
   döküm sırasına `{ id: "asc" }` ekle.
3. **Servis:** `ExportListService.exportList({ catalog, locale, slug,
titleKey, filters, sort, fetchPage, map, audit })`. `fetchPage` liste
   satırını döner, `map` satırı katalog anahtarlı kayda çevirir (durum
   etiketlerini `t` ile).
4. **Controller:** liste DTO'su + `@CurrentUser("id")` + `@ReqLocale()` +
   `@Res({ passthrough: true })`; `return sendExport(res, await …)`.
   `@Roles` listeninkiyle aynı (kimlik/para taşıyorsa daha dar).
5. **Spec:** servis spec'i (aynı süzgeç/sıra, denetim yükü, örnek hücreler).
   `export-catalog.contract.spec.ts` başlık anahtarlarını ve `sendExport`
   kullanımını kendiliğinden denetler.

## Bilinçli olarak kapsam dışı

- Finans dökümleri (`settlement-report/export`, stopaj raporu, fatura
  ayrıntısı) — Netsis yeniden adlandırmasından sonra ayrı pakette taşınacak;
  sözleşme spec'inde "bekleyen" listesinde durur ve liste yalnız küçülür.
- `GET /admin/products-export` silindi: tavansızdı ve hiçbir düğme çağırmıyordu.
- Toolbar'ın istemci tarafı "yüklü sayfayı CSV indir" düğmesi (`lib/csv.ts`,
  kolonların `exportValue`'su) kaldırıldı: yalnız ekrandaki sayfayı, sunucu
  sıralaması/filtresi olmadan ve denetimsiz aktarıyordu. Döküm isteyen her
  liste bu hatta bir `ExportButton` + `/export` ucu ekler; henüz ucu olmayan
  listelerde (siparişler, ürünler, ödemeler, kargo …) indirme yoktur.
