"""
Tarodan AI Moderasyon — model sarmalayıcıları (tamamen lokal, ücretsiz).

Görsel:
  - ResNet50 (torchvision, ImageNet) -> ürün ilgili mi? (araç / model / oyuncak)
  - Falconsai/nsfw_image_detection (HF ViT) -> uygunsuz/NSFW mi?
Metin:
  - Detoxify('multilingual') -> Türkçe dahil toksisite / küfür / nefret

Tüm modeller ilk kullanımda indirilir ve cache'lenir. Harici API / anahtar YOK.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Any

from PIL import Image

logger = logging.getLogger("moderation")

# ImageNet sınıf adlarında "ürün ilgili" (araç/model/oyuncak) sayılacak anahtarlar.
# Diecast/ölçek modeller ResNet tarafından genelde gerçek araç sınıfına atanır.
VEHICLE_KEYWORDS = (
    "car", "truck", "van", "jeep", "cab", "bus", "wagon", "limousine",
    "convertible", "racer", "ambulance", "police", "fire engine", "garbage",
    "tow truck", "trailer", "minivan", "pickup", "recreational vehicle",
    "motor scooter", "moped", "motorbike", "motorcycle", "bicycle", "tricycle",
    "unicycle", "mountain bike", "go-kart", "golfcart", "snowplow", "snowmobile",
    "forklift", "tractor", "harvester", "thresher", "tank", "half track",
    "boat", "ship", "yacht", "yawl", "catamaran", "trimaran", "canoe", "kayak",
    "lifeboat", "fireboat", "gondola", "schooner", "speedboat", "submarine",
    "liner", "aircraft", "airliner", "warplane", "airship", "balloon",
    "space shuttle", "locomotive", "freight car", "passenger car",
    "bullet train", "streetcar", "trolleybus", "moving van", "minibus",
    "school bus", "tricycle", "model t",
)

# Tasarruf: ağır importları yalnızca gerektiğinde yap.


class ImageModerator:
    """ResNet50 (ilgililik) + NSFW sınıflandırıcı (uygunsuzluk)."""

    def __init__(self) -> None:
        self._resnet = None
        self._resnet_transform = None
        self._resnet_categories: list[str] | None = None
        self._nsfw = None
        self._torch = None

    def _ensure_loaded(self) -> None:
        # Her modele AYRI guard — biri yüklenemezse (örn. HF timeout) diğeri
        # yüzünden atlanmasın; sonraki çağrıda eksik olan tekrar denenir.
        if self._resnet is None:
            import torch
            from torchvision.models import ResNet50_Weights, resnet50

            # oneDNN'in conv JIT'i bazı VPS CPU'larında (AVX bayrakları
            # hypervisor'da maskeli) "could not create a primitive" veriyor;
            # native kernel'e düş. Tek görsel inference için hız farkı önemsiz.
            if os.getenv("TORCH_DISABLE_MKLDNN", "1") == "1":
                torch.backends.mkldnn.enabled = False
            torch.set_num_threads(int(os.getenv("TORCH_NUM_THREADS", "1")))

            self._torch = torch
            weights = ResNet50_Weights.DEFAULT
            model = resnet50(weights=weights)
            model.eval()
            self._resnet = model
            self._resnet_transform = weights.transforms()
            self._resnet_categories = list(weights.meta["categories"])
            logger.info(
                "ResNet50 yüklendi (%d sınıf)", len(self._resnet_categories)
            )

        if self._nsfw is None:
            # NSFW: küçük ViT sınıflandırıcı (label: 'nsfw' | 'normal')
            from transformers import pipeline

            self._nsfw = pipeline(
                "image-classification", model="Falconsai/nsfw_image_detection"
            )
            logger.info("NSFW modeli yüklendi (Falconsai/nsfw_image_detection)")

    def moderate(self, image: Image.Image, top_k: int = 5) -> dict[str, Any]:
        self._ensure_loaded()
        image = image.convert("RGB")

        # --- ResNet ilgililik ---
        torch = self._torch
        batch = self._resnet_transform(image).unsqueeze(0)
        with torch.no_grad():
            logits = self._resnet(batch)
            probs = logits.softmax(dim=1)[0]
        top_probs, top_idx = probs.topk(top_k)
        top_labels: list[dict[str, Any]] = []
        relevance_score = 0.0
        for p, i in zip(top_probs.tolist(), top_idx.tolist()):
            name = self._resnet_categories[i]
            is_vehicle = any(kw in name.lower() for kw in VEHICLE_KEYWORDS)
            top_labels.append({"label": name, "score": round(p, 4), "vehicle": is_vehicle})
            if is_vehicle:
                relevance_score += p
        relevance_score = round(min(relevance_score, 1.0), 4)

        # --- NSFW ---
        nsfw_score = 0.0
        for r in self._nsfw(image):
            if str(r.get("label", "")).lower() == "nsfw":
                nsfw_score = float(r.get("score", 0.0))
                break
        nsfw_score = round(nsfw_score, 4)

        return {
            "relevanceScore": relevance_score,
            "topLabels": top_labels,
            "nsfwScore": nsfw_score,
        }


class TextModerator:
    """Detoxify multilingual — Türkçe dahil toksisite/küfür/nefret skorları."""

    def __init__(self) -> None:
        self._model = None

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        from detoxify import Detoxify

        self._model = Detoxify("multilingual")
        logger.info("Detoxify(multilingual) yüklendi")

    def moderate(self, text: str) -> dict[str, Any]:
        self._ensure_loaded()
        raw = self._model.predict(text or "")
        scores = {k: round(float(v), 4) for k, v in raw.items()}
        max_score = max(scores.values()) if scores else 0.0
        return {"scores": scores, "maxScore": round(max_score, 4)}


@lru_cache(maxsize=1)
def get_image_moderator() -> ImageModerator:
    return ImageModerator()


@lru_cache(maxsize=1)
def get_text_moderator() -> TextModerator:
    return TextModerator()
