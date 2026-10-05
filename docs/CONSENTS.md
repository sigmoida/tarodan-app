# Hukuki Onay Kayıtları — model ve API sözleşmesi

Kullanıcının verdiği her hukuki onayın ispatı: **kim, hangi belgeyi, hangi
sürümüyle, ne zaman ve nereden** (IP + kullanıcı ajanı) onayladı ya da geri
çekti. Tek tablo: `consent_records` (ekleme-yalnız; DB tetikleyicisi UPDATE ve
DELETE'i reddeder). Modül: `apps/api/src/modules/consent`. Admin: **Kullanıcılar
→ Onay Kayıtları** ve kullanıcı dosyasındaki **Onaylar** bölümü.

## Belgeler ve sürümler — tek kaynak

`packages/types/src/legal-consent.ts` → `CONSENT_DOCUMENTS`:

| Anahtar          | Sürüm (ilk)  | Hesap için zorunlu | Nerede alınır                                  |
| ---------------- | ------------ | ------------------ | ---------------------------------------------- |
| `terms`          | `2026-08-05` | evet               | kayıt formu / yeniden-onay penceresi           |
| `privacy`        | `2026-08-04` | evet               | kayıt formu / yeniden-onay penceresi           |
| `kvkk`           | `2026-08-04` | evet (ayrı kutu)   | kayıt formu / yeniden-onay penceresi           |
| `distance_sales` | `2026-08-03` | hayır (sipariş)    | sepet checkout'u + ödeme formu (`direct-form`) |
| `cookies`        | `2026-08-02` | hayır              | çerez bandı / çerez tercih paneli              |
| `marketing`      | `2026-10-05` | hayır              | kayıt, bildirim ayarları, bülten çıkışı, silme |

Sürüm = metnin değiştiği gün. **Metin değişince sürümü burada güncelleyin**:
zorunlu bir belgenin sürümü değişince her üye bir sonraki girişte yeniden
onaya çağrılır; çerez sürümü değişince bant yeniden çıkar. Sürüm ve zaman
**sunucuda** damgalanır — istemci yalnız "kabul ettim" der.

Eski `DISTANCE_SALES_CONTRACT_VERSION` sabiti bu kataloğa katıldı. Eski
`checkout_groups.distance_sales_accepted_at/_version` kolonları artık YAZILMAZ
(yalnız geçmiş okunur); içerikleri `backfill:prod:distance-sales-consents` ile
`consent_records`a aktarılır (bkz. `OPERATIONS.md`). Aynı onayın iki kopyası
tutulmaz.

## Kayıt — kim, nereden

- **Üye**: `userId`. **Misafir alıcı**: `guestEmail` (misafir siparişinin alıcısı
  paylaşılan sistem hesabıdır, kişiyi göstermez). **Giriş yapmamış ziyaretçi**
  (yalnız çerez): tarayıcıda üretilen kalıcı `visitorId` (UUID); oturum varsa
  `userId` de yazılır.
- **IP**: mobil/doğrudan çağrıda bağlantının IP'si (`trust proxy`). Web
  tarayıcısı API'ye gateway üzerinden gelir; gateway tarayıcı IP'sini
  `x-tarodan-client-ip` başlığıyla taşır ve API bu başlığa **yalnız özel ağdan
  gelen** istekte güvenir (dışarıdan uydurulamaz).
- **Kullanıcı ajanı**: `User-Agent` (gateway artık taşır), 512 karakterde kesilir.

## API

### `GET /consents/me/pending` (JWT)

Yeniden-onay kapısı. Üyenin onaylaması gereken zorunlu belgeler; **boş liste =
kapı açık**.

```jsonc
{
  "pending": [
    {
      "document": "kvkk",
      "version": "2026-08-04",
      "reason": "missing", // "missing" | "outdated"
      "path": "/privacy", // web'deki metin yolu (null olabilir)
    },
  ],
}
```

Bir belge şu durumlarda bekler: hiç kaydı yok (bu tablodan önce açılmış hesap,
Google/Apple ile açılan hesap, onay göndermeyen eski mobil kaydı) →
`missing`; en son kaydı eski sürüm → `outdated`; en son kaydı geri çekme →
`missing`.

### `POST /consents/me/accept` (JWT, 10/dk)

```json
{ "documents": ["terms", "privacy", "kvkk"] }
```

Yalnız hesap için zorunlu anahtarlar kabul edilir (aksi `400
server.consent.documentNotAcceptable`). Yalnız **bekleyen** belgeler yazılır
(çift gönderim zararsız). Yanıt: kalan bekleyenler, `GET` ile aynı şekil.

### `POST /consents/cookies` (herkese açık, 10/dk istemci IP başına)

```json
{
  "visitorId": "6f1c2a7e-7b0f-4e0b-9a3c-2f3d1e5a9b10",
  "preferences": { "functional": false, "analytics": true, "marketing": false }
}
```

Zorunlu kategori gönderilmez (hep açık). Bir isteğe bağlı kategori bile açıksa
kayıt `granted`, hepsi kapalıysa `withdrawn`. Yanıt `{ "success": true }`.

### `POST /auth/register` — yeni opsiyonel alan

```jsonc
{
  // … mevcut alanlar …
  "acceptsMarketingEmails": true,
  "acceptedConsents": ["terms", "privacy", "kvkk"],
}
```

Her belge ayrı kayıt olur (KVKK, kullanım şartlarından ayrı). **Kırıcı değil**:
alanı göndermeyen istemci kayıt olur; eksik belgeyi yeniden-onay kapısı ilk
girişte ister. Pazarlama izni verildiyse tarihli bir `marketing / granted`
kaydı da düşer.

### Mesafeli satış — checkout ve ödeme formu

- `POST /orders/checkout`, `POST /orders/checkout/guest`, `POST /orders/guest`:
  opsiyonel `distanceSalesAccepted: boolean`. `true` ise onay grupla aynı
  transaction'da sepete bağlı kaydedilir.
- `POST /payments/direct-form`: **yeni** opsiyonel `distanceSalesAccepted:
boolean`. PayTR çekiminden önceki ortak son adım; sepet/sipariş için henüz
  onay kaydı yoksa (teklif siparişi, checkout'ta onay göndermeyen istemci)
  burada kaydedilir. Kayıt zaten varsa ikinci satır yazılmaz.
- **Zorunluluk anahtarı**: platform ayarı `distance_sales_consent_required`,
  **varsayılan kapalı** (Ayarlar → Yasal; deploy gerekmez). Kapalıyken onaysız
  ödeme sürer (satır yazılmaz, uyarı loglanır). Açıkken onay kaydı olmayan ve
  `distanceSalesAccepted: true` göndermeyen satın alma
  `400 server.consent.distanceSalesRequired` alır.
- Kapsam: satın almalar (sepet, tekil/teklif siparişi, misafir). Takas ücreti,
  üyelik ve öne çıkarma ödemeleri kapıya girmez.

### Pazarlama izni

`PATCH /users/me/settings` içindeki `marketingEmails` gerçekten
değiştiğinde tarihli `granted` / `withdrawn` kaydı yazılır ve bülten listesi
hizalanır. Bülten çıkış bağlantısı ve hesap silme de `withdrawn` yazar.

## Admin

- `GET /admin/consents` — liste (arama: üye adı/e-posta/kod, misafir e-postası,
  ziyaretçi kimliği, IP, sepet/sipariş no; filtre: `document`, `action`,
  `source`, `subjectType` = `user|guest|visitor`, `userId`, tarih aralığı;
  DMMF tabanlı sıralama; `{ data, meta }` zarfı).
- `GET /admin/consents/export` — aynı filtrenin Excel dökümü (5000 satır
  tavanı, aşılırsa `X-Export-Truncated-At`), her indirme zorunlu denetim kaydı
  (`consent_records_export`).
- `GET /admin/consents/status/:userId` — belge başına en son kayıt + yeniden
  onay bekliyor mu.
- İzin: `users` (`PERMISSION_MAP.consents`), roller super_admin / admin /
  moderator.

## Açık konular (müşteriden beklenen)

1. **KVKK metni**: ayrı bir KVKK sayfası yok. `/privacy` sayfası zaten
   "KVKK Aydınlatma Metni" başlığını taşıyor; hem `privacy` hem `kvkk` kutusu
   oraya bağlanır. Müşteri ayrı bir metin (ör. açık rıza metni) verirse yeni
   bir sayfa yayımlanır ve `CONSENT_DOCUMENTS.kvkk.path` / `.version`
   güncellenir. Ayrı metin gelmeyecekse `privacy` ile `kvkk`'nın tek belge olup
   olmayacağına müşteri karar vermeli.
2. **Onay kutusu metinleri** (`auth.kvkkAgreeRich`,
   `legal.consentGate.acceptRich`) hukuki ifade olarak müşteri/avukat onayından
   geçmeli; mevcut kayıt kutusunun üslubu izlendi.
3. **İlk sürüm tarihleri** metinlerin son yayımlandığı commit tarihlerinden
   alındı; müşteri resmî yürürlük tarihlerini verirse güncellenir.
