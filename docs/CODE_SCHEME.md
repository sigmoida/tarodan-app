# Kod ve Referans Şeması

Platformdaki insan-okunur kimlikler tek bir düzene bağlıdır. Yeni bir kod türü
eklerken önce bu belgeyi, sonra
`apps/api/src/common/helpers/code-prefixes.ts` (tek kaynak) dosyasını okuyun.

**Ayırt edici kural:** tek harfli **varlık kodları** bitişik ve sıralıdır
(`U010001`); üç harfli **işlem referansları** tireli ve rastgeledir
(`ORD-K7X9M2QF3N`). Bir koda bakan kişi hangi aileden olduğunu tek bakışta
anlar.

## 1. Varlık kodları — kalıcı kimlik

Postgres `DEFAULT` + sequence ile üretilir; uygulama kodu yazmaz. Gizli
değildir, kısa ve telefonda okunabilir olması amaçlanır.

| Kod | Varlık             | Örnek     | Üretim                          |
| --- | ------------------ | --------- | ------------------------------- |
| `B` | Bireysel kullanıcı | `B010001` | `generate_user_admin_code('B')` |
| `K` | Kurumsal kullanıcı | `K010042` | `generate_user_admin_code('K')` |
| `U` | Ürün / ilan        | `U010001` | `generate_product_code()`       |

Kurallar:

- **Numara kalıcı kimliktir, önek hesabın güncel tipini gösterir.** Bireysel
  bir hesap kurumsala geçerse `B010023 → K010023` olur (numara korunur) —
  `promoteUserCodeToCorporate`, kurumsal başvuru nihai onayında çağrılır.
- **Satıcılık önek değildir.** Bireysel satıcı da `B` taşır; satıcılık ayrı bir
  bayraktır (`isSeller`). Eski `S` öneki kaldırılmıştır.
- **Sayaçlar 10000'den başlar** ki kod, sistemdeki kayıt sayısını dışarıya
  duyurmasın.
- Kullanıcı sayacı `B`/`K` arasında ORTAKTIR: numaralar globalde tekildir,
  dolayısıyla önek değişimi çakışma üretmez.

## 2. İşlem referansları — tahmin edilemez

Tümü `generateUniqueReference` ile üretilir: `randomInt` (CSPRNG), 30 harflik
karışmaz alfabe (`0/O`, `1/I/L` ve `U` yok), 10 karakter, çakışmada 6 deneme,
son güvence ilgili kolondaki `@unique`.

| Önek  | İşlem                                                   |
| ----- | ------------------------------------------------------- |
| `ORD` | Sipariş satırı (bir üründen bir adet-grubu)             |
| `GRP` | Sepet / ödeme grubu                                     |
| `PKG` | Koli (satıcı paketi) — Sürat'a giden `OzelKargoTakipNo` |
| `TKS` | Takas                                                   |
| `RFD` | İade talebi                                             |
| `TKT` | Destek talebi                                           |
| `GST` | Misafir iletişim kaydı                                  |
| `BST` | Öne çıkarma / vitrin siparişi                           |
| `MEM` | Üyelik siparişi                                         |
| `PYT` | Satıcıya para gönderimi                                 |
| `SHP` | Kargo entegrasyonu kapalıyken yedek takip no            |
| `VCH` | Hediye / kupon kodu (yönetici öneki geçersiz kılabilir) |

### 2.1 Sipariş üç seviyede numaralanır

Bir alışverişte **her zaman üç ayrı seviye** vardır ve hiçbiri diğerinin
türevi değildir:

```
GRP-…  sepet          → 1 tane   (alıcı bir kez öder)
PKG-…  koli           → satıcı sayısı kadar (her satıcı ayrı kargolar)
ORD-…  sipariş satırı → ürün satırı sayısı kadar
```

| Sepet içeriği     | GRP | PKG | ORD |
| ----------------- | --- | --- | --- |
| 1 ürün / 1 satıcı | 1   | 1   | 1   |
| 2 ürün / 1 satıcı | 1   | 1   | 2   |
| 3 ürün / 2 satıcı | 1   | 2   | 3   |

**Kargo referansı `PKG-…`'dir.** Sürat'a `OzelKargoTakipNo` olarak bu gönderilir,
Sürat karşılığında kendi `KargoTakipNo`'sunu döner (`providerTrackingId`), müşteri
de kargosunu bu koli koduyla sorgulayabilir (`/track-order` üç kodu da kabul eder).

Bu numara **saklanır** (`OrderPackage.packageNumber`), türetilmez. Eskiden koli
referansı "paketteki en küçük `orderNumber`" olarak hesaplanıyordu; paketin
sipariş kümesi değişince (iptal, `packageId` taşıması) referans kayıyor, 48
saatlik barkod retry penceresinde Sürat'ın idempotency önbelleğini (anahtar =
`OzelKargoTakipNo`) ıskalıyor ve **mükerrer fiziksel gönderi** açabiliyordu.

Aynı koliyi paylaşan gönderi satırları `Shipment.packageId` ile bağlıdır: Sürat
koli başına **bir kez** sorgulanır ve taşıyıcı webhook'u kolinin **tüm** sipariş
satırlarına yayılır. Kayıt yine sipariş başınadır — iade, escrow ve muhasebe
sipariş bazlı kalır.

Notlar:

- **Takas öneki `TRD` DEĞİLDİR**: o önek e-Arşiv fatura numarasına aittir ve
  GİB'e kayıtlıdır. `code-prefixes.spec.ts` bu öneki geri almayı engeller.
- Tek satıcılı ödemede grup numarası sipariş numarasından **türetilir**
  (`reprefixReference`): `ORD-K7X9M2QF3N → GRP-K7X9M2QF3N`. Tekillik sipariş
  numarasının tekilliğinden gelir.
- Takas kargo etiketleri takas numarasına **sonek ekler**, yeni önek eklemez:
  `TKS-P9K2X7M4QN-WH-INI`, `…-RET-STK`. Bu değerler Sürat idempotency anahtarı
  olarak da kullanıldığı için üretim ve retry türetimi BİRLİKTE değişmelidir.
- `Math.random()` bu ailede kullanılamaz (tahmin edilebilir). Tek meşru
  kullanımı yeniden deneme gecikmesine jitter eklemektir
  (`surat-technical-retry.ts`).

## 3. Belge numaraları — sıralı, atomik

| Belge              | Format              | Sayaç                                           |
| ------------------ | ------------------- | ----------------------------------------------- |
| İç fatura (PDF)    | `SPR-202607-000001` | `document_sequences` (`upsert + increment`)     |
| e-Arşiv / e-Fatura | `TRD2026000000001`  | `elogo_doc_sequences` (GİB zorunlu 16 karakter) |

İkisi de **atomik** artırılır. "En büyüğü oku +1 yaz" yaklaşımı eşzamanlı iki
belgede aynı numarayı üretir; bu yüzden kullanılmaz.

## 4. Dış sistemlerin dayattığı formatlar

PayTR `merchant_oid`, kargo firmasının verdiği takip kodu ve e-Arşiv numarası
bizim şemamızın dışındadır — değiştirilemez, bu ailelere dahil edilmez.

## 5. Gizli kodlar

Doğrulama tokenları (`randomBytes(32)`, DB'ye SHA-256 özeti), OTP'ler
(`randomInt`, 6 hane, kısa TTL + deneme sayacı), 2FA sırrı (Base32, AES-256-GCM
ile şifreli) ve erken erişim PIN'leri (`randomInt`, 8 karakter) ayrı bir
ailedir; asla `Math.random` kullanmaz. Erken erişim akışı için
[OPERATIONS.md](./OPERATIONS.md).
