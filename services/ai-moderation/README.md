# Tarodan AI Moderasyon Servisi

Tamamen **lokal + ücretsiz** içerik moderasyonu. Harici API / anahtar **yok**, görsel/çağrı başı ücret **yok**.

- **Görsel** (`/moderate/image`): ResNet50 (ImageNet) ile "araç/model/oyuncak mı?" ilgililik skoru + `Falconsai/nsfw_image_detection` ile uygunsuz/NSFW skoru.
- **Metin** (`/moderate/text`): Detoxify `multilingual` (Türkçe dahil) ile küfür/nefret/taciz/şiddet (toksisite) skorları.

NestJS API bu servise HTTP ile gelir (`AI_MODERATION_URL`, varsayılan `http://localhost:8000`). Servis kapalıysa NestJS güvenli şekilde fallback yapar (ürün bugünkü gibi `pending` kalır), sistem bozulmaz.

## Kurulum

```bash
cd services/ai-moderation
python -m venv venv
# Windows:
venv\Scripts\activate
# (mac/linux: source venv/bin/activate)

# torch'u CPU sürümüyle kurmak çok daha küçük/hızlı (GPU yoksa önerilir):
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

pip install -r requirements.txt
```

> İlk çalıştırmada modeller (ResNet50 ~100MB, NSFW ViT ~350MB, Detoxify ~1GB) bir kez indirilir ve cache'lenir.

## Çalıştırma

```bash
uvicorn app:app --host 0.0.0.0 --port 8000
```

## Endpoint'ler

```bash
# sağlık
curl http://localhost:8000/health

# görsel (URL ile)
curl -X POST http://localhost:8000/moderate/image \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"https://.../araba.jpg"}'
# -> { relevanceScore, topLabels[], nsfwScore, decision: pass|review|flag, reason }

# metin
curl -X POST http://localhost:8000/moderate/text \
  -H "Content-Type: application/json" \
  -d '{"text":"merhaba nasılsın"}'
# -> { scores{toxicity,insult,...}, maxScore, toxic, decision: pass|flag, reason }
```

`decision` anlamları (görsel):
- `pass` — ilgili + temiz → NestJS oto-onaylar
- `flag` — NSFW şüphesi → admin kuyruğu
- `review` — düşük ilgililik (belirsiz) → admin kuyruğu

## Eşikler (env, opsiyonel)

| Env | Vars. | Anlam |
|-----|-------|-------|
| `NSFW_THRESHOLD` | 0.7 | Bu üstü → uygunsuz say |
| `RELEVANCE_THRESHOLD` | 0.45 | Bu üstü → ilgili (araç/model) say |
| `TOXIC_THRESHOLD` | 0.7 | Bu üstü → toksik metin say |

NestJS tarafı ham skorları da aldığı için kendi eşiklerini de uygulayabilir.
