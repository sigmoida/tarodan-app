/**
 * Staging host'unda `/.well-known/*` dosyalarının staging karşılıkları.
 * Host'a bağlı: aynı build iki ortamda da koşuyor, env'e değil isteğe bakmak
 * en az sürprizli. Rewrite'tır (redirect DEĞİL) — Android assetlinks doğrulaması
 * yönlendirme kabul etmez. `/.well-known/**` middleware matcher'ının dışındadır
 * (noktalı yol) — locale öneki ve SITE_LOCKED kilidi bu dosyalara dokunmaz.
 */
const STAGING_HOST = 'staging.tarodan.com.tr';

const wellKnownStagingRewrites = [
  {
    // Staging iOS'ta hiçbir uygulamayı sahiplenmez. Prod uygulaması
    // (`com.tarodan.app`) `applinks:staging.tarodan.com.tr` taşıyor;
    // staging de aynı AASA'yı yayınlayınca staging maillerindeki
    // doğrulama/şifre sıfırlama linkleri PROD uygulamasında açılıyor ve
    // staging token'ı prod API'ye gidip düşüyordu. Boş `details` ile bu
    // linkler Safari'de, staging web'inde açılır.
    source: '/.well-known/apple-app-site-association',
    has: [{ type: 'host', value: STAGING_HOST }],
    destination: '/.well-known/apple-app-site-association-staging.json',
  },
  {
    // Android karşılığı: staging uygulaması `com.tarodan.app.staging`
    // paketiyle kendi imzalarını taşır; prod dosyası staging host'ta
    // doğrulamayı geçemez.
    source: '/.well-known/assetlinks.json',
    has: [{ type: 'host', value: STAGING_HOST }],
    destination: '/.well-known/assetlinks-staging.json',
  },
];

module.exports = { wellKnownStagingRewrites };
