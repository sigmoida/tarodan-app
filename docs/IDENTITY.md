# Kimlik: Kullanıcı Adı ve Herkese Açık Ad

Bir üyenin **gerçek adı** ile **başkalarına görünen adı** ayrı şeylerdir. Bu
belge ikisinin sınırını çizer. Tek kaynak:
`apps/api/src/common/helpers/public-identity.ts` (zincir) ve
`apps/api/src/modules/auth/username.util.ts` (kullanıcı adı kuralları).

## 1. Zincir

Herkese açık ad TEK yerde, **sunucuda** çözülür; istemciler hazır `publicName`
alanını basar (kural istemciye kopyalanmaz):

| Sıra | Koşul                         | Görünen ad    |
| ---- | ----------------------------- | ------------- |
| 1    | `companyName` dolu (kurumsal) | Firma adı     |
| 2    | Kullanıcı adı seçilmiş        | `username`    |
| 3    | Aksi halde (eski hesap)       | `displayName` |

Kurumsal hesaplarda kullanıcı adı yerine **firma adı** görünür: müşteri firmayı
ticari unvanıyla tanır, yetkilinin adı kimseyi ilgilendirmez.

## 2. Kullanıcı adı nereden gelir

| Kayıt yolu            | Kullanıcı adı                    | `usernameClaimedAt`            |
| --------------------- | -------------------------------- | ------------------------------ |
| E-posta + şifre       | Kayıt formunda ZORUNLU           | dolu                           |
| Google / Apple        | E-postadan türetilir (sorulmaz)  | boş → bir kez değiştirilebilir |
| Admin daveti          | E-postadan türetilir             | boş                            |
| Kurumsal davet        | Aktivasyonda seçilir             | dolu                           |
| Geçiş öncesi hesaplar | `legacy_########` (DB `DEFAULT`) | boş                            |

`legacy_` öneki **"kullanıcı adı seçilmedi"** işaretidir; bu yüzden hiçbir üye
tarafından alınamaz (`isUsernameAllowed` reddeder) ve profil bağlantısında
kullanılmaz (`publicUsername` null döner → bağlantı id üzerinden kurulur).

Kullanıcı adı **bir kez** seçilir (`PATCH /users/me/username`); seçildikten
sonra değişmez — başkalarının tanıdığı ad kayıp gitmesin diye.

## 3. Gerçek ad nerede görünür

`displayName` yalnızca kişinin **kendi** yüzeylerinde ve yasal/operasyonel
belgelerde kullanılır:

- Profil ayarları, kayıt formu, teslimat adresi formu, kurumsal panel
- Fatura (e-Logo, satıcı ürün faturası), kargo etiketi, payout kayıtları
- Admin paneli (üye yönetimi denetim işidir, üye yüzeyi değil)

Herkese açık yükte `displayName` alanı **korunur ama içeriği `publicName`'dir**
— eski istemciler (mobil) bozulmasın diye takma ad olarak durur. Yeni kod
`publicName` okur.

## 4. Sonuçları

- **Arama:** satıcı otomatik tamamlama kullanıcı adı ve firma adında arar.
  Kullanıcı adı seçmiş bir üye artık gerçek adıyla bulunamaz.
- **Elasticsearch:** `sellerName` (ürün) ve `userName` (koleksiyon) alanları
  herkese açık addan yazılır. Kimlik davranışı değişince **tam reindex**
  gerekir; adımlar `docs/OPERATIONS.md` içinde.
- **Misafir siparişi:** alıcı satırı ortak sentetik hesaptır
  (`guest@tarodan.system`). Satıcıya bu hesap değil, siparişin teslimat
  verisindeki gerçek alıcı adı gösterilir.
- **Silinmiş hesap:** anonimleştirmede `displayName` "Silinmiş Kullanıcı"
  olur; kullanıcı adı satırda kalır (yeniden dağıtılmaz). Silme ÖNCESİ gerçek
  kimlik (e-posta, telefon, ad, TCKN/VKN, adres) `DeletedUserIdentity` arşivine
  kopyalanır — aylık resmî bildirim yükümlülüğü için. Arşiv yalnız yönetici
  panelinden okunur, DB tetikleyicisiyle silinemez; geçmiş raporlar (stopaj)
  silinmiş satıcının kimliğini oradan çözer. Sentinel değerler
  (`deleted_...@deleted.local`, "Silinmiş Kullanıcı") kimlik SAYILMAZ:
  `common/helpers/deleted-user-identity.ts` bunları eler.

## 5. Yeni bir yüzey eklerken

1. Prisma seçimine `PUBLIC_IDENTITY_SELECT` (kart) ya da `PUBLIC_NAME_SELECT`
   (yalnız ad) koy — elle `displayName: true` yazma.
2. Yanıtı `toPublicIdentity(row)` ya da `publicIdentityFields(row)` ile üret.
3. Ad bir bildirim/e-posta metnine giriyorsa `publicName(user)` kullan: aynı
   değer çoğu şablonda hem alıcıya hem karşı tarafa gösterilir.
4. Web tarafında `publicNameOf(user)` ile bas (`apps/web/src/lib/public-name.ts`).

## 6. Yasal kimlik: ad, soyad, T.C. Kimlik No

Devlet bildirimi için **her üyenin** yasal adı, soyadı ve TCKN'si kayıtlı
olmalıdır. `displayName` bunun yerine geçmez (takma ad olabilir). Alanlar
`User.legalFirstName`, `User.legalLastName`, `User.nationalId` (göç
`20261005190000_legal_identity`). Tek kural `@tarodan/types` →
`legal-identity.ts` (`isValidTckn`, `isValidLegalName`, normalizasyon);
API dekoratörleri (`@IsTckn`, `@IsLegalName`), web/admin zod alanları
(`@tarodan/ui/form`: `legalName`, `tckn`, `…Optional`) aynı fonksiyonu çağırır.

| Kural          | Değer                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TCKN           | Yalnız rakam saklanır (boşluk/tire temizlenir); 11 hane, ilk hane ≠ 0, iki checksum kuralı. Yabancı kimlik no'ya özel muamele yok: algoritma geçerse kabul.                                                                          |
| Ad / soyad     | Harf (Türkçe dahil), aralarında tek boşluk / tire / kesme; 2–50 karakter. Büyük-küçük harf korunur. AI moderasyonundan GEÇMEZ (herkese açık metin değil; gerçek soyadları yanlış pozitif verirdi).                                   |
| Tekillik       | Bir TCKN tek hesapta (`users_national_id_key`). Çakışmada yanıt yalnız "bu numara kullanılamıyor" der — diğer hesap hakkında hiçbir bilgi yok.                                                                                       |
| Kimden istenir | Herkes (alıcı dahil, onaylı kurumsal satıcı dahil). **Muaf:** personel (AdminUser satırı olan hesap) ve test şeridi (`isTestAccount`).                                                                                               |
| Kim değiştirir | Üye bir kez girer; dolu alanı **değiştiremez**. Düzeltme yalnız admin: kullanıcı detayı → Kimlik bilgileri → Düzelt (super_admin / admin, gerekçe zorunlu, aynı transaction'da zorunlu denetim kaydı `user_legal_identity_correct`). |

### Nereden toplanır

- **Web kaydı**: form üç alanı ZORUNLU ister.
- **API kaydı** (`POST /auth/register`): alanlar **opsiyonel** — bugünkü mobil
  sürümler göndermiyor. Gönderilen alan doğrulanır, TCKN tekilliği uygulanır.
- **Google / Apple** ile açılan hesap ve alanları göndermeyen kayıt: kimlik
  kapısı ilk girişte ister.
- **Kimlik kapısı** (web): eksik alanı olan üyeye kapatılamaz pencere; tek
  çıkış kaydetmek ya da oturumu kapatmak. Yalnız eksik alanlar sorulur. TCKN,
  üyenin KENDİ banka hesabında geçerli bir numara varsa onunla ön doldurulur;
  ad hiçbir kaynaktan tahmin edilmez.
- **Onay kapısıyla sıra:** iki pencere tek montaj noktasından çıkar
  (`components/required-steps/RequiredStepsGate.tsx`, sıra
  `lib/requiredSteps.ts` → `REQUIRED_STEPS = ["consents", "legalIdentity"]`).
  Aynı anda yalnız biri gösterilir: önce sözleşme onayları (kimlik verisinin
  işlenme dayanağı KVKK metnidir), sonra kimlik; onay durumu yüklenirken kimlik
  penceresi açılmaz. Yeni bir zorunlu adım bu listeye eklenir. Yasal metin
  sayfaları her iki adımdan muaftır; kapatılabilir satıcı adres hatırlatması
  zorunlu bir adım açıkken susar.

**Zorlama yalnız istemcidedir.** Sunucu kimliği eksik üyenin isteklerini
REDDETMEZ (onay kapısıyla aynı karar): reddetmek kapıyı bilmeyen mobil
sürümleri kilitlerdi. Mobil sözleşme: `docs/mobile-parity/23-api-delta-2026-10-05-legal-identity.md`.

### API

| Uç                                         | Ne yapar                                                                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET /legal-identity/me`                   | `{ required, missing[], legalFirstName, legalLastName, nationalIdMasked, suggestedNationalId }` — tam TCKN asla dönmez             |
| `POST /legal-identity/me`                  | Eksik alanları yazar; dolu alanı değiştirme `409 server.identity.locked`; çakışan TCKN `409 server.identity.nationalIdUnavailable` |
| `PATCH /admin/users/:id/legal-identity`    | Admin düzeltmesi (`reason` zorunlu)                                                                                                |
| `GET /admin/users?identityIncomplete=true` | "Kimlik eksik" filtresi — kapıyla aynı kural (`legalIdentityIncompleteWhere`)                                                      |

`POST /legal-identity/me` bir "bu TCKN kayıtlı mı" kahinidir; bu yüzden
istemci IP'si başına 5/dk (`@Throttle`, `clientIpThrottleTracker`) ve
tekillik sorgusundan ÖNCE Redis bütçesi: üye başına 10/gün, IP başına 30/saat
(`LEGAL_IDENTITY_SUBMIT_LIMITS`). Kayıt formu TCKN gönderirse aynı IP
bütçesinden harcar. Aşımda `429 server.identity.tooManyAttempts`.

### Gizlilik — nereye ASLA girmez

Herkese açık ya da karşı tarafa giden hiçbir yük (profil, satıcı kartı,
sipariş karşı tarafı, mesaj), arama dizini, bildirim ve log:

- `PUBLIC_IDENTITY_SELECT` / `PUBLIC_NAME_SELECT` bu alanları seçmez;
  `toPublicIdentity` satır taşısa bile düşürür.
- `StripSensitiveFieldsInterceptor` üç anahtarı her yanıttan siler; istisna
  yalnız `@AdminRoute` ve üyenin kendi ucu (`@ExposesLegalIdentity`).
- `redactSensitive` (Sentry), `ErrorLogInterceptor` (error_logs) ve
  `AdminAuditService` aynı anahtarları (+ banka `tcKimlikNo`) redakte eder.
  Admin düzeltmesinin denetim kaydı yalnız değişen alan adlarını, maskeli
  TCKN'yi ve gerekçeyi taşır.
- Sözleşme spec'i: `common/interceptors/legal-identity-privacy.spec.ts`
  (gerçek uçlarla süzgeç + `users`tan bu alanları SEÇEN dosyalar için kaynak
  taraması).

### Saklama

Repo'daki yerleşik uygulama: kimlik numaraları **düz metin** kolonlarda
(`User.taxId`, `SellerBankAccount.tcKimlikNo`, `DeletedUserIdentity.nationalId`,
`CorporateStakeholder.identityNumber`); şifreleme yok, koruma erişim
katmanında (yalnız admin rotaları, maskeli gösterim, redaksiyon). `nationalId`
aynı uygulamayı izler: tekillik ve admin araması düz değere ihtiyaç duyar.
**Yeterlilik:** KVKK m.12 "uygun güvenlik düzeyi" için tek başına zayıf —
veritabanı dökümü/yedeği sızarsa TCKN'ler açıkta. Önerilen sonraki adım
(ayrı karar): uygulama katmanında deterministik şifreleme (tekillik için
HMAC "blind index" + AES-GCM değer) ya da en azından yedeklerin şifrelenmesi
ve DB erişiminin daraltılması; dört kolon birlikte taşınmalı.

### Hesap silme

Silmenin ilk adımı kimliği `DeletedUserIdentity` arşivine kopyalar (yeni
`legalFirstName` / `legalLastName` kolonları; `nationalId` önce
`User.nationalId`, boşsa eski kaynaklar), sonra canlı satırda üç alan NULL'lanır
— TCKN tekilliği serbest kalır (e-posta/telefon gibi). Aylık bildirimin
"Ad Soyad / Unvan" hücresi yasal adı tercih eder (`archiveLegalFullName`),
yoksa silme anındaki ada düşer; kolon kümesi ve biçim sürümü değişmedi.

### Banka hesabındaki TCKN

`SellerBankAccount.tcKimlikNo` ikinci bir kimlik kaynağı OLMAZ:

- Web banka formu alanı artık göstermez; kaydetme mevcut değere dokunmaz.
- API alanı mobil uyumluluğu için kabul eder, ortak kuralla doğrular ve
  üyenin `nationalId`'si varsa **aynı olmasını** ister
  (`400 server.identity.bankNationalIdMismatch`).
- Eski değer yalnız (a) kimlik kapısında ön doldurma önerisi, (b) GİB raporu
  ve silme arşivinde `User.nationalId` boşken geri düşüş olarak okunur.
