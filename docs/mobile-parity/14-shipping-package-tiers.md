# 14 — Kargo Paket Boyutları (Kademeler)

> **Bu dosya diğerlerinden farklı**: geriye dönük bir parite raporu değil, **API'de
> yeni tamamlanmış bir değişikliğin** mobil tarafa yansıması gereken kısmıdır.
> `03-listings-seller.md` ve `04-cart-checkout-payment.md` dosyalarındaki kargo/desi
> anlatımı **artık geçersizdir**; bu dosya onları geçersiz kılar.

## 1. Ne değişti (özet)

Satıcı artık **desi girmiyor**. Üç paket boyutundan birini seçiyor; kargo bedeli
adminin tarifede tanımladığı kademeden çözülüyor.

| Eski                                          | Yeni                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| Satıcı `shippingDesi` (1–1000) sayısı yazardı | Satıcı **paket boyutu** seçer (`small` / `medium` / `large`)                   |
| Fiyat `(desi, tutar)` satır tablosundan       | Fiyat **kademe aralığından** (`0–2` / `2–5` / `5+` desi)                       |
| Kargo payı kural başına tek değer             | Kargo payı **paket boyutuna göre** (Küçük 100/0, Orta 70/30, Büyük 50/50 gibi) |
| Desi satırı eksikse checkout 503              | Son kademe **üst sınırsız** → fiyatsız desi kalmaz                             |

Desi tamamen kaybolmadı: iç muhasebe birimi olarak duruyor (paket desisi =
Σ `desi × adet`) ve **yalnız admin görür**. Mobil arayüzde desi **hiç
görünmemelidir** — bu ürün kararıdır, teknik bir kısıt değil.

## 2. Mobil tarafta yapılacaklar

### P0 — İlan oluştur/düzenle ekranı

Mevcut desi girdisi (sayı input'u) **üç radyo/seçim kartıyla** değiştirilecek.

**Uç:**

| Method | Path                      | Auth   | Amaç                                 |
| ------ | ------------------------- | ------ | ------------------------------------ |
| `GET`  | `/shipping/package-tiers` | public | Aktif tarifenin boyutlarını listeler |

**Yanıt:**

```jsonc
{
  "tariffVersion": 3,
  "tiers": [
    {
      "code": "small", // ürün payload'ında bu gönderilir
      "label": "Küçük Paket", // satıcıya gösterilecek ad (admin belirler)
      "amount": 100, // TAM kargo bedeli (TL)
      "billableDesi": 2, // iç birim — GÖSTERME
      "minDesi": 0, // admin bilgisi — GÖSTERME
      "maxDesi": 2, // null = üst sınırsız — GÖSTERME
      "sampleWidth": 25, // örnek ölçü (cm), null olabilir
      "sampleHeight": 20,
      "sampleLength": 12,
    },
    // medium, large
  ],
}
```

**Kart içeriği:** `label` + `amount` (₺) + örnek ölçü `"25 × 20 × 12 cm"`.
Üç ölçüden biri `null` ise ölçü satırını hiç göstermeyin.

**Ürün oluşturma/güncelleme payload'ı:** `shippingDesi` alanı **kaldırıldı**,
yerine `shippingPackageTier: "small" | "medium" | "large"` geldi.

Boş/eksik tarife durumu: uç **503** dönerse (aktif tarife yok ya da kademeleri
eksik) fiyat gösterilemez — formu "kargo bilgisi yüklenemedi" ile uyarıp
göndermeyi engelleyin (web de aynısını yapıyor, fail-closed).

### P0 — Net kazanç önizlemesi

| Method | Path                         | Auth | Değişiklik                                                      |
| ------ | ---------------------------- | ---- | --------------------------------------------------------------- |
| `GET`  | `/orders/commission-preview` | JWT  | `shippingDesi` query parametresi **kaldırıldı** → `packageTier` |

```
GET /orders/commission-preview?amount=1000&categoryId=<uuid>&packageTier=medium
```

Yanıt şekli aynı: `sellerFeeAmount`, `withholdingTaxAmount`, `shippingAmount`
(satıcının kargo payı), `sellerNetAmount`. Boyut değiştikçe **canlı** yenilenmeli;
`packageTier` geçmezseniz `small` varsayılır ve yanlış net gösterirsiniz.

Satıcıya gösterim kuralı (web ile aynı): kart üzerinde **tam** kargo bedeli
(100/130/160), altındaki özet kutusunda satıcının **kendi payı** ve **elinize
geçen** tutar.

### P1 — Sipariş/sepet görünümleri

Checkout quote yanıtındaki `shippingBySeller[]` dizisine iki alan eklendi:

```jsonc
{
  "sellerId": "…",
  "shippingCost": 91, // alıcının ödediği PAY (değişmedi)
  "billableDesi": 4,
  "packageTier": "medium", // YENİ — paketin çözülmüş boyutu
}
```

`packageTier` ile "Orta Paket" etiketi gösterilebilir. **Alıcıya paket boyutu
gösterilmemesi** kararlaştırıldı; alan bilgi amaçlı döner, kullanmak zorunlu değil.

### P1 — Hizmet bedeli oranı

`pricing.buyerFeeRate` (yüzde, ör. `3` veya `4.5`) eklendi. Checkout özetinde
"Platform Hizmet Bedeli (%3)" gibi **sabit oran yazmayın** — bu alandan okuyun.
`buyerFeeRate` 0 ise oransız etiketi kullanın.

## 3. Değişen hata kodları

| Eski                                | Yeni                                    | Anlamı                                              |
| ----------------------------------- | --------------------------------------- | --------------------------------------------------- |
| `SHIPPING_DESI_RATE_NOT_CONFIGURED` | `SHIPPING_PACKAGE_TIERS_NOT_CONFIGURED` | Aktif tarifede kademe yok → 503, fail-closed        |
| `SHIPPING_DESI_RATES_REQUIRED`      | `SHIPPING_PACKAGE_TIERS_REQUIRED`       | Admin: aktifleştirme için üç boyut zorunlu          |
| `SHIPPING_ONE_DESI_RATE_REQUIRED`   | — (kaldırıldı)                          | Artık anlamı yok                                    |
| `INVALID_SHIPPING_DESI_RATE`        | `INVALID_SHIPPING_PACKAGE_TIER`         | Admin: geçersiz kademe                              |
| —                                   | `SHIPPING_PACKAGE_TIER_RANGES_INVALID`  | Admin: aralıklar boşluklu/çakışan/son boyut sınırlı |

Mobil yalnız ilkiyle karşılaşır; gerisi admin uçlarına özgüdür.

## 4. Fiyatlandırma mantığı (mobilin bilmesi gerekenler)

Mobil bu hesabı **yeniden yapmamalı** — sunucu tek kaynaktır. Ama gösterilen
rakamlar tuhaf görünürse sebebi anlamak için:

- Kargo **satıcı paketi başına bir kez** alınır. Sepette 2 satıcı varsa 2 kargo.
- Paketin desisi satırların toplamıdır: **2 küçük ürün = 4 desi → Orta kademe.**
  Yani iki küçük ürün alan alıcı 100 TL değil 130 TL kargo görür; bu kasıtlıdır
  (eksik tahsil etmemek için).
- Paket birden fazla kategori içeriyorsa, o kademede tanımlı payların **en
  düşüğü** uygulanır → alıcı, gördüğü sübvansiyondan fazlasını ödemez.
- Ücretsiz kargo eşiği kademenin **üstündedir**: eşik aşılırsa kargo 0 olur ve
  ne alıcıdan ne satıcıdan alınır.
- **Sıra önemlidir:** kademe önce çözülür, pay o kademeden okunur. Quote ile
  sipariş oluşturma aynı yardımcıyı çağırdığı için önizleme = tahsilat.

## 5. Bu değişiklikten etkilenmeyenler

- Ödeme akışı, PayTR sözleşmesi, 3DS — dokunulmadı.
- İade **talep** akışı ve ekranları — dokunulmadı (arka planda kargo bacağının
  muhasebesi değişti ama uçlar ve yanıt alanları aynı).
- Takas kargosu da AYNI kademelerden çözülür (taraf başına kademe tutarı × 2
  bacak, `trade-pricing.helper.ts`); ayrı bir takas ücreti alanı yoktur.
- Sipariş listesi/detay uçları, kargo takibi, Sürat entegrasyonu.

## 6. Kabul kriterleri

- [ ] İlan formunda desi input'u yok; üç kart var ve `GET /shipping/package-tiers`'tan besleniyor.
- [ ] Kart üzerinde ad + tam kargo bedeli + (varsa) örnek ölçü görünüyor.
- [ ] Ürün payload'ı `shippingPackageTier` gönderiyor, `shippingDesi` göndermiyor.
- [ ] Net kazanç önizlemesi `packageTier` ile çağrılıyor ve seçim değişince yenileniyor.
- [ ] Tarife ucu 503 dönerse form gönderilemiyor ve kullanıcıya açık mesaj veriliyor.
- [ ] Checkout'ta hizmet bedeli oranı `pricing.buyerFeeRate`'ten okunuyor; sabit oran yok.
- [ ] Arayüzde hiçbir yerde "desi" kelimesi ya da desi sayısı görünmüyor.
- [ ] Düzenlemede ürünün mevcut boyutu seçili geliyor.
