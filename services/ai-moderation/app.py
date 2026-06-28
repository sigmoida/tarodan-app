"""
Tarodan AI Moderasyon servisi (FastAPI).

Tamamen lokal + ücretsiz. Harici API / anahtar yok.
NestJS bu servise HTTP ile gelir:
  POST /moderate/image  { imageUrl | imageBase64 }  -> ilgililik + NSFW skoru + karar önerisi
  POST /moderate/text   { text }                    -> toksisite skorları + karar önerisi
  GET  /health

Eşikler env ile ayarlanır (NestJS kendi eşiğini de uygulayabilir; ham skorlar her zaman döner).
"""

from __future__ import annotations

import base64
import binascii
import io
import json
import logging
import os
from typing import Optional

import requests
from fastapi import FastAPI, HTTPException
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

from moderation import get_image_moderator, get_text_moderator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-moderation")

# Eşikler (0..1) — env ile override edilebilir.
NSFW_THRESHOLD = float(os.getenv("NSFW_THRESHOLD", "0.7"))
# 0.20 -> 0.10: ResNet50, küçük diecast/paketli Hot Wheels'lerde araç sınıflarını
# tanıyor ama olasılıkları çok sayıda sınıfa dağıtıyor (örn. racer/sports car/
# go-kart hepsi ~%2-7) → toplam ilgililik ~0.10-0.19 bandında kalıp 0.20 eşiğini
# kıl payı geçemiyordu. Gerçek ürün görselleri (0.11-0.19) ile alakasız içerik
# (~0.04) arasında net boşluk ölçüldü; 0.10 gerçek ürünleri geçirir, çöpü eler.
RELEVANCE_THRESHOLD = float(os.getenv("RELEVANCE_THRESHOLD", "0.10"))
TOXIC_THRESHOLD = float(os.getenv("TOXIC_THRESHOLD", "0.7"))
DOWNLOAD_TIMEOUT = float(os.getenv("DOWNLOAD_TIMEOUT", "15"))
MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_BYTES", str(15 * 1024 * 1024)))

# Admin panelinden ayarlanabilen eşikler config.json'a yazılır (restart'ta korunur).
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")


def _load_config() -> None:
    """config.json varsa eşikleri override et (admin panelinden kaydedilen değerler)."""
    global NSFW_THRESHOLD, RELEVANCE_THRESHOLD
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            data = json.load(f)
        if "relevanceThreshold" in data:
            RELEVANCE_THRESHOLD = float(data["relevanceThreshold"])
        if "nsfwThreshold" in data:
            NSFW_THRESHOLD = float(data["nsfwThreshold"])
        logger.info(
            "config.json yüklendi (relevance=%.2f, nsfw=%.2f)",
            RELEVANCE_THRESHOLD,
            NSFW_THRESHOLD,
        )
    except FileNotFoundError:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.warning("config.json okunamadı: %s", exc)


_load_config()

app = FastAPI(title="Tarodan AI Moderation", version="1.0.0")


@app.on_event("startup")
def _warmup_models() -> None:
    """Modelleri açılışta yükle — ilk gerçek istek cold-start timeout'una takılmasın."""
    try:
        get_text_moderator().moderate("warmup")
        logger.info("Metin modeli (Detoxify) hazır")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Detoxify ön-yükleme atlandı: %s", exc)
    try:
        # Sadece yükleme değil gerçek bir forward pass — conv kernel'i bu
        # CPU'da çalışmıyorsa ilk kullanıcı isteğinde değil burada görelim.
        get_image_moderator().moderate(Image.new("RGB", (224, 224)))
        logger.info("Görsel modelleri (ResNet + NSFW) hazır")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Görsel modeli ön-yükleme atlandı: %s", exc)


class ImageRequest(BaseModel):
    imageUrl: Optional[str] = None
    imageBase64: Optional[str] = None


class TextRequest(BaseModel):
    text: str = ""


def _load_image(req: ImageRequest) -> Image.Image:
    if req.imageUrl:
        try:
            resp = requests.get(
                req.imageUrl,
                timeout=DOWNLOAD_TIMEOUT,
                stream=True,
                headers={"User-Agent": "TarodanModeration/1.0 (+content-moderation)"},
            )
            resp.raise_for_status()
            data = resp.content[: MAX_IMAGE_BYTES + 1]
        except requests.RequestException as exc:
            raise HTTPException(status_code=400, detail=f"Görsel indirilemedi: {exc}") from exc
    elif req.imageBase64:
        try:
            raw = req.imageBase64.split(",", 1)[-1]  # data: URI önekini at
            data = base64.b64decode(raw, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Geçersiz base64") from exc
    else:
        raise HTTPException(status_code=400, detail="imageUrl veya imageBase64 gerekli")

    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Görsel çok büyük")
    try:
        return Image.open(io.BytesIO(data))
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="Görsel açılamadı") from exc


def _image_decision(relevance: float, nsfw: float) -> dict:
    """flag (uygunsuz şüphesi) / review (belirsiz ilgililik) / pass (uygun)."""
    if nsfw >= NSFW_THRESHOLD:
        return {"decision": "flag", "reason": "nsfw"}
    if relevance >= RELEVANCE_THRESHOLD:
        return {"decision": "pass", "reason": "relevant_clean"}
    return {"decision": "review", "reason": "low_relevance"}


@app.get("/")
def root() -> dict:
    return {
        "service": "Tarodan AI Moderation",
        "status": "running",
        "endpoints": {
            "health": "GET /health",
            "image": "POST /moderate/image  { imageUrl | imageBase64 }",
            "text": "POST /moderate/text  { text }",
        },
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "ai-moderation"}


class ConfigRequest(BaseModel):
    relevanceThreshold: Optional[float] = None
    nsfwThreshold: Optional[float] = None


@app.get("/config")
def get_config() -> dict:
    """Aktif eşikler (admin paneli okur)."""
    return {
        "relevanceThreshold": RELEVANCE_THRESHOLD,
        "nsfwThreshold": NSFW_THRESHOLD,
    }


@app.post("/config")
def set_config(req: ConfigRequest) -> dict:
    """Eşikleri canlı güncelle + config.json'a kaydet (restart'ta korunur)."""
    global RELEVANCE_THRESHOLD, NSFW_THRESHOLD
    if req.relevanceThreshold is not None:
        RELEVANCE_THRESHOLD = max(0.0, min(1.0, float(req.relevanceThreshold)))
    if req.nsfwThreshold is not None:
        NSFW_THRESHOLD = max(0.0, min(1.0, float(req.nsfwThreshold)))
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "relevanceThreshold": RELEVANCE_THRESHOLD,
                    "nsfwThreshold": NSFW_THRESHOLD,
                },
                f,
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("config.json yazılamadı: %s", exc)
    return {
        "relevanceThreshold": RELEVANCE_THRESHOLD,
        "nsfwThreshold": NSFW_THRESHOLD,
    }


@app.post("/moderate/image")
def moderate_image(req: ImageRequest) -> dict:
    image = _load_image(req)
    result = get_image_moderator().moderate(image)
    decision = _image_decision(result["relevanceScore"], result["nsfwScore"])
    return {**result, **decision}


@app.post("/moderate/text")
def moderate_text(req: TextRequest) -> dict:
    result = get_text_moderator().moderate(req.text)
    toxic = result["maxScore"] >= TOXIC_THRESHOLD
    top_category = None
    if toxic:
        top_category = max(result["scores"], key=result["scores"].get)
    return {
        **result,
        "toxic": toxic,
        "decision": "flag" if toxic else "pass",
        "reason": top_category,
    }
