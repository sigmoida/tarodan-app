# Mobil 136 Yolculuk — "Eksiksiz Çalışıyor" Yol Haritası

**Hedef:** 136 yolculuğun tamamının mobilde eksiksiz çalıştığından emin olmak.
**Tarih:** 2026-06-10

## "Çalışıyor" ne demek? (3 katman)

Bir yolculuğun mobilde çalıştığını söylemek için **üçünün birden** doğru olması gerekir:

1. **Ekran/giriş var mı?** (ürün eksikliği değilse) → eksikler: `mobile-ui-coverage.md` G-01..G-08
2. **UI davranışı doğru mu?** (form, buton, render, navigasyon) → **RNTL** kanıtlar (155 test yeşil)
3. **Mobil API'yi doğru çağırıp cevabı işliyor mu?** → **sadece gerçek-API e2e (Maestro)** kanıtlar. RNTL ve web testleri bunu KANITLAMAZ.

> Backend iş mantığı (escrow, kargo hesabı, iade kuralları, webhook) zaten **521 API e2e** ile sabit ve hem web hem mobil aynı sunucuyu kullanır. Yapılacak iş mobil tarafında **(1) eksik ekranlar + (3) wiring kanıtı**dır.

## Mevcut durum (2026-06-10 AFK koşusu sonrası)

- ✅ RNTL: **56 suite / 301 test yeşil** — kesin 136 denetimi sonrası **102 ✅ · 5 🟡 · 21 🔙 · 8 🚧** (bkz. `mobile-ui-coverage.md`)
- ✅ API e2e: 521 test (backend mantığı) — backend-only yolculuklar burada
- ❌ Wiring: **Maestro J1 FAILED-brittle** — ilk assert `"Kategoriler" görünür` bayat selector (ana ekran o metni göstermiyor); ödeme adımına ulaşılamadı. Ödeme zaten **bypass**, gerçek 3DS kanıtsız. → Aşama 0 işi.
- 🚧 8 missing-screen eksikliği kesinleşti: G-01..G-08 (`mobile-gaps-from-journey-automation.md`)

## Yol Haritası (4 faz)

### Faz 0 — Wiring güven temeli (EN KRİTİK, önce bu)
**Neden:** En riskli ve en az kanıtlanmış katman (3). Ödeme/teslim mobilde web'den ayrı kod (`react-native-webview` 3DS).

- [ ] **0.1** Maestro J1'i incele: ödeme adımı gerçek 3DS WebView mi, bypass mı? → bypass ise gerçek ödeme wiring'i HİÇ kanıtlanmamış demektir.
- [ ] **0.2** `payment/[id].tsx` WebView akışını gerçek API'ye karşı 1 kez uçtan uca koştur (test ortamı PayTR sandbox / bypass flag).
- [ ] **0.3** 3-5 **kritik happy-path** için Maestro wiring smoke ekle (per-journey DEĞİL, omurga akışlar):
  - Satın alma + ödeme + teslim onay (J1) — mevcut, ödeme adımını gerçek yap
  - Teklif ver → kabul → ödeme (J3) — **G-03 eksikliğine takılır, önce o**
  - Sepet → checkout → sipariş (J1/J25)
- **Çıktı:** "Mobil kullanıcı gerçekten ödeyebiliyor/teslim onaylayabiliyor" kanıtı.
- **Efor:** orta (Maestro kırılgan; driver mevcut).

### Faz 1 — Eksik mobil ekranlar (ürün geliştirme)
**Neden:** Bu yolculuklar mobilde **hiç başlatılamıyor** — test değil, eksik özellik.

| Öncelik | Görev | Açar | Yolculuklar |
|---|---|---|---|
| 🔴 P1 | **IBAN/banka hesabı ekranı** (G-01) | satıcı para alma akışının tamamı | J2,27,40,50,51 |
| 🔴 P1 | **Teklif siparişi ödeme entry** (G-03) | kabul edilen teklifin ödenmesi | J3,34,40,96,129 |
| 🟠 P2 | **Sepette kupon input** (G-02) | indirimli alışveriş | J22,58,135 |
| 🟠 P2 | **İlan foto akışı düzelt** (G-04) | satıcı ilan verme | J2,15,18,30,40,55 |
| 🟡 P3 | **reviews'da puan verme girişi** (G-07) | ürün puanlama UX | J31 (mantık RatingModal'da hazır) |
| 🟡 P3 | telefon format + adres ad-soyad kuralı (G-05/G-06) | profil/adres validasyon | J32,118 |
| 🟢 P4 | **checkout form testID** (G-08) | (sadece test edilebilirlik) | J1,25,65 |
- **Çıktı:** 8 eksiğin kapanması → ~8-10 yolculuk mobilde başlatılabilir hale gelir.
- **Her ekran için:** ekran + RNTL testi + (varsa) Maestro wiring. brainstorm→plan→subagent akışı.

### Faz 2 — Kalan UI kapsamı (🟡 → ✅)
**Neden:** ~22 yolculukta UI dilimi kısmen test edildi; render/buton kalanını tamamla.

- [ ] **2.1** Takas ekranları render/buton (J5,97,98,100,101,128,134 — `trade/[id]`, `trade/counter`)
- [ ] **2.2** Koleksiyon sahiplik/oluşturma (J105,106 — `collections/new`, `collections/[id]/edit`)
- [ ] **2.3** Destek/şikayet/bülten formları (J20,111,115,117 — `support`, `contact`, `newsletter`)
- [ ] **2.4** Bilgi sayfaları statik render (J126 — `about/faq/kvkk`)
- [ ] **2.5** İndirim sahiplik (J114 — `settings/discounts`)
- [ ] **2.6** Engelleme listesi (J17 — `settings`/profil)
- **Çıktı:** ~22 🟡 → ✅. RNTL, hızlı, AFK workflow ile yapılabilir.
- **Efor:** düşük-orta (harness hazır).

### Faz 3 — Süreklilik (regresyon kalkanı)
- [ ] **3.1** CI gate: `cd apps/mobile && pnpm test` PR'larda zorunlu (yeşil olmadan merge yok).
- [ ] **3.2** Maestro J1 wiring'i nightly CI'da koş (gerçek API'ye karşı).
- [ ] **3.3** `mobile-ui-coverage.md`'yi her yeni ekran/test sonrası güncel tut.

## "Eksiksiz" tanımı — gerçekçi hedef

136 yolculuğun **hepsini mobilde uçtan-uca otomatik** kanıtlamak gerçekçi değildir (admin paneli mobilde yok, çok-aktör/zaman-aşımı akışları mobil UI'a ait değil). Ulaşılabilir "eksiksiz" şudur:

- **Mobil-UI dilimi olan ~64 yolculuk** (✅+🟡): RNTL ile %100 yeşil → **Faz 1+2 ile ulaşılır**
- **Wiring omurgası** (~5 kritik akış): Maestro ile kanıtlı → **Faz 0**
- **~64 backend-only yolculuk**: API e2e'de kapsanır, mobilde ayrıca kanıt gerekmez (mobil sadece aynı API'yi çağırır; Faz 0 wiring omurgası bu çağrı mekanizmasını zaten doğrular)
- **~8 eksik ekran**: ürün olarak eklenir → **Faz 1**

## Önerilen sıra
**Faz 0 (wiring temeli) → Faz 1 P1 (IBAN + teklif ödeme) → Faz 2 (AFK RNTL batch) → Faz 1 P2-P4 → Faz 3 (CI).**

Faz 0 önce, çünkü en riskli ve diğer her şeyin üstünde durduğu katman. Faz 2 ucuz/AFK olduğu için araya serpiştirilebilir.
