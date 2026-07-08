# Proje Spesifikasyonu (Orijinal Gereksinimler)

Bu klasör, Tarodan projesinin **inşa edilirken kullanılan orijinal gereksinim/spesifikasyon
bölümlerini** barındırır. Tarihsel/arşiv değeri taşırlar; güncel dokümantasyon için `docs/`
kökündeki dosyalara (SCHEMA, DEPLOYMENT, SETUP vb.) bakın.

## Numaralı bölümler (`N.M.txt`)
Sistem bölüm bölüm tanımlanmıştır:

| Dosya | İçerik |
|-------|--------|
| `1.1` – `1.2` | Genel sistem mimarisi (katmanlar, portlar, dış servisler) |
| `2.1` – `2.2` | (bkz. dosya içeriği) |
| `3.1` – `3.3` | (bkz. dosya içeriği) |
| `4.1` – `4.2` | Veri modeli / entity'ler (bkz. `docs/ENTITY_VERIFICATION.md`) |
| `5.1` – `5.2` | (bkz. dosya içeriği) |
| `6.1` – `6.2` | Test & QA |
| `7.1` – `7.2` | Deployment |
| `8.1` – `8.2` | (bkz. dosya içeriği) |

## Diğer requirement dosyaları
- `project.txt` — genel proje gereksinimleri (kodda `Requirement: ... (project.txt)` yorumlarıyla refere edilir)
- `requirements.txt` — fonksiyonel gereksinimler (web e2e testleri ve API modüllerinde refere edilir)
- `users.txt` — kullanıcı tipleri ve yetkileri (mobil `ReputationBadge` gibi yerlerde refere edilir)

> Not: Bu dosyalar ham gereksinim metnidir; başlarında prompt/talimat satırları içerebilir.
> Kanonik/güncel kaynak Prisma şeması ve `docs/` altındaki işlenmiş dokümanlardır.
