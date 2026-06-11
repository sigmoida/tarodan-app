# Tarodan AI Moderasyon servisi — Railway/Docker
# CPU-only torch + modeller build sırasında indirilir (runtime cold-start / health-check
# timeout yaşanmasın diye). ~2-3GB imaj; servis ~2-3GB RAM ister.
FROM python:3.11-slim

WORKDIR /app

# 0) numpy<2 — numpy 2.x'te torch import sırasında "cannot load module more than once"
#    hatası veriyor; 1.26.x torch/transformers/detoxify ile en uyumlu sürüm.
RUN pip install --no-cache-dir "numpy<2"

# 1) CPU-only torch + torchvision (CUDA sürümü ~2GB, gereksiz)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# 2) Diğer bağımlılıklar
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3) Modelleri build'de indir/cache'le (runtime'da indirme olmasın)
RUN python -c "from torchvision.models import ResNet50_Weights, resnet50; resnet50(weights=ResNet50_Weights.DEFAULT)" \
 && python -c "from transformers import pipeline; pipeline('image-classification', model='Falconsai/nsfw_image_detection')" \
 && python -c "from detoxify import Detoxify; Detoxify('multilingual')"

# 4) Uygulama kodu
COPY . .

# Railway/Coolify $PORT verir; yoksa 8000 (JSON form — sinyal yönetimi düzgün)
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
