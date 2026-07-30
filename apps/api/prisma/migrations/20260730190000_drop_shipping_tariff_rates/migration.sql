-- Kargo fiyatı artık yalnız paket boyutlarından (shipping_package_tiers) çözülüyor.
-- Desi satırı tablosunun son okuyucusu da kaldırıldı; iki paralel fiyat mekanizması
-- bırakmak sessiz ayrışma riski taşır.
DROP TABLE "shipping_tariff_rates";
