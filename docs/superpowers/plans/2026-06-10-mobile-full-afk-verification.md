# Mobil Tam AFK Doğrulama — Uygulama Planı

> **For agentic workers:** Bu plan **kontrolör (ana döngü)** tarafından yürütülür; her aşama bir `Workflow` çağrısı + aralarda kontrolör tamlık kapısıdır. Klasik subagent-per-task değil. Adımlar checkbox (`- [ ]`).

**Goal:** 136 yolculuğun mobil durumunu AFK olarak kanıta dayalı doğrulamak: 🟡→✅ RNTL testleri, kesin 136 sınıflandırması, garantili-tam eksik-ekran envanteri, Maestro J1 wiring denemesi.

**Architecture:** 3 ardışık Workflow (Denetim → Implement → Sentez-hazırlık) + 1 ayrı izlenen Maestro bash job. Kontrolör her workflow sonrası tamlık kapısı uygular (eksikse ilgili kısmı yeniden koşar).

**Tech Stack:** Workflow (çok-ajan orkestrasyon), Explore agent, jest-expo + RNTL@13, Maestro, git.

**Önkoşul durumu:** `cd apps/mobile && npx jest --forceExit` → 28 suite / 155 test yeşil. Harness: `apps/mobile/src/test-utils/` (renderWithProviders, fixtures, router-mock). Kanıtlanmış test kalıbı: `apps/mobile/app/(auth)/__tests__/login.test.tsx`.

---

## Dosya yapısı (oluşturulacak/değişecek)

| Yol | Sorumluluk | Aşama |
|---|---|---|
| `apps/mobile/**/__tests__/*.test.tsx` | yeni RNTL testleri (co-located, yalnız yeni dosya) | 2 |
| `docs/superpowers/specs/mobile-ui-coverage.md` | kesin 136 kapsama tablosu | 1,4 |
| `docs/superpowers/specs/mobile-gaps-from-journey-automation.md` | garantili-tam G-01..G-N envanteri | 4 |
| `docs/superpowers/specs/mobile-136-journey-roadmap.md` | güncel yol haritası + Maestro sonucu | 4 |
| `apps/mobile/maestro/.afk-j1.log` | Maestro job çıktısı (geçici, commit edilmez) | 3 |

**Kontrolör kuralı (her workflow için):** Script'i inline gönderme yerine dosyaya yazıp `scriptPath` ile çağırma seçeneği var; ama bu planda inline gönderilir, dönüş `runId` ile resume edilebilir.

---

## Task 1: Aşama 1 — Kesin 136 Denetimi (Workflow)

**Files:**
- Create (geçici): workflow journal (otomatik)
- Read sonrası: 136 satır JSON kontrolöre döner

**Amaç:** 6 Explore ajanı, her biri ~23 yolculuk, ekranları gerçekten açarak şemalı sınıflandırma. Tek-ajan boş dönüşünü çok-ajan + zorunlu şema ile önle.

- [ ] **Step 1: Denetim workflow'unu başlat**

`Workflow` çağrısı, script (inline):

```javascript
export const meta = {
  name: 'tarodan-mobile-136-audit',
  description: '136 yolculuğun kanıta dayalı mobil sınıflandırması (6 Explore ajanı, şemalı)',
  phases: [{ title: 'Audit', detail: '6 ajan × ~23 yolculuk, ekranları açarak' }],
}
const MOBILE = '/Users/gorkemsubas/Desktop/projeler/tarodan/tarodan-app/apps/mobile'
const ROW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['rows'],
  properties: { rows: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['journey','title','screenExists','flowCompletable','classification','uiSliceToTest','gap','existingTest'],
    properties: {
      journey: { type: 'string' },
      title: { type: 'string' },
      screenExists: { type: 'string', description: 'ekran yolu veya YOK' },
      flowCompletable: { type: 'string', enum: ['evet','kısmi','hayır'] },
      classification: { type: 'string', enum: ['testable-ui','mixed','backend-only','missing-screen'] },
      uiSliceToTest: { type: 'string', description: 'RNTL ile test edilebilir somut dilim veya -' },
      gap: { type: 'string', description: 'eksik ekran/giriş veya -' },
      existingTest: { type: 'string', description: 'mevcut test dosyası veya -' },
    },
  } } },
}
phase('Audit')
const CHUNKS = [[1,23],[24,46],[47,69],[70,92],[93,114],[115,136]]
const COMMON = `Tarodan mobil app: ${MOBILE} (Expo, expo-router, zustand src/stores, react-query). 
GÖREV: Sana verilen yolculuk aralığının HER yolculuğunu mobil-UI açısından sınıflandır. İlgili app/ ekran(lar)ını GERÇEKTEN AÇ ve oku (tahmin etme). 
classification: testable-ui (RNTL ile anlamlı UI dilimi var) / mixed (kısmen) / backend-only (escrow/zaman-aşımı/webhook/admin/çok-aktör — UI dilimi yok) / missing-screen (UI olurdu ama ekran/giriş yok). 
flowCompletable: akış mobilde uçtan uca tamamlanabilir mi. uiSliceToTest: somut test edilebilir dilim (form/buton/render/nav) ya da '-'. gap: eksik ekran/giriş ya da '-'. existingTest: ilgili __tests__/ dosyası ya da '-'. 
Bilinen eksikler: IBAN ekranı YOK, sepet kupon input YOK, teklif ödeme entry YOK, admin paneli YOK, ilan foto zorunlu. 
Mevcut testler: app/(auth)/__tests__, app/__tests__/{cart,favorites,following}, app/checkout/__tests__, app/offers/__tests__, app/orders/__tests__, app/messages/__tests__, app/(tabs)/__tests__/{search,notifications}, app/membership/__tests__, app/settings/__tests__/{security,addresses,edit-profile,subscription}, src/stores/__tests__/{cartStore,favoritesStore,subscriptionStore}, src/components/__tests__/RatingModal, src/components/product/__tests__/MakeOfferModal, src/utils/__tests__/validation.
136 yolculuğun tema haritası AŞAMA-1 spec'inde; başlığı bilmiyorsan ekrandan/temadan türet.`
const JTITLES = ${JSON.stringify('GÖMÜLECEK')} // kontrolör: aşağıdaki başlık listesini buraya göm
const results = await parallel(CHUNKS.map(([a,b]) => () =>
  agent(`${COMMON}\n\nSENİN ARALIĞIN: J${'$'}{a}..J${'$'}{b}. Bu aralıktaki HER yolculuk için bir satır döndür, ATLAMA.`,
    { label: `audit:J${'$'}{a}-${'$'}{b}`, phase: 'Audit', schema: ROW_SCHEMA, agentType: 'Explore' })
)).then(r => r.filter(Boolean))
return { results }
```

Not: `JTITLES` gömme yerine, her ajan prompt'una kendi aralığının başlıklarını kontrolör doğrudan yazar (PDF'teki Yolculuk başlıkları). Başlık metni kritik değilse ajan ekrandan türetir.

- [ ] **Step 2: Tamlık kapısı — 136 satır eksiksiz mi**

Workflow dönünce kontrolör tüm `results[].rows`'u birleştirir, `journey` alanlarını J1..J136 ile karşılaştırır.

Run (kontrolör, dönen JSON üzerinde):
```bash
# beklenen: 136 benzersiz journey, eksik yok
```
Expected: 136 benzersiz J. Eksik J-aralığı varsa → o aralık için tek `agent()` yeniden koşulur (aynı şema), sonuç birleştirilir.

- [ ] **Step 3: Türev listeler**

Kontrolör birleşik satırlardan iki liste çıkarır:
- `gapInventory` = `rows.filter(r => r.classification==='missing-screen' || r.gap!=='-')` → G-envanteri
- `rntlWorklist` = `rows.filter(r => (r.classification==='testable-ui'||r.classification==='mixed') && r.uiSliceToTest!=='-' && r.existingTest==='-')` → Aşama 2 girdisi (henüz testi olmayan, test-edilebilir dilimler)

Çıktı bellekte tutulur (Aşama 2 + 4 kullanır). Bu noktada commit YOK (sentez Aşama 4'te).

---

## Task 2: Aşama 2 — RNTL Implement (Workflow)

**Files:**
- Create: `apps/mobile/**/__tests__/<domain>.test.tsx` (yalnız yeni dosyalar)

**Amaç:** Aşama 1 `rntlWorklist`'ini domain'lere gruplayıp her domain için RNTL testleri yazmak, jest yeşil. 🟡→✅ ve yeni ✅.

- [ ] **Step 1: Domain gruplama (kontrolör)**

Kontrolör `rntlWorklist`'i ekran-yakınlığına göre domain'lere böler. Sabit aday domain'ler (Aşama 1 boşları doldurur):
`trade` (trade/[id], trade/counter, trade/new), `collections` (collections/new, [id]/edit, [id]/add-items), `support` (support, contact, help), `newsletter` (newsletter/index, unsubscribe), `discounts` (settings/discounts), `block-follow` (settings + profile engelleme), `orders-actions` (orders/[id] kalan aksiyon butonları), `seller` (seller/dashboard, settings/my-listings), `profile-rest` (settings kalan ekranlar), `catalog-rest` (brands, models, category, ureticiler).

- [ ] **Step 2: Implement workflow'unu başlat**

`Workflow` çağrısı (inline), domain başına 1 ajan, kanıtlanmış kurallar:

```javascript
export const meta = {
  name: 'tarodan-mobile-rntl-stage2',
  description: 'RNTL implement — domain başına test (yeni dosya, jest yeşil)',
  phases: [{ title: 'Implement', detail: 'domain başına RNTL test + jest yeşil' }],
}
const MOBILE = '/Users/gorkemsubas/Desktop/projeler/tarodan/tarodan-app/apps/mobile'
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['domain','filesCreated','testsAdded','jestPassed','journeysCovered','backendOnly','missingScreens','notes'],
  properties: {
    domain: { type: 'string' }, filesCreated: { type: 'array', items: { type: 'string' } },
    testsAdded: { type: 'number' }, jestPassed: { type: 'boolean' },
    journeysCovered: { type: 'array', items: { type: 'string' } },
    backendOnly: { type: 'array', items: { type: 'string' } },
    missingScreens: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}
const RULES = `KURALLAR (KESİN):
- Kalıbı ${MOBILE}/app/(auth)/__tests__/login.test.tsx'ten öğren. renderWithProviders'ı en yakın mevcut testin yolundan import et (src/test-utils).
- services/api + expo-router'ı test dosyası İÇİNDE inline jest.mock ile mock'la (require() formu).
- SADECE yeni dosya oluştur (co-located __tests__/). PAYLAŞILAN dosyalara DOKUNMA: jest.setup.ts, jest.config.js, src/test-utils/*, ekran/store kaynakları.
- testID yoksa metin/role ile sorgula; mümkün değilse o adımı missingScreens'e 'missing-testID: ...' yaz, kaynağı DÜZENLEME.
- describe('JNN · ...') etiketle. Yalnız mobil-UI: form validasyon, buton enable/disable, render, navigasyon wiring, boş/hata durumu. Backend mantığı TEST ETME → backendOnly'e yaz.
- Ekran tamamen yoksa testsAdded=0 + missingScreens doldur. SAHTE TEST YAZMA.
Doğrulama: cd ${MOBILE} && npx jest <dosyaların> --forceExit --silent → ÇIKTIYI gör, YEŞİL olana kadar düzelt. 'worker force exited' zararsız.`
const DOMAINS = args  // kontrolör Aşama 1'den türettiği domain dizisini args ile geçer: [{label, screens, journeys, sliceNote}]
const results = await parallel(DOMAINS.map(d => () =>
  agent(`${RULES}\n\nDOMAIN: ${'$'}{d.label}. Ekranlar: ${'$'}{d.screens}. Yolculuklar: ${'$'}{d.journeys}. Test edilecek dilimler: ${'$'}{d.sliceNote}\nADIM: (1) ekran(lar)ı OKU. (2) RNTL testleri yaz. (3) jest yeşil. (4) backend-only/missing-screen dürüst raporla.`,
    { label: `impl:${'$'}{d.label}`, phase: 'Implement', schema: SCHEMA })
)).then(r => r.filter(Boolean))
return { results }
```

`args` olarak Aşama 1'den türetilen domain dizisi geçilir: `[{label, screens, journeys, sliceNote}, ...]`.

- [ ] **Step 3: Tamlık kapısı — tüm suite yeşil**

Run:
```bash
cd /Users/gorkemsubas/Desktop/projeler/tarodan/tarodan-app/apps/mobile && npx jest --forceExit 2>&1 | tail -8
```
Expected: `Test Suites: N passed, N total` / `Tests: M passed, M total` (kırmızı yok).

Kırmızı suite varsa → kontrolör ilgili domain ajanını `Agent` ile yeniden koşar (dosya yolu + hata çıktısı vererek). Tekrar kırmızıysa o domain `BLOCKED` notuyla kayda geçer, diğerleri etkilenmez.

- [ ] **Step 4: Ara doğrulama — kaynak dokunulmamış mı**

Run:
```bash
cd /Users/gorkemsubas/Desktop/projeler/tarodan/tarodan-app && git status --short | grep -vE "__tests__|\.md$" || echo "TEMIZ: yalnız test+doc"
```
Expected: `TEMIZ` veya yalnız beklenen testID eklemeleri. Beklenmedik kaynak değişikliği varsa kontrolör inceler (ajan kural ihlali → geri al).

---

## Task 3: Aşama 3 — Maestro J1 Wiring (izlenen bash job)

**Files:**
- Create (geçici): `apps/mobile/maestro/.afk-j1.log`

**Amaç:** Gerçek-API wiring omurgasını dene; ödeme adımının bypass mı 3DS mi olduğunu netleştir. Kırılgan, izole.

- [ ] **Step 1: Ödeme adımı bypass mı 3DS mi tespit et**

Run:
```bash
cd /Users/gorkemsubas/Desktop/projeler/tarodan/tarodan-app/apps/mobile && grep -rn "MAESTRO\|bypass\|processBypass\|3DS\|WebView" maestro/journeys/run-journey-1.sh maestro/flows/ app/payment/\[id\].tsx 2>/dev/null | head -20
```
Expected: J1'in ödeme adımının bypass mı (test flag) yoksa gerçek WebView mi sürdüğü görünür. Sonuç sentez raporuna yazılır.

- [ ] **Step 2: Önkoşul kontrolü**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null; echo " <- API"; xcrun simctl list devices booted 2>/dev/null | grep -c Booted
```
Expected: API `200` ve en az 1 `Booted` simülatör. İkisinden biri yoksa → bu task `BLOCKED: önkoşul yok` işaretlenir, ATLA (Aşama 1+2 etkilenmez), sentezde belirtilir.

- [ ] **Step 3: Maestro J1'i izlenen modda koştur**

Run (background, izlenen):
```bash
cd /Users/gorkemsubas/Desktop/projeler/tarodan/tarodan-app/apps/mobile && bash maestro/journeys/run-journey-1.sh > maestro/.afk-j1.log 2>&1
```
İzleme: çıktı dosyası periyodik kontrol edilir. Belirli süre (örn. 5 dk) ilerleme yoksa → `STALLED` işaretle, job'ı durdur, sentezde belirt. Kullanıcı simülatöre DOKUNMAZ.

Expected sonuçlar (biri): `PASSED` (flow tamamlandı) / `STALLED` (takıldı) / `BLOCKED` (önkoşul) / `bypass-only` (geçti ama ödeme bypass'lı).

- [ ] **Step 4: Sonucu kaydet**

Maestro sonucu (PASSED/STALLED/BLOCKED/bypass-only) + ödeme-adımı tespiti, Aşama 4 sentezine girdi olarak tutulur. `.afk-j1.log` commit edilmez (gitignore veya silinir).

---

## Task 4: Aşama 4 — Sentez, Çıktılar, Commit (kontrolör)

**Files:**
- Modify: `docs/superpowers/specs/mobile-ui-coverage.md`
- Modify: `docs/superpowers/specs/mobile-gaps-from-journey-automation.md`
- Modify: `docs/superpowers/specs/mobile-136-journey-roadmap.md`

- [ ] **Step 1: mobile-ui-coverage.md — kesin 136 satır**

Aşama 1 birleşik satırları + Aşama 2 yeni testleri ile 136 satırlık tabloyu kanıta dayalı yeniden yaz. Her satır: `J | başlık | sınıf(✅/🟡/🔙/🚧) | test dosyası veya - | not`. Üstte güncel suite/test sayısı.

- [ ] **Step 2: gaps envanteri — garantili tam**

`mobile-gaps-from-journey-automation.md`'i Aşama 1 `gapInventory` ile güncelle: G-01..G-N, her birinin etkilediği yolculuklar + açıklama. (Önceki G-01..G-08 üstüne kesin liste.)

- [ ] **Step 3: roadmap güncelle**

`mobile-136-journey-roadmap.md`'e: gerçek eksik sayısı, Maestro wiring sonucu (Task 3), kalan iş (Faz 1 ürün inşası kapsamı netleşmiş haliyle).

- [ ] **Step 4: Özet tablo + tüm suite son teyit**

Run:
```bash
cd /Users/gorkemsubas/Desktop/projeler/tarodan/tarodan-app/apps/mobile && npx jest --forceExit 2>&1 | tail -5
```
Expected: tüm suite yeşil. Özet: ✅/🟡/🔙/🚧 sayıları, yeni test sayısı, suite/test toplamı, Maestro durumu — coverage doc'un başına.

- [ ] **Step 5: Tek commit**

Run:
```bash
cd /Users/gorkemsubas/Desktop/projeler/tarodan/tarodan-app && git add apps/mobile/**/__tests__ docs/superpowers/specs/mobile-ui-coverage.md docs/superpowers/specs/mobile-gaps-from-journey-automation.md docs/superpowers/specs/mobile-136-journey-roadmap.md && git commit -m "test(mobile): tam AFK doğrulama — kesin 136 sınıflandırma + RNTL 🟡→✅ + wiring denemesi

- Aşama 1: 6-ajan kanıta dayalı 136 denetimi
- Aşama 2: RNTL implement (yeni domain'ler, 🟡→✅), tüm suite yeşil
- Aşama 3: Maestro J1 wiring sonucu (rapora işlendi)
- garantili-tam eksik-ekran envanteri (G-01..G-N)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Expected: tek commit, test + 3 doc.

---

## Kontrolör akış sırası

```
Task 1 (Workflow: denetim) → tamlık kapısı (136 tam mı)
  → Task 2 (Workflow: implement, args=domain'ler) → tüm-suite kapısı (yeşil mi) + kaynak-temiz kapısı
    → Task 3 (Maestro bash job, izlenen, izole — BLOCKED/STALLED Aşama 4'ü engellemez)
      → Task 4 (sentez + commit)
```

Her kapı kontrolör tarafından uygulanır; başarısızlıkta yalnız ilgili kısım yeniden koşulur, bütün AFK koşusu durmaz.
