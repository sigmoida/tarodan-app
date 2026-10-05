# GİB İlan ve Satıcı Raporu

Vergi idaresinin (GİB) pazar yerlerinden isteyeceği satıcı ve ilan verisinin
yönetici ekranı ve Excel dökümü. Devlet nihai biçimi henüz yayımlamadı; ekran
**bilinen alanları** bugün çekilebilir kılar. Biçim değişirse yalnız döküm
kolonları (`exportColumns`) ve ekran kolonları değişir.

- Ekran: **Finans → GİB Raporu** (`/finance/gib-report`)
- API: `GET /admin/gib-report` (liste), `GET /admin/gib-report/export` (Excel)
- İzin: `tax` (Vergi Ayarları ile aynı) + rol `super_admin` / `admin`.
  Moderator rolü bilinçli olarak dışarıdadır; `tax` izni varsayılan olarak
  yalnız `super_admin`'dedir, başkasına Roller ekranından devredilir.
- Kod: `apps/api/src/modules/admin/finance/gib-report/`,
  `apps/admin/src/app/(admin)/finance/gib-report/`,
  ortak sözleşme `packages/types/src/gib-report.ts`.

## Satır ne demek

**Her satır tek bir ilandır ve ilanın BUGÜNKÜ hâlidir.** İlan düzenlemeleri
üzerine yazılır, geçmiş tutulmaz; "şu tarihte ilan nasıldı" sorusu bu rapordan
cevaplanamaz. Kapsam: yalnız `kind = listing` ürünler (üyelik ve öne çıkarma
sanal ürünleri hariç) ve test hesabı olmayan satıcılar (`isTestAccount = false`).
Silinmiş ilanlar da listelenir (`Kaldırıldı` durumuyla); istenirse durum
filtresiyle ayrılır.

## Kolonlar ve kaynakları

| Kolon (Excel)                | Kaynak                                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Üyelik tarihi                | `User.createdAt`                                                                                                                                                                        |
| TCKN / Vergi no, Kimlik türü | Sırayla `User.taxId` → `SellerBankAccount.taxId` → `SellerBankAccount.tcKimlikNo`. İlk ikisi "Vergi no", sonuncusu "TCKN". Silinmiş satıcıda `DeletedUserIdentity.taxId` → `nationalId` |
| Ad soyad / unvan, Ad kaynağı | Aşağıdaki "Yasal ad zinciri"                                                                                                                                                            |
| Satıcı türü                  | Kurumsal = onaylı kurumsal kimlik (`hasApprovedCorporateIdentity`: `businessStatus = approved` + firma adı + vergi no). Diğer hepsi bireysel                                            |
| Silinmiş hesap               | `User.deletedAt` dolu                                                                                                                                                                   |
| İlan kodu                    | `Product.productCode`                                                                                                                                                                   |
| İlan başlığı / açıklaması    | `Product.title` / `Product.description`                                                                                                                                                 |
| Fiyat (₺)                    | `Product.price` — ilanın **güncel** fiyatı                                                                                                                                              |
| İlan durumu                  | `Product.status`                                                                                                                                                                        |
| Yayın tarihi (son onay)      | `Product.publishedAt`                                                                                                                                                                   |
| Oluşturulma tarihi           | `Product.createdAt`                                                                                                                                                                     |
| İlan adresi                  | `{FRONTEND_URL}/listings/{Product.id}` (kanonik herkese açık ilan yolu; `/products/:id` bir ilan sayfası değildir)                                                                      |
| Mağaza / profil adı          | `publicName` zinciri (firma adı → kullanıcı adı → görünen ad), bkz. `docs/IDENTITY.md`. Silinmiş hesapta boş                                                                            |
| Profil adresi                | `{FRONTEND_URL}/u/{kullanıcı adı}`; legacy kullanıcı adında `/u/{id}`. Silinmiş hesapta boş                                                                                             |

### Yasal ad zinciri

Tek çözümleyici: `resolveGibSellerIdentity` (`gib-seller-identity.ts`). İlk dolu
kaynak kazanır; hangi kaynaktan geldiği satır başına "Ad kaynağı" kolonunda
döner ki personel güvenilirliği yargılayabilsin.

| Sıra | Kaynak                                      | Ad kaynağı değeri   | Güvenilirlik                      |
| ---- | ------------------------------------------- | ------------------- | --------------------------------- |
| 1    | Onaylı kurumsal satıcıda `User.companyName` | Firma adı           | Yüksek (onaylı başvuru)           |
| 2    | `SellerBankAccount.accountHolder`           | Banka hesabı sahibi | Yüksek (ödeme için doğrulanır)    |
| 3    | Varsayılan adresin `Address.fullName`       | Adres kaydındaki ad | Orta: **başkasının adı olabilir** |
| 4    | `User.displayName`                          | Görünen ad          | Düşük: **takma ad olabilir**      |

Silinmiş satıcı canlı satırdan değil `DeletedUserIdentity` arşivinden çözülür
(anonimleştirme adı "Silinmiş Kullanıcı" yapıp vergi no'yu siler): kurumsalsa
arşivdeki firma adı, değilse arşivdeki banka hesabı sahibi, sonra arşivdeki ad
(`Arşiv: …` değerleri). Arşiv kaydı yoksa ad ve kimlik boş, kaynak "Çözülemedi"
olur — hiçbir şey tahmin edilmez, sentinel ad rapora sızmaz.

## Filtreler

Yayın tarihi aralığı (`publishedAt`), ilan durumu, satıcı türü, arama (ilan
başlığı/kodu, satıcı adı, kullanıcı adı, firma adı, satırda görünebilecek her
kimlik numarası kaynağı — kullanıcı, banka hesabı ve arşiv vergi no / TCKN —
banka hesabı sahibi ve arşivdeki ad / firma / banka sahibi) ve **Kimlik numarası: yalnız eksik
olanlar** (satıcının hiçbir kaynağında vergi no ya da TCKN yok). Sıralama
sunucu tarafındadır; varsayılan sıra son yayın (yeni → eski). Kimlik numarası
kolonu sıralanamaz (değer birden çok tabloda yaşar).

## Kişisel veri: ekran ve döküm

- Tabloda TCKN / vergi no **maskelidir** (kullanıcı detayındaki `MaskedValue`,
  tıkla-göster); toolbar'ın istemci CSV'si bu kolonu dışarı almaz.
- Excel dökümü **tam değeri** taşır ve her indirme `gib_report_export` adıyla
  **zorunlu denetim kaydı** yazar (fail-closed: kayıt yazılamazsa dosya
  gönderilmez). Denetim kaydına kimlik DEĞERLERİ değil, filtreler ve satır sayısı
  yazılır; arama terimi de yazılmaz (vergi no / TCKN olabilir), yalnız aramanın
  uygulandığı ve uzunluğu kaydedilir (`audit_logs` purge edilmez; TCKN'leri oraya kopyalamak ikinci bir
  kalıcı kimlik deposu olurdu).
- Döküm 20.000 satırla sınırlıdır; aşılırsa dosya ilk 20.000 satırı taşır,
  `X-Export-Truncated-At` başlığı ve denetim kaydındaki `truncated` bunu bildirir
  — filtreyi daraltın (ör. yayın tarihi aralığı).
- Excel metin hücreleri formül enjeksiyonuna karşı nötrlenir (ilan başlığı ve
  açıklaması serbest kullanıcı metnidir).

## Bilinen boşluklar

1. **TCKN bireysel satıcılar için zorunlu değildir.** Bireysel TCKN yalnız
   isteğe bağlı `SellerBankAccount.tcKimlikNo` alanında vardır; girilmemişse
   kimlik numarası boş kalır ve "Kimlik numarası: yalnız eksik olanlar" filtresi
   bu satıcıları listeler. Toplama akışı eklenmedi (karar: TCKN zorunlu
   yapılmadı).
2. **Ad adres kaydından gelebilir.** Banka hesabı olmayan satıcıda ad,
   varsayılan adresin alıcı adından alınır — başka bir kişinin adı olabilir.
   Bu yüzden "Ad kaynağı" kolonu raporun parçasıdır.
3. **İlan geçmişi yoktur.** Başlık, açıklama ve fiyat düzenlemelerde üzerine
   yazılır; rapor her zaman bugünkü hâli gösterir.
4. **Yayın tarihi son onaydır, ilk yayın değil.** `Product.publishedAt` her
   admin onayında tazelenir (60 günlük yaşam süresi buradan sayılır); ilk
   yayın tarihi saklanmaz. Hiç onaylanmamış ilanda boştur (`createdAt`'e
   düşülmez; oluşturulma tarihi ayrı kolondur). Tarih aralığı filtresi
   `publishedAt`'i boş olan ilanları dışarıda bırakır.
5. **Fiyat, ilanın güncel fiyatıdır** (`Product.price`: satıcının girdiği fiyat;
   `oldPrice` indirim öncesi fiyat olarak ayrıdır). Kampanya/kupon indirimi ve
   gerçekleşen satış tutarı değildir. **Gerçekleşen satış tutarı kolonu
   eklenmedi:** bir ilan birden çok siparişe (stoklu ilan, iptal/iade edilen
   siparişler, teklifle düşen fiyat, kupon) bağlanabilir ve "satış tutarı" bu
   durumlarda tek anlamlı bir değer değildir; devletin istediği tanım
   netleşince sipariş verisinden ayrı bir kolon olarak eklenmelidir.
6. **Test hesapları kapsam dışıdır** (`isTestAccount = true`); canlı şerit
   kuralıyla (`LIVE_USER`) aynıdır.
7. Satıcı türü, **onaylı kurumsal kimlik** varlığına bakar. Başvurusu
   bekleyen / reddedilen kurumsal hesaplar "bireysel" görünür.
