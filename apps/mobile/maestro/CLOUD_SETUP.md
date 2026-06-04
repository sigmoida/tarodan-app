# Maestro Cloud Setup

Mobile UI flow'larının her PR'da otomatik olarak gerçek iOS simulatöründe koşması için aşağıdaki üç adım yapılır. Tek seferlik kurulum, sonrasında kendiliğinden çalışır.

## Şu anki durum

`.github/workflows/maestro-cloud.yml` workflow dosyası repo'da hazır. `MAESTRO_CLOUD_API_KEY` secret eklenmediği sürece guard step ile no-op olarak biter (fail değil — sadece "secret yok" notice mesajı). Yani **bu kurulumu yapmadan kötü bir şey olmaz**, ileride istendiğinde devreye alınır.

## Adım 1 — Maestro Cloud hesabı + API key

1. https://cloud.mobile.dev adresine git, hesap aç (GitHub ile bağlanabilir).
2. Dashboard'da bir proje oluştur (ör: "tarodan-mobile").
3. Settings > API Keys > yeni anahtar üret. Tek seferlik gösterilir, kopyala.

**Maliyet:** ücretsiz tier 100 koşum/ay sunar (yazıldığı tarihte). Smoke + Sprint 1 (auth) toplamı ~5-6 flow × 1 koşum/PR varsayımıyla ~30 PR/ay'a yeter. Aşılırsa ücretli plan ($49/ay).

## Adım 2 — GitHub repo secret ekle

1. https://github.com/sigmoida/tarodan-app/settings/secrets/actions adresine git (admin gerek).
2. **New repository secret** > Name: `MAESTRO_CLOUD_API_KEY`, Value: kopyaladığın anahtar.
3. Save.

Eklediğin an workflow guard step'i `skip=false` der ve gerçek koşum tetiklenir.

## Adım 3 — `.app` artefact build pipeline'ı

Workflow'un cloud'a yüklediği `apps/mobile/build/Tarodan.app` dosyası şu an **mevcut değil** — bu son adım eksik. İki seçenek:

### Seçenek A: EAS Build (önerilen, Expo'nun kendi servisi)

Expo Application Services ile development build oluşturulur:

```bash
cd apps/mobile
npx eas build --profile development --platform ios --local --output build/Tarodan.app
```

CI'da otomatik yapılması için `.github/workflows/maestro-cloud.yml`'a `Build .app` adımı eklenir:

```yaml
      - name: Install Expo CLI
        if: steps.guard.outputs.skip == 'false'
        run: npm i -g eas-cli

      - name: Build .app for simulator
        if: steps.guard.outputs.skip == 'false'
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
        run: |
          cd apps/mobile
          eas build --profile development --platform ios --local --output build/Tarodan.app --non-interactive
```

Bu adım `EXPO_TOKEN` secret'ı da gerektirir (Expo dashboard'dan alınır).

**Süre/maliyet uyarısı:** EAS Build local mode bile macOS runner gerektirir (`runs-on: macos-latest`); Linux runner'da çalışmaz. macOS runner GitHub Actions'ta dakika başına ~10x pahalıdır. Bir build ~10-15 dakika.

### Seçenek B: Tek seferlik manuel build + artifact upload

Geliştirici ortamında bir kez `eas build --local` ile `.app` üret, S3 / GitHub Releases'a koy, workflow buradan indirsin. Daha az otomatik ama daha ucuz.

## Adım 4 — flow seçimi

Şu anki `maestro-cloud.yml` `include-tags: smoke` kullanıyor. Cloud'da hangi flow'ları koşacağını seçmek için flow YAML'larının başına `tags:` eklenir:

```yaml
appId: host.exp.Exponent
tags:
  - smoke
---
```

Önerilen sınıflandırma:
- **smoke**: 01-smoke, 01-01-login-happy, D-01..D-05 (her PR'da, ~6 flow)
- **regression**: 01-02, 01-03, 01-12 (haftada bir veya release öncesi)
- **full**: hepsi (manuel tetik)

Daha ileri optimizasyon: `--include-tags smoke --shard 2` ile paralel koşum.

## Şu an yapılması gereken minimum

CI yeşil ve API e2e'leri her PR'da koşuyor. **B-001 üç katmanlı korumayla zaten güvende.** Maestro Cloud opsiyoneldir; UI smoke'larına ekstra otomatik koruma eklemek istediğinde **Adım 1 + 2 + 3a/b'yi sırayla yap**.

## Karar matrisi

| Senaryo | Maestro Cloud lazım mı? |
|---------|------------------------|
| Sadece backend değişikliği yapılan PR'lar | ❌ API e2e zaten yeterli |
| Mobile UI bileşenlerinde düzenli değişiklik | ✅ Önerilir, test efor azaltır |
| Solo geliştirici, manuel test yeterli | ❌ Şu anki yapı tamam |
| Ekip 2+ kişi, code review sırasında smoke garantisi | ✅ Önerilir |
| Sürüm öncesi spot kontrol yapılıyor | ❌ Manuel + mevcut yapı yeter |
