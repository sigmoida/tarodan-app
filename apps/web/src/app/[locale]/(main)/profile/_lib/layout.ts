/**
 * Profil alanının dikey ölçüleri — TEK kaynak.
 *
 * Ekranı dolduran iki panel var: soldaki yapışkan hesap navigasyonu ve sağdaki
 * tam boy sayfalar (mesajlaşma gibi). İkisi de "başlığın altından ekranın altına
 * kadar" yüksekliğini kendi hesaplıyordu ve hesaplar birbirinden ayrılmıştı —
 * `100vh-6rem` ile `100vh-8rem`; altları 32px kaymış hizalanıyordu.
 *
 * Hesap: yapışkan başlık 64px (`lg:h-16`) + ana kolonun üst boşluğu 16px
 * (`py-4`) = 80px üstten; altta da aynı 16px nefes payı → `100vh - 6rem`.
 * `PROFILE_STICKY_TOP` da bu 80px'in karşılığıdır, birlikte değişmeleri gerekir.
 *
 * Sınıf adları TAM metin olarak yazılmalı: Tailwind kaynak dosyaları düz metin
 * tarar, parçalardan birleştirilen bir sınıf üretilmez.
 */

/** Yapışkan kenar çubuğunun ekran üstünden uzaklığı. */
export const PROFILE_STICKY_TOP = "lg:top-20";

/** Kenar çubuğu: içerik kısaysa kısalır, uzunsa bu sınırda kendi içinde kayar. */
export const PROFILE_PANE_MAX_HEIGHT = "lg:max-h-[calc(100vh-6rem)]";

/** Tam boy sayfa panelleri: her zaman kullanılabilir yüksekliğin tamamı. */
export const PROFILE_PANE_HEIGHT = "h-[calc(100vh-6rem)]";
