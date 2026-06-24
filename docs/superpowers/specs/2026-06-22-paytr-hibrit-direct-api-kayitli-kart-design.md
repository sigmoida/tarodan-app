# PayTR Hibrit (Direct API + iFrame) Kayıtlı Kart & Oto-Yenileme — Tasarım Dokümanı

**Tarih:** 2026-06-22
**Durum:** Faz 2 (kayıtlı kart / Direct API). [2026-06-12 "tek iframe" tasarımının](2026-06-12-odeme-akisi-yeniden-tasarim-design.md) devamı.
**Sahip:** Ödeme entegrasyonu sorumlusu.
**İlke:** Para kodu — hata lüksü yok. Her şey **ekleme (additive)**, **bayrak arkasında**, **adım adım testli**.

---

## 1. Karar (neden hibrit)

12 Haziran tasarımı "sorumluluk bizde olmasın → tek iFrame, kayıtlı kart yok" dedi. Yeni iş
gereksinimi: **üyeliklerin kullanıcısız oto-yenilenmesi** + **kayıtlı kart ile hızlı ödeme**.

Kanıtlanmış kısıt: **PayTR iFrame kart saklayamaz** (iFrame `get-token` parametre listesinde
`store_card`/`utoken` yok; kart saklama yalnız **Direct API**). Dolayısıyla kayıtlı kart =
Direct API = kendi formumuz = **PCI SAQ-D**. Ortası yok.

**Karar: HİBRİT.**

| Kullanıcı / akış | Yol | PCI |
|---|---|---|
| Giriş yapmış (alım / takas-nakit / üyelik) | **Direct API** (kendi form + kayıtlı kart) | SAQ-D |
| Misafir (tek-sefer alım) | **iFrame** (mevcut yapı, değişmez) | SAQ-A |
| Direct API hata/3D sorunu | **iFrame'e fallback** | — |
| Üyelik oto-yenileme (kullanıcısız) | **Direct API recurring (non3d)** | token, PAN yok |

iFrame **silinmez, değiştirilmez**; rolü "herkes"ten "misafir + güvenlik ağı"na daralır.

---

## 2. Güvenlik ilkeleri (değişmez kurallar)

1. **Additive:** mevcut iframe / escrow / hold / payout / iade akışlarına dokunulmaz.
2. **Bayrak:** tüm Direct API/recurring davranışı `PAYTR_RECURRING_ENABLED` (+ ileride
   `PAYTR_DIRECT_ENABLED`) arkasında. Bayrak + PayTR yetkisi olmadan **gerçek çekim yok**.
3. **PAN/CVV asla saklanmaz/loglanmaz.** Kart no/CVV yalnızca istek anında bellekte PayTR'a
   iletilir. DB'de yalnız `utoken`/`ctoken` + maskeli `son4` + marka/expiry + mandate.
4. **3D ile mandate:** ilk çekim (CIT) **3D Secure** ile yapılır → chargeback koruması +
   kullanıcı onayı (mandate) kaydı. Yenilemeler (MIT) mandate altında non3d.
5. **require_cvv kartlar kullanıcısız çekilemez** (oto-yenilemeye uygun değil).
6. **Geri alınabilir:** bayrak kapanınca sistem 12 Haziran'daki saf-iframe davranışına döner.

---

## 3. Mimari — tek çatallanma noktası

Tüm ödemeler bugün **tek noktadan** geçiyor:
`PaymentService.initiatePayment*` → `processOrderPayment` → `createIframeToken`
([payment.service.ts:779](../../../apps/api/src/modules/payment/payment.service.ts#L779)).

Hibrit = bu tek noktaya bir **strateji çatalı** eklemek. Öncesi (buyer/sepet) ve sonrası
(merchant_oid geçmişi, callback, escrow) **ortak kalır**:

```
initiatePayment( { method, savedCardId?, card?, saveCard? } )
   │  ortak: buyer + basketItems + payment kaydı
   ├─ method=saved   → stored-card ödeme (utoken+ctoken, 3D/CVV)        [Flow B]
   ├─ method=new     → createDirectPayment(card, {storeCard, 3D})       [Flow A / CIT]
   └─ method=iframe  → processOrderPayment (mevcut)                     [Flow D / misafir/fallback]
   │  ortak: merchantOidHistory + payment.update
   ▼
handlePayTRCallback (TEK)  → utoken varsa SavedCard upsert → sipariş/escrow/iade AYNEN
```

### Akışlar
- **Flow A — CIT (yeni kart, kullanıcı var):** form → `createDirectPayment(storeCard, non3d=false)`
  → `threeDSHtml` → kullanıcı 3D onayı → callback (success + utoken) → `SavedCard`. Sipariş normal akar.
- **Flow B — Kayıtlı kartla ödeme (kullanıcı var, tek-sefer):** kullanıcı kartı seçer →
  stored-card ödeme (utoken+ctoken, 3D veya require_cvv ise CVV) → callback → sipariş akar.
- **Flow C — MIT (kullanıcısız yenileme):** cron → `chargeRecurring(recurring_payment=1, non3d=1)`
  → dönem uzar / dunning. **(YAZILDI)**
- **Flow D — Misafir/fallback:** `createIframeToken` (mevcut, değişmez).

---

## 4. Veri modeli

`SavedCard` (**yazıldı**, migration `20260620184314_add_saved_cards`): `userId, provider,
utoken, ctoken(@unique), last4, brand, expMonth, expYear, requireCvv, isDefault,
status(active|expired|revoked), mandateAcceptedAt/Ip/TermsVersion`. **PAN/CVV alanı yok.**
Kullanıcı-bazlı → tüm ödeme tipleri için ortak.

---

## 5. PayTR API'leri

| Amaç | Endpoint / akış | Durum |
|---|---|---|
| İlk kayıt (CIT) | `/odeme` Direct API + `store_card=1` (+3D) → callback `utoken` | metot var, endpoint kalan |
| Kart listesi | `/odeme/capi/list` (utoken) → ctoken/last4/require_cvv | yazıldı |
| Kayıtlı kartla ödeme | `/odeme` Direct API (utoken+ctoken, 3D/CVV) | kalan (chargeRecurring varyantı) |
| Oto-yenileme (MIT) | `/odeme` `recurring_payment=1 + non_3d=1` | yazıldı |
| Kart silme | `/odeme/capi/delete` | yazıldı |

---

## 6. Şu an HAZIR olan (commit `e5aa7e43`)

- `SavedCard` modeli + migration (PAN/CVV saklamaz).
- `PayTRService`: `chargeRecurring`, `capiListCards`, `capiDeleteCard`, `createDirectPayment(store_card)`.
- Callback'te `utoken` yakalama → `syncSavedCardsFromUtoken` (idempotent upsert).
- `MembershipService.runAutoRenewals`: kullanıcısız çekim + dönem uzatma + dunning.
- Scheduler: saatlik `processAutoRenewals` bağlı.
- Kart yönetimi: `GET/DELETE /membership/cards`.
- Testler: recurring-renewal 5/5, card-saving 5/5; ilgili para suite'leri 38/38.

## 7. KALAN işler

1. **CIT backend endpoint + DTO:** kartı alır → `createDirectPayment(storeCard, 3D)`;
   `threeDSHtml` döndürür. (Adım 1)
2. **Kayıtlı kartla tek-sefer ödeme (Flow B):** `chargeRecurring`'in non-recurring + 3D/CVV varyantı. (Adım 1)
3. **Hibrit yönlendirme:** `initiatePayment`'e `method/savedCardId/card/saveCard`; tek if/else + iframe fallback. (Adım 2)
4. **3D round-trip:** `threeDSHtml` render eden frontend + dönüş. (Adım 2-3)
5. **Kart formu + kayıtlı-kart seçici:** web + mobil, paylaşılan bileşen. (Adım 3)
6. **Kart yönetimi UI:** "kartlarım / ekle / sil / oto-yenile". (Adım 3)

---

## 8. PCI / hukuk (kod-dışı ön-koşullar)

- **SAQ-D:** kart formu bizde olduğu için kapsam D. Asgariye indirmek için: yalnız giriş yapmış
  akış Direct API; misafir iframe'de (PAN'a değmez). CDE = Direct ödeme endpoint'i + ağ yolu;
  segmentasyon + TLS + log'da PAN yasağı + düzenli ASV taraması + sızma testi.
- **PayTR aktivasyonu:** Direct API + (kullanıcısız için) Non3D/recurring yetkisi.
- **Mandate + KVKK:** açık oto-yenileme onayı metni; `mandateAcceptedAt/Ip/TermsVersion` kaydı.

---

## 9. Sıralı yol (her adım: testli + bayrak arkasında)

| Adım | İş | Bağımlılık |
|---|---|---|
| 0 ✅ | Yeşil backend commit + bu spec | — |
| 1 | CIT endpoint + DTO + Flow B (stored-card ödeme) + mock e2e | — (yetki beklemez) |
| 2 | Hibrit yönlendirme + 3D round-trip + iframe fallback + e2e | Adım 1 |
| 3 | Kart formu + yönetim UI (web + mobil) | PCI kararı |
| 4 | `test_mode=1` + PayTR test kartıyla uçtan uca | Adım 1-3 + PayTR test creds |
| 5 | PayTR aktivasyonları + flag aç → canlı | tümü + onay |

---

## 10. Doğrulama

- **Mock e2e:** CIT persist, list, delete (var); + Flow B stored-card ödeme, hibrit yönlendirme,
  3D round-trip, fallback (kalan).
- **Canlı (test_mode):** PayTR yetkisi gelince test kartıyla CIT→kayıt→MIT çekim; sonra flag prod'da açılır.
- `tsc` temiz + mevcut yeşil suite'lerde regresyon yok.

## 11. Geri alma (rollback)

Bayrak kapat → tüm akış iframe'e döner (12 Haziran davranışı). Hiçbir tablo/akış yıkılmadığından
geri dönüş anlıktır; `SavedCard` verisi dururken kör çekim yapılmaz.
