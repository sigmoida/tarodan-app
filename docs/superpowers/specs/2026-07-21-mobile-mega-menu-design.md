# Mobil mega-menü panelleri (Kategoriler + Ölçek) — tasarım

## Sorun
Header kategori çubuğundaki iki mega-menü (`Kategoriler` = araç tipleri + üretici
grupları; `Ölçek` = ölçek listesi) `NavigationMenuContent` ile `absolute left-0
top-full w-full` render ediliyor. Mobilde `w-full`, yatay kaydırılan listenin
genişliğine (~850px) çözülüyor ve içerik `grid-cols-2`; ayrıca PR #396'daki
`overflow-x-auto` kaydırma container'ı paneli kırpıyor. Sonuç: mobilde bu iki
panel ekran dışına taşıyor, kullanılamıyor. (Diğer 6 kategori-çubuğu öğesi
doğrudan link, mobilde erişilebilir; hesap menüsü zaten çalışıyor.)

## Kapsam
Sadece bu iki paneli mobil-uyumlu yapmak. Masaüstü (md+) **hiç değişmez**.
Kategori çubuğunun yatay-kayan hali (PR #396) korunur.

## Yaklaşım (A)
Radix `NavigationMenu`/`NavigationMenuContent` ve tek-kaynak `CategoriesPanel`/
`ScalesPanel` içeriği korunur; sadece mobilde **konum + düzen** responsive olur.

- **Konum:** Panel mobilde `fixed` (full-bleed `left-0 right-0`), kaydırma
  container'ından kaçar. Header `sticky top-0` olduğu için kategori-barı alt
  kenarı viewport'ta sabit → panel `top` değeri sabit bir offset olarak
  verilebilir. Kesin offset implementasyonda ölçülür (ana bar h-14=56px +
  kategori barı ≈48px; olası `PlatformFeeAnnouncementBanner` varsa hesaba
  katılır). md+ eski `absolute left-0 top-full` davranışına döner.
- **Düzen:** `CategoriesPanel` `grid-cols-2 → grid-cols-1 md:grid-cols-2`;
  paneller `max-h-[70vh] overflow-y-auto` ile uzun içerikte dikey kayar.
- **Kapanma:** dışarı/link/başka öğe → radix default.

Alternatif (gerekirse): radix `NavigationMenuViewport` ile panel listenin dışında
tek yerde render edilir. Ama bu masaüstü davranışını da değiştirdiğinden yalnızca
`fixed` yaklaşımı temiz çalışmazsa başvurulur.

## Kabul kriterleri (Playwright, 375px)
- Kategoriler ve Ölçek açıldığında: sayfa overflow = 0; panel viewport içinde tam
  görünür (sağ kenar ≤ 375, sol ≥ 0); içerik tek kolon.
- Masaüstü (1440px): panel eski haliyle açılır, overflow 0, düzen değişmemiş.
- typecheck + lint + build yeşil.

## Değişecek dosyalar
- `src/components/layout/header/CategoryNav.tsx` — `NavigationMenuContent`
  className'leri (responsive konum).
- `src/components/layout/header/nav/CategoriesPanel.tsx` — `grid-cols-1 md:grid-cols-2`.
- `src/components/layout/header/nav/NavPanel.tsx` — mobilde `max-h`/scroll (ortak kabuk).

Aynı branch: `fix/mobile-web-layout` (PR #396).
