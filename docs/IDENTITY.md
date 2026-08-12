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
  olur; kullanıcı adı satırda kalır (yeniden dağıtılmaz).

## 5. Yeni bir yüzey eklerken

1. Prisma seçimine `PUBLIC_IDENTITY_SELECT` (kart) ya da `PUBLIC_NAME_SELECT`
   (yalnız ad) koy — elle `displayName: true` yazma.
2. Yanıtı `toPublicIdentity(row)` ya da `publicIdentityFields(row)` ile üret.
3. Ad bir bildirim/e-posta metnine giriyorsa `publicName(user)` kullan: aynı
   değer çoğu şablonda hem alıcıya hem karşı tarafa gösterilir.
4. Web tarafında `publicNameOf(user)` ile bas (`apps/web/src/lib/public-name.ts`).
