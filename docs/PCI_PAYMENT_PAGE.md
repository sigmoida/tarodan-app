# Ödeme Sayfası Güvenliği — Script Envanteri ve CSP (PCI DSS 4.0)

> Kalıcı referans (2026-08-03, kod üzerinden doğrulandı). Bu doküman **PCI DSS
> 4.0 · 6.4.3** (ödeme sayfası script'lerinin yetkilendirilmesi, envanteri ve
> gerekçelendirilmesi) ile **11.6.1** (yetkisiz değişiklik/tamper tespiti)
> gereksinimlerinin karşılığıdır. Doküman ile kod çelişirse kod doğrudur.
>
> Kapsam: `apps/web` → `/payment/[id]` rotası. Para akışının kendisi için
> `docs/PAYMENTS.md`.

---

## 1. Neden bu sayfa kapsamda?

PayTR **Direkt API** kullanıyoruz (iframe değil): kart numarası, son kullanma ve
CVV **bizim sayfamızda** toplanır ve tarayıcı bu alanları sunucu-imzalı form
alanlarıyla birlikte doğrudan `https://www.paytr.com/odeme` adresine POST eder.

Sonuç: kart verisi kendi API'mize hiç uğramaz (iyi), ama **ödeme sayfamıza
yüklenen her script kart verisine erişebilecek konumdadır** (kapsam). Bu, sayfayı
6.4.3 kapsamına sokar. Iframe API'ye geçiş kapsamı daraltırdı; Direkt API'de
kalma kararı bilinçlidir (bkz. §6).

Mevcut kod tarafı korumalar (`_hooks/useCardPayment.ts`):

- **Hedef doğrulaması** — form action'ı `https` + `www.paytr.com` + `/odeme`
  olmadıkça POST edilmez; API ele geçirilse bile kart başka origin'e gönderilemez.
- **Alan doğrulaması** — sunucudan gelen alan listesinde ham kart alanı adı
  (`card_number`, `cvv`, …) varsa istemci akışı keser.
- **Tokenizasyon** — kayıtlı kartlar PayTR'de saklanır (`utoken`/`ctoken`); PAN
  bizde hiçbir yerde tutulmaz.
- **3DS** — kullanıcı checkout'u her zaman 3D Secure (`non_3d = "0"`).

---

## 2. Script envanteri (6.4.3)

Ödeme sayfasında yüklenen **tüm** script'ler. "Neden" sütunu 6.4.3'ün istediği
iş gerekçesidir.

| Script                                  | Kaynak                                | Neden gerekli                        | Yetkilendirme                            |
| --------------------------------------- | ------------------------------------- | ------------------------------------ | ---------------------------------------- |
| Next.js runtime + uygulama chunk'ları   | Kendi origin'imiz (`/_next/static/…`) | Sayfanın kendisi (React, rota, form) | `script-src 'self'` + istek başına nonce |
| Next.js satır içi hidrasyon script'leri | Satır içi (`self.__next_f`)           | RSC yükünün hidrasyonu               | Yalnız `'nonce-<istek>'` ile             |
| Sentry SDK (hata raporlama)             | Bundle içinde, kendi origin'imiz      | Ödeme hatalarının teşhisi            | `'self'`; ingest'e `connect-src`         |

**Üçüncü taraf `<script src>` YOKTUR.** Sayfada Google Tag Manager, analytics,
chat widget, A/B testi veya reklam script'i bulunmaz. Sitenin başka yerlerinde
yüklenen tek harici script Apple ile Giriş
(`https://appleid.cdn-apple.com/...appleid.auth.js`, yalnız `(auth)` rotaları) —
CSP ödeme profilinde bu origin **bilinçli olarak dışarıda bırakılmıştır**.

### Sentry Session Replay — ödeme sayfasında KAPALI

Replay varsayılan olarak metin ve input'ları maskeler (`maskAllText`,
`maskAllInputs`), yani kart verisini kaydetmez. Yine de kart alanlarının
bulunduğu sayfada DOM kaydeden bir script'i gerekçelendirmek yerine kaydı
tamamen kapatıyoruz. İki katman (`src/lib/replayPolicy.mjs`):

1. **Init anında** — `sentry.client.config.ts` örnekleme oranlarını sıfırlar;
   kullanıcı doğrudan ödeme URL'ine girerse replay hiç kurulmaz.
2. **Rota koruması** — `PaymentReplayGuard` SPA gezinmesiyle gelindiğinde çalışan
   kaydı `Sentry.getReplay()?.stop()` ile durdurur.

Hata raporlaması (Replay değil) ödeme sayfasında açık kalır: ödeme hatalarını
görmek operasyonel zorunluluk.

---

## 3. Content Security Policy

Politika tek kaynaktan üretilir: `apps/web/src/lib/cspPolicy.mjs`
(testler: `apps/web/scripts/csp-policy.test.mjs`), `src/middleware.ts` içinde
istek başına uygulanır.

### Rollout modeli

| Rota               | Başlık                                    | Gerekçe                                                                |
| ------------------ | ----------------------------------------- | ---------------------------------------------------------------------- |
| `/payment/*`       | `Content-Security-Policy` (**zorlayıcı**) | Kart sayfası ilk günden korunur                                        |
| Diğer tüm sayfalar | `Content-Security-Policy-Report-Only`     | İhlal envanteri gerçek trafikle toplanır, hiçbir sayfa aniden bozulmaz |

### Nonce akışı

Middleware her istek için nonce üretir ve **hem yanıta hem isteğe** yazar. Next,
RSC render'ında istek başlığındaki CSP'den nonce'u okuyup kendi satır içi
script'lerine basar (`get-script-nonce-from-header`). İstek başlığı yazılmazsa
Next'in script'leri nonce'suz kalır ve zorlayıcı modda bloklanır.

İstek başlıkları **yerinde** set edilir (klonlanmaz): `next-intl` middleware'i
kendi rewrite'ında `request.headers`'ı aşağı taşır, bu yüzden mutasyon
downstream'e ulaşır. Request klonlamak POST gövdeli isteklerde (server action)
gövde akışını riske atardı.

**Doğrulama (üretim build'i, `/payment/test-1`)**: sayfadaki 79 script etiketinin
tamamı yanıt başlığındaki nonce'u taşır, nonce'suz script yoktur. Sayfa HTML'inde
harici script/stil/font origin'i geçmez (yalnız footer'daki sosyal medya
bağlantıları); üretim chunk'larında `eval`/`new Function`/Web Worker kullanımı
yoktur — yani zorlayıcı politika çalışan sayfayı bozmaz.

### Hangi rotalar zorlayıcı?

`/payment/*` — kart formu (`[id]`) ve 3DS dönüş sayfaları (`success`, `fail`).
Kart alanlarını işleyen kod **yalnız** `payment/[id]/_hooks/useCardPayment.ts` +
`_components/CardPaymentForm.tsx` içindedir; `/cart/payment` (checkout özeti),
`/payment-options` ve `/profile/payment-methods` kart verisi toplamaz ve
salt-rapor modunda kalır.

### Ödeme profili farkları

Ödeme profili **yalnız üçüncü taraf script yüzeyini** daraltır:

- `script-src` — Apple origin'i yok; sadece `'self'` + nonce.
- `form-action 'self' https://www.paytr.com` — kart alanlarının gidebileceği tek
  dış hedef. (CSP katmanındaki karşılığı `useCardPayment`'taki URL kontrolünün.)
- `frame-src` — Apple yerine PayTR.

Kendi altyapımız (API `/gateway`, socket.io, S3 görselleri) **her iki profilde de
açıktır**: ödeme sayfası storefront chrome'unun (Header/Footer +
`RealtimeProvider`) içinde render edilir; bunları kesmek güvenlik değil arıza
üretirdi. 6.4.3'ün konusu üçüncü taraf script'lerdir.

### Sabit direktifler

- `base-uri 'none'` — `<base>` enjeksiyonu göreli script URL'lerini başka
  origin'e kaçırabilirdi.
- `object-src 'none'`, `default-src 'self'`, `frame-ancestors 'self'`.
- `style-src 'self' 'unsafe-inline'` — Tailwind/Next satır içi `<style>` ve
  `style={{…}}` nitelikleri üretir; nonce stil **niteliklerini** kapsamaz. Kabul
  edilen risk: stil enjeksiyonu script çalıştıramaz, kart çalamaz.
- `'unsafe-eval'` yalnız geliştirmede (React Fast Refresh); üretimde yok.

---

## 4. İhlal raporlaması (11.6.1)

`report-uri`, Sentry DSN'inden türetilen güvenlik uç noktasına gider
(`sentryReportUri`): `https://<host>/api/<projectId>/security/?sentry_key=<key>`.
Ayrı bir rapor altyapısı kurmadan CSP ihlalleri Sentry'ye düşer. DSN yoksa
raporlama sessizce kapalıdır (politika yine uygulanır).

Bu, 11.6.1'in **tespit** ayağının ilk adımıdır; periyodik envanter karşılaştırması
ve alarm yönlendirmesi ayrı issue'da izlenmektedir.

---

## 5. Değişiklik prosedürü (6.4.3 sürekliliği)

Ödeme sayfasına dokunan her PR'da:

1. **Yeni script mi ekleniyor?** `/payment` altında yeni bir `<script src>` veya
   üçüncü taraf SDK — varsayılan cevap **hayır**. Gerekiyorsa: §2 tablosuna satır
   ekle, `cspPolicy.mjs` ödeme profiline origin'i ekle, gerekçeyi PR'da yaz.
2. **CSP değişti mi?** `scripts/csp-policy.test.mjs` güncellenmeli; testler
   ödeme profilinin üçüncü taraf içermediğini sabitler.
3. **Deploy sonrası** `/payment/<id>` yanıt başlığında `Content-Security-Policy`
   (report-only DEĞİL) olduğunu ve sayfa script'lerinin nonce taşıdığını doğrula.
4. **Sentry'de** yeni CSP ihlali tipi var mı — üretimde ilk hafta günlük bak.

---

## 6. Açık kalemler

Kod dışı, takip issue'larıyla izleniyor:

- **SAQ kapsam teyidi** — PayTR ve acquiring bankadan yazılı olarak. Direkt API'de
  güvenlik sorumluluğunun mağazada olduğunu PayTR dokümanı açıkça belirtir;
  çalışma varsayımımız SAQ A-EP'dir, yazılı teyitle doğrulanmalıdır.
- **Tamper/değişiklik tespiti** — CSP raporlarının üstüne periyodik envanter
  karşılaştırması ve alarm yönlendirmesi.
- **Harici sızma testi** — canlı öncesi, ödeme akışını kapsayacak şekilde.
- **Iframe API alternatifi** — kapsamı SAQ A'ya indirirdi; UX bedeli karşılığında
  değerlendirilebilecek en büyük kapsam-küçültme hamlesi. Şu an Direkt API'de
  kalma kararı verilmiştir.
