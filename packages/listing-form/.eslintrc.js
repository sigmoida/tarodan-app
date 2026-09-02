module.exports = {
  root: true,
  // Next yapılandırması BİLEREK: bu paketin bileşenleri iki Next uygulamasının
  // içinde çalışıyor ve `@next/next/*` kurallarına (örn. `no-img-element`
  // muafiyetleri) ihtiyaç duyuyorlar. Saf `react` config'inde o kurallar
  // tanımlı olmadığı için mevcut disable yorumları hataya dönüşüyordu.
  extends: ['@tarodan/eslint-config/next'],
};
