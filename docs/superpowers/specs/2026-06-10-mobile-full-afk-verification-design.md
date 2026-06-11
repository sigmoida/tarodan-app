# Mobil Tam AFK Doğrulama — Tasarım

**Tarih:** 2026-06-10
**Durum:** Onaylandı (tasarım), implementation plan bekliyor
**Amaç:** 136 yolculuğun mobil durumunu *en kesin* şekilde, *AFK* olarak doğrulamak: var olan her test-edilebilir UI dilimini RNTL ile yeşile boyamak, 136'yı kanıta dayalı sınıflandırmak, eksik ekranları garantili-tam envanterlemek ve ödeme/teslim wiring omurgasını Maestro ile denemek. **Eksik ekranlar İNŞA EDİLMEZ — raporlanır.**

## Kapsam kararları (kullanıcı onaylı)

- **Kapsam:** Test + kesin denetim. Eksik ekranlar (IBAN, kupon input, teklif ödeme entry vb.) **inşa edilmez**, raporlanır.
- **RNTL derinliği:** Yolculuk-ilgili ekranlar + mevcut ~22 kısmi (🟡) kapsamı tama (✅) çevir. Yolculukla ilgisiz statik/yasal sayfalar zorunlu değil.
- **Wiring:** Maestro J1 omurga akışı AFK'da denenir (ayrı, izlenen job). Simülatör takılırsa diğer aşamalar etkilenmez; kullanıcı simülatöre **dokunmaz** (dokunmak koşumu bozuyor).
- **Yaklaşım:** B — aşamalı workflow'lar; denetim (foundation) implement'ten önce tamlık kapısından geçer.

## Başlangıç durumu

- RNTL: 28 suite / 155 test yeşil (`cd apps/mobile && npx jest --forceExit`)
- API e2e: 521 test (backend mantığı) — ~64 backend-only yolculuk burada kapsanır
- Wiring: yalnız Maestro J1 mevcut; ödeme adımı muhtemelen `EXPO_PUBLIC_MAESTRO` bypass
- Bilinen eksikler: G-01..G-08 (`mobile-ui-coverage.md`) — ama **sistematik-tam değil**

## Mimari — 4 Aşama

### Aşama 1 — Kesin 136 Denetimi (foundation)

**Sorun:** Önceki tek-ajan catalog'u boş döndü. Çözüm: çok-ajan + zorunlu şema.

- **6 denetçi ajan**, her biri ~23 yolculuk. Her ajan kendi yolculuklarının ilgili `app/` ekranlarını **gerçekten açıp okur** (Explore agent), tahmin etmez.
- **Zorunlu şema, yolculuk başına bir satır:**
  - `journey` (J1..J136)
  - `title` (kısa başlık)
  - `screenExists` (bool + ekran yolu)
  - `flowCompletable` (akış mobilde uçtan uca tamamlanabilir mi — eksik giriş/buton var mı)
  - `classification` (`testable-ui` ✅ / `mixed` 🟡 / `backend-only` 🔙 / `missing-screen` 🚧)
  - `uiSliceToTest` (RNTL ile test edilebilir somut dilim; ✅/🟡 için dolu)
  - `gap` (eksik ekran/giriş; G-kodu adayı)
  - `existingTest` (zaten test dosyası var mı)
- **Tamlık kapısı (kontrolör):** 6 ajan dönünce 136 satırın eksiksizliği doğrulanır; eksik J-aralığı yeniden koşulur.
- **Çıktı:** (a) kesin eksik-ekran envanteri (G-01..G-N), (b) RNTL iş-listesi (Aşama 2 girdisi), (c) ham JSON saklanır.

### Aşama 2 — RNTL Implement (🟡→✅ + yeni ✅)

- Aşama 1'in `uiSliceToTest` dolu yolculukları **domain'lere** gruplanır (geçen batch'in dokunmadığı alanlar: takas, koleksiyon oluştur/düzenle, destek/bülten/iletişim, indirim, engelleme, sipariş/iade aksiyon butonları, kalan profil/ayar ekranları).
- **Domain başına 1 ajan** (parallel/pipeline), kanıtlanmış kurallar:
  - Yalnız **yeni** test dosyası (`__tests__/`), co-located, `JNN ·` etiketli describe.
  - `services/api` + `expo-router` inline `jest.mock` (login.test.tsx kalıbı; require() formu).
  - **Paylaşılan dosyalara dokunma** (jest.setup.ts, src/test-utils/*, ekran kaynakları). Gerekli testID yoksa → metin/role ile sorgula; mümkün değilse `missing-testID` raporla, kaynağı düzenleme.
  - Doğrulama: `cd apps/mobile && npx jest <dosyalar> --forceExit` → yeşile kadar.
- **🟡→✅:** Mevcut 🟡 yolculuğun eksik kalan UI dilimini yeni dosyada ekle; backend kalanı `backendOnly` raporla.
- **Dürüstlük sınırı:** 🚧/🔙 için **sahte test yazılmaz**; sınıf korunur, indekste işaretlenir.
- **Tamlık kapısı (kontrolör):** Implement bitince tüm suite (`npx jest --forceExit`) koşulur; kırmızı suite varsa ilgili ajan yeniden koşulur (tekrar kırmızı → `BLOCKED`, diğerleri etkilenmez).

### Aşama 3 — Maestro J1 Wiring Denemesi (ayrı, izlenen)

- Aşama 1+2 bittikten **sonra**, ayrı izlenen bash job: mevcut `run-journey-1.sh`.
- **Önkoşul kontrolü:** API ayakta + simülatör booted değilse → `BLOCKED: önkoşul yok`, boşa koşmaz.
- **Ödeme adımı netleştirme:** J1 ödeme adımı gerçek 3DS WebView mi yoksa `EXPO_PUBLIC_MAESTRO` bypass mı tespit edilir; bypass ise raporda açıkça "gerçek 3DS kanıtlanmadı" denir.
- **Kırılganlık kuralı:** Çıktı izlenir; ilerleme yoksa `STALLED`, diğer aşamaları etkilemez. Kullanıcı simülatöre dokunmaz.
- **Çıktı:** wiring sonucu (PASSED / STALLED / BLOCKED / bypass-only) yol haritasına işlenir.

### Aşama 4 — Sentez, Çıktılar, Hata Yönetimi

**Sentez (kontrolör):**
- `mobile-ui-coverage.md` → kanıta dayalı kesin 136 satır + test dosyaları + G-kodları.
- `mobile-136-journey-roadmap.md` → gerçek eksik sayısı, Maestro sonucu, kalan iş.
- `mobile-gaps-from-journey-automation.md` → garantili-tam G-01..G-N envanteri (etkilenen yolculuklarla).
- Tek özet tablo: ✅/🟡/🔙/🚧 sayıları, yeni test sayısı, suite/test toplamı, Maestro durumu.

**Çıktı artefaktları:**
1. Yeşil RNTL suite (155 + yeni)
2. Kesin 136 kapsama tablosu
3. Garantili-tam eksik-ekran envanteri
4. Maestro wiring sonucu
5. Tek commit (test + doc)

**Hata yönetimi (AFK dayanıklılığı):**
- Denetim eksikse → tamlık kapısı yakalar, eksik J-aralığı yeniden koşulur.
- Implement ajanı kırmızı bırakırsa → tüm-suite kapısı yakalar, ajan yeniden koşulur (tekrar kırmızı → domain `BLOCKED`).
- Maestro takılırsa → `STALLED`, Aşama 1+2 sağlam kalır, sabaha bırakılır.
- Çakışma → ajanlar yalnız yeni dosya yazar, paylaşılan config'e dokunmaz.

## "Tamamlandı" tanımı (bu AFK koşusu)

> Mobil-UI dilimi olan her yolculuk RNTL'de ✅ · 136'nın tamamı kanıta dayalı sınıflandırılmış · eksik ekranlar garantili-tam envanterlenmiş · wiring omurgası ya kanıtlı ya da net "neden değil" notlu.

## Kapsam dışı

- **Eksik ekran/özellik inşası** (IBAN ekranı, kupon input, teklif ödeme entry, foto akışı) — ayrı ürün işi; bu koşuda yalnız raporlanır.
- **Backend iş kuralı testi** — API e2e'de (521 test); RNTL mock'lar, test etmez.
- **Yolculukla ilgisiz statik/yasal sayfalar** için zorunlu test.
- **Per-journey Maestro** — yalnız J1 omurga; yeni Maestro flow yazılmaz.

## Bileşenler ve sınırlar

| Birim | Görev | Bağımlılık |
|---|---|---|
| Denetçi ajanlar (Aşama 1) | 136 kanıta dayalı sınıflandırma | Explore agent, app/ kaynak |
| Implement ajanlar (Aşama 2) | RNTL test yaz + jest yeşil | test-utils, mock'lu api/router |
| Maestro job (Aşama 3) | wiring smoke | gerçek API + simülatör |
| Kontrolör (ben) | tamlık kapıları + sentez + commit | git, jest, doküman |

## Riskler

- **Maestro AFK boşa geçebilir** (simülatör kırılgan) — kabul edildi; izole edildi, Aşama 1+2'yi etkilemez.
- **Bazı ekranlar testID'siz** — kaynak düzenlenmez; `missing-testID` raporlanır, ilgili dilim 🚧/kısmi kalır.
- **Token maliyeti yüksek** — kullanıcı "ne kadar uzun sürerse" dedi, AFK için kabul.
