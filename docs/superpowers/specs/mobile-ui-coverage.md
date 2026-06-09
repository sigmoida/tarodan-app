# Mobil UI Kapsama İndeksi — KESİN 136 (kanıta dayalı)

Tarodan 136 yolculuğun mobil-UI durumu. 6-ajan denetimi (ekranları açarak) + RNTL implement ile kanıta dayalı.
**Durum:** ✅ RNTL testi var · 🟡 test-edilebilir ama henüz testsiz · 🔙 backend-only (API e2e'de) · 🚧 missing-screen (mobilde ekran yok)

**Güncel:** 2026-06-10 · **56 test suite / 301 test yeşil** (`cd apps/mobile && npx jest --forceExit`).
**Maestro J1 wiring:** FAILED-brittle (ilk assert 'Kategoriler' bayat selector; ana ekran o metni göstermiyor — flow güncellenmeli, app bug değil). Ödeme adımı bypass; gerçek 3DS WebView kanıtlanmadı.

## Özet sayım
- ✅ test var: **102**
- 🟡 test-edilebilir (henüz testsiz): **5**
- 🔙 backend-only (521 API e2e): **21**
- 🚧 missing-screen: **8**

> Backend-only ve missing-screen yolculuklar mobilde RNTL ile test edilemez/edilmemeli. Backend mantığı 521 API e2e'de.

## 136 Yolculuk
| J | Başlık | Durum | Eksik / test dilimi |
|---|---|---|---|
| J1 | Yeni alıcı ilk alışveriş sorunsuz | ✅ | Ürün ekleme (sepet icon press), sepet listesi rend |
| J2 | İlk ilan veren satıcı otomatik satıcı  | ✅ | Oto-satıcı onay/notification flow backend, düzeltme/reddetme |
| J3 | Pazarlık: alıcı teklif satıcı karşı te | ✅ | Teklif modal (amount input), offers list (received |
| J4 | Pazarlık başarısız: teklif süresi dolm | ✅ | Backend expiry trigger/notification, expired→cancelled state |
| J5 | Takas: karşı teklifle anlaşma + depo | ✅ | Trade counter form (amount + description), trade d |
| J6 | Takas nakit farklı: önce ödeme sonra k | ✅ | PayTR payment iframe/modal entegrasyon, payment completion w |
| J7 | Takas depoda reddediliyor: iade | ✅ | Admin rejection action (mobile yok), return shipment trackin |
| J8 | Kargodan önce iade: para anında geri | ✅ | Refund approval/rejection UI (seller view), auto-refund flow |
| J9 | Teslimden sonra cayma hakkı 14 gün içi | ✅ | Deadline enforcement (backend), auto-completion after 14 gün |
| J10 | 14 gün sonrası iade: anlaşmazlık satıc | ✅ | Admin dispute resolution UI (mobile yok), seller reject/resp |
| J11 | Ödeme süresi doluyor geri dönüp ödüyor | ✅ | Payment deadline trigger/extension API, redirect PayTR |
| J12 | Ödeme süresi doluyor stok tükeniyor | ✅ | Stock depletion notification, auto-order-cancel on timeout + |
| J13 | Aynı anda son ürünü iki kişi | ✅ | Race condition handling UI feedback, real-time stock updates |
| J14 | Üyelik yükseltme limit dolunca pakete  | ✅ | Membership tiers list (basic/premium/business card |
| J15 | Koleksiyon oluşturup paylaşma + beğeni | ✅ | Collection form (name/description/public toggle),  |
| J16 | Mesajlaşmada iletişim bilgisi engellen | ✅ | Admin warning/suspension flow |
| J17 | Kullanıcı başka birini engelliyor | 🚧 | Blok/engelleme yönetim ekranı ve API integrasyon yok |
| J18 | Yönetici uygunsuz ürünü reddediyor sat | ✅ | Admin approval panel (mobile yok), rejection reason display, |
| J19 | Yönetici kötüye kullananı yasaklıyor | 🔙 | Admin ban/suspension action (mobile yok), user-facing ban no |
| J20 | Destek talebi yaşam döngüsü | ✅ | Support ticket list/detail/status tracking UI, reply/escalat |
| J21 | İstek listesi stok bitince ekleme geli | ✅ | True wishlist/watchlist add-to-list button on product detail |
| J22 | Kupon ile indirimli alışveriş | 🚧 | Coupon input field in checkout, discount calculation, coupon |
| J23 | İki adımlı doğrulama açıp güvenli giri | ✅ | Login 2FA code input screen (not found), backup code regener |
| J24 | Şifremi unuttum sıfırlama + eski oturu | ✅ | Form: email giriş + submit (forgot-password); toke |
| J25 | Misafir üye olmadan alışveriş | ✅ | Guest name/email/phone input (checkout); guest inf |
| J26 | Satıcı geç hazırlıyor otomatik iptal | ✅ | Otomatik iptal webhook işlemesi backend tarafından; UI yalnı |
| J27 | Satıcının IBANı yok aktarım başarısız  | 🔙 | Bilinen gerçek: mobilde IBAN/banka ekranı YOK. Payment metho |
| J28 | Tekrarlı ödeme bildirimi bir kez işlen | 🔙 | Tekrarlı webhook'un deduplication işlemesi backend tarafında |
| J29 | Sahte ödeme bildirimi reddedilir | 🔙 | Sahte webhook validasyonu backend tarafında (signature check |
| J30 | Premium üye koleksiyon showcase | ✅ | Collections list/browse (index); create new collec |
| J31 | Alıcı ürün+satıcı puanlıyor haksız eng | ✅ | Rating engelleme kuralı (fair rating check) backend tarafınd |
| J32 | Adres yönetimi + hesap silme engeli | ✅ | Hesap silme endpoint yoksa DeleteAccountDto işlemesi ve enge |
| J33 | Sepet kuralları stok sınırı + başkasın | ✅ | Sepet kupon kodu ekranı YOK (bilinen gerçek). Stok kontrol + |
| J34 | Teklif kabul ama alıcı ödemiyor 24s ip | ✅ | Teklif kabul→ödeme entry (checkout redirection) mobilde yok; |
| J35 | Takas teklifine cevap gelmiyor otomati | ✅ | Otomatik iptal webhook backend'de; UI yalnızca status displa |
| J36 | Yönetici komisyon+indirim kuralları | 🔙 | Admin paneli mobilde yok (bilinen gerçek). Komisyon ve indir |
| J37 | Alıcı beğenmedi yolda iken iade | ✅ | Refund request button on order detail (shipped sta |
| J38 | Bildirimleri yönetme + mobil bildirim  | ✅ | Notification settings toggles (push/email categori |
| J39 | Bülten ve reklam etkileşimi | ✅ | Email input + subscribe button (newsletter); unsub |
| J40 | Tam tur üye olma satma takas satın alm | ✅ | Register flow; sell (listing form); trade creation |
| J41 | Misafir gezdi kayıt olamadı sonra üye  | ✅ | Guest signup prompt on product view; register form |
| J42 | Yaş sınırı 18 altı alınmıyor | ✅ | Birth date picker with 18+ validation; error messa |
| J43 | Aynı e-posta ile ikinci hesap açılamıy | ✅ | Duplicate email detection backend tarafında; UI yalnızca err |
| J44 | Yanlış şifre sonrası başarılı giriş | ✅ | Email/password input; error message on wrong passw |
| J45 | E-posta doğrulama bağlantısı süresi ge | ✅ | Verify email form; token input; expired token erro |
| J46 | Şifre değiştirme yanlış mevcut şifre e | ✅ | Password change modal (current/new/confirm inputs) |
| J47 | İki adımlı doğrulama yanlış kodla açıl | ✅ | 2FA kod girişi formu, 6 haneli Input ve onay buton |
| J48 | Çalınan oturum yenileme anahtarı redde | ✅ | JWT/refresh token interceptor'ı test etme token-bound değil; |
| J49 | Hesap silinince eski anahtar çalışmıyo | 🚧 | Hesap silme ekranı mobilde yok (settings bölümünde da buluna |
| J50 | Satıcı IBANını birkaç kez hatalı giriy | 🚧 | IBAN giriş ekranı mobilde yok (bilinen gerçek: mobilde IBAN/ |
| J51 | Satıcı banka hesabını silip yeniden ek | 🚧 | Banka hesabı yönetim ekranı mobilde yok |
| J52 | Katalog gezinme olmayan kategori/marka | ✅ | Category/brand detail ekranında ürün listeleme. Bo |
| J53 | Arama ve filtre ile ürün bulma | ✅ | Arama input'u, filtre modal'ı (ProductFilterSheet) |
| J54 | Vergi ve fiyat dökümü inceleyip alışve | ✅ | Checkout adım 1'de fiyat özeti (ara toplam, kargo, |
| J55 | Satıcı ürün başlığını çok kısa giriyor | ✅ | ListingForm'da title input'u (minLength validasyon |
| J56 | Satıcı ürün güncelliyor ve siliyor | ✅ | Edit form load'ı (ürün data yükleme), başlık/price |
| J57 | Ürün beğenme ve geri alma | ✅ | Ürün detayında/listede beğeni butonu (heart icon), |
| J58 | Sepette kupon denemeleri | ✅ | Checkout adım 1'de kupon input'u, validate butonun |
| J59 | Sepet izolasyonu başkasının sepeti gör | ✅ | Cart ekranında items render'ı (useCartStore state) |
| J60 | Kendi ürününü satın alma/teklif engeli | ✅ | API backend validasyon → UI sadece hata mesajı gösterir (bac |
| J61 | Stoğu biten ürünü almaya çalışma | ✅ | OutOfStockOverlay render'ı (product.isOutOfStock f |
| J62 | Tekrarlanan satın alma tek sipariş | 🔙 | Idempotency backend'de (duplicate request handling), UI sade |
| J63 | Satıcı ödemeden hazırlamaya çalışıyor | ✅ | Backend state machine (status → action eligibility), UI sade |
| J64 | Alıcı olmayan teslimatı onaylayamıyor | ✅ | AwaitingConfirmationBanner render'ı (isBuyer check |
| J65 | Sipariş adresini ödeme öncesi değiştir | ✅ | Checkout adım 1'de address seçimi/form (shippingAd |
| J66 | İptal edilen sipariş yeniden aktive | ✅ | Order detail'de status=cancelled durumunda reactiv |
| J67 | İptal olmayan sipariş yeniden aktive e | ✅ | Reactivate butonunun conditional render (status != |
| J68 | Komisyon önizleme hatalı girdiler | ✅ | Commission preview render'ı (sellerFeeAmount, sell |
| J69 | Ödeme iptali ve rezervasyon serbest | ✅ | Reservation release (escrow → free) backend'de (payment stat |
| J70 | Başkasının ödemesini iptal engeli | 🔙 | Başka alıcının ödemesini iptal etme UI'ı mobile'da yok (satı |
| J71 | Başarısız ödeme onayı ile rezervasyon  | ✅ | ödeme başarısız sayfası (Ionicons close-circle, Bu |
| J72 | Çoklu ödeme bildirimi fırtınası tek ke | ✅ | Ödeme webhook duplicate handling UI'ı yok, backend logic'i v |
| J73 | Kaçırılan ödeme bildirimi otomatik kur | ✅ | success ekranında verify() idempotent çağrısı + po |
| J74 | Test ortamında ödeme bypass akışı | ✅ | PAYMENT_BYPASS=true iken WebView'in bypassComplete |
| J75 | Para akışı ödeme tutuldu süre sonunda  | ✅ | Hold release schedule UI'ı mobile'da yok (backend timer işle |
| J76 | Sipariş iadesi para akışını geri alır | ✅ | orders detail'de refund request button, refund mod |
| J77 | Kargo ücreti sorgulama ve teslimat | ✅ | checkout'ta shipping rate calculation (shippingApi |
| J78 | Fatura erişimi yabancı engellenir | ✅ | Coğrafi IP kısıtlama UI'ı yok (backend doğrulama) |
| J79 | Hiç siparişi olmayan üyenin fatura lis | ✅ | empty state (Ionicons receipt-outline, 'Henüz ödem |
| J80 | Aynı sipariş için ikinci iade engeli | ✅ | orders detail'de activeRefundRequest varsa refund  |
| J81 | İade talebini sadece alıcı açabilir | ✅ | orders detail'de 'order.isBuyer && !order.activeRe |
| J82 | İade kargosu açıldıktan sonra iptal ed | ✅ | orders detail'de cancel button sadece pending_revi |
| J83 | Ödeme bekleyen siparişe iade yapılamaz | ✅ | orders detail'de payment?.status !== 'completed' i |
| J84 | Anlaşmazlıkta satıcı iadeyi kabul eder | ✅ | seller refund view'da pending_review statusü için  |
| J85 | Satıcı iade reddini çok kısa yazıyor | ✅ | refund modal'da 'Gerekçe gerekli' alert, 10+ char  |
| J86 | Hazırlık süresi dolan sipariş otomatik | ✅ | Auto-cancel schedule UI'ı yok (backend cron/scheduler işlemi |
| J87 | Ödeme süresi dolunca kargo da iptal | 🟡 | Payment deadline notification/countdown UI'ı mobile'da yok |
| J88 | Webhook güvenliği yanlış anahtar redde | 🔙 | Webhook HMAC validation mobile UI'ı yok (backend signature c |
| J89 | Satıcıya aktarım 3 denemeden sonra kal | ✅ | Retry UI / seller payout status detail screen mobile'da yok |
| J90 | Yönetici takas nakit bekletmesini erke | 🟡 | Admin panel UI'ı mobile'da yok (release toggle yöneticiye ai |
| J91 | Düşük teklif reddedilir sonra hemen al | ✅ | offer detail'de reject button + reject reason moda |
| J92 | Satıcı karşı teklifte kuralları zorluy | ✅ | Rule violation warning/blocking UI eksik olabilir, backend v |
| J93 | Alıcı kendi teklifini iptal ediyor | ✅ | Alıcı pending teklif detayı → 'Teklifi İptal Et' b |
| J94 | Teklif detayını yabancı göremiyor | 🔙 | Authorization kontrolü backend tarafında; mobile'da görünüm  |
| J95 | Süresi dolmuş teklif kabul edilemiyor | ✅ | Backend: expired timestamp check, API reject; mobile: UI sho |
| J96 | Teklif sipariş ödeme satıcıya aktarım | 🔙 | Escrow, sipariş oluşturma, ödeme backend; mobile yalnızca UI |
| J97 | Takas kendisiyle/geçersiz koşul oluşmu | 🔙 | Backend: self-trade, invalid condition validation; mobile: U |
| J98 | Takas otomatik kargo bacaklar ayrı tes | 🔙 | Escrow warehouse, automatic shipment routing, multi-leg deli |
| J99 | Eski depoya gönder artık çalışmıyor | 🔙 | Warehouse routing, deprecated warehouse check — backend lega |
| J100 | Takasta anlaşmazlık açma yetkisi | 🚧 | Dispute/complaint screen mevcut değil; trade detail'de menüd |
| J101 | Karşı teklif sadece alıcı tarafından k | ✅ | Counter offer alıcı detayı → 'Kabul Et' butonu vis |
| J102 | Son adet satışı bekleyen teklifleri ip | 🔙 | Automatic offer cancellation on final sale — backend event/t |
| J103 | Mesajlaşma katılımcı olmayan engelleni | ✅ | Backend: participant validation, authorization; mobile: no U |
| J104 | Günlük mesaj limiti kontrolü | ✅ | Message input UI → disabled state on limit, 'Limit |
| J105 | Koleksiyon sahipliği yabancı düzenleye | ✅ | Backend: ownership validation 403; mobile: isOwner check UI- |
| J106 | Adsız koleksiyon oluşturulamaz | ✅ | Collection name input validation → empty/whitespac |
| J107 | Üyelik paketi iptali ve yeniden abonel | ✅ | Premium active → 'Aboneliği İptal Et' button; canc |
| J108 | Geçersiz paket tipiyle abonelik deneme | ✅ | Backend: tier validation, payment processing; mobile: no inv |
| J109 | Puanlama önce alışveriş şartı | ✅ | Order delivered → rating modal open button, modal  |
| J110 | Puan sınırı 0 ve 6 reddedilir | ✅ | RatingModal star input → 0 and 6+ values rejected, |
| J111 | Şikayet yönetimi yönetici inceler | 🚧 | Admin panel user-facing mobile UI yok; complaint/dispute lis |
| J112 | İstek listesi yönetimi baştan sona | 🚧 | Request list (isRequest=true products) create/browse/manage  |
| J113 | Bildirim yönetimi başkasınınki işaretl | ✅ | Backend: notification ownership auth; mobile: UI shows own n |
| J114 | İndirim sahipliği başka satıcı düzenle | ✅ | Backend: seller ownership validation 403; mobile: UI filters |
| J115 | Misafir destek formu üye destek talebi | 🟡 | Misafir: form input (name/email/subject/message),  |
| J116 | Destek talebine yabancı erişemez | ✅ | Support ekranında isAuthenticated kontrolü: üye de |
| J117 | Bülten aboneliği ve reklam görüntüleme | ✅ | Email input, 'Abone Ol' button, 'Aboneliğimi İptal |
| J118 | Profil ve adres doğrulamaları | ✅ | edit-profile: displayName, bio, phone, birthDate,  |
| J119 | Takip et / takipten çık | ✅ | Takip listesi render, 'Takibi Bırak' button, unfol |
| J120 | Yönetici sipariş yönetimi | 🔙 | Admin panel mobilde yok (backend-only işlemi: admin order st |
| J121 | Yönetici ürün moderasyonu toplu onay | 🔙 | Admin panel mobilde yok. Backend webhook/celery job (listing |
| J122 | Süper yönetici komisyon kuralı | 🔙 | Admin settings panel mobilde yok. Platform commission rules  |
| J123 | Yönetici platform ayarları moderatör y | 🔙 | Admin panel role-based access control mobilde yok. |
| J124 | Yönetici filtreye takılan mesajları in | 🔙 | Admin moderation panel mobilde yok. Backend message filterin |
| J125 | Sistem sağlığı kontrolleri | 🔙 | Admin health check dashboard mobilde yok. |
| J126 | Misafir bilgi sayfalarını gezip üye ol | ✅ | Guides ekranı: kategori seçimi + adım listesi rend |
| J127 | Stok yarışı sonrası kaybeden istek lis | ✅ | Waitlist ekranı/geçmişi yok; sadece wishlist favori var. |
| J128 | Tam tur 2 takas başlat reddedil satışa | ✅ | Trade detail: status badge, reject/accept buttons, |
| J129 | Tam tur 3 pazarlık ödeme süresi tekrar | 🟡 | Ayrı payment ekranı mobilde sınırlı (web paritesi); trade iç |
| J130 | Tam tur 4 misafir alışveriş iade yenid | ✅ | Checkout: guest name/email input (guestName, guest |
| J131 | Tam tur 5 premium üye koleksiyon mesaj | ✅ | Collections: list/create UI (title, description, c |
| J132 | Tam tur 6 kayıt 2FA alışveriş puan | ✅ | 2FA (2-step verification) mobilde yok — sadece email verific |
| J133 | Tam tur 7 satıcı çoklu ilan biri redde | ✅ | Sell (create): ListingForm bileşen — title, descri |
| J134 | Tam tur 8 takas nakit farklı ödeme pua | 🟡 | Nakit fark payment entry/history ekranı sınırlı; takas detai |
| J135 | Tam tur 9 kupon satın alma yolda iade  | ✅ | Checkout: coupon input field + apply button (handl |
| J136 | Tam tur 10 yönetici bir günü moderasyo | 🔙 | Admin moderation panel mobilde yok. Backend: user suspension |
