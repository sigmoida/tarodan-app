"""
AI görsel moderasyon toplu testi.
Gerçek görselleri (LoremFlickr) çeker -> /moderate/image -> kararları + skorları gösterir.
Araçlar 'pass' (oto-onay), alakasızlar 'review' (admin) beklenir.

Çalıştır:  venv\\Scripts\\python.exe test_batch.py
(AI servisi :8000'de çalışıyor olmalı)
"""

import sys
import requests

BASE = "http://localhost:8000/moderate/image"
LOCKS = [1, 2, 3]  # her tür için 3 farklı görsel (farklı açı/örnek)

VEHICLES = {
    "Uçak": ["airplane", "aircraft", "fighter+jet"],
    "Gemi": ["cargo+ship", "ship", "yacht"],
    "Kamyon": ["truck", "semi+truck"],
    "Araba": ["car", "sports+car", "suv"],
    "Motosiklet": ["motorcycle", "motorbike"],
    "Otobüs": ["bus"],
    "Tren": ["train", "locomotive"],
    "Bisiklet": ["bicycle"],
    "Helikopter": ["helicopter"],
    "Traktör": ["tractor"],
    "Tank": ["tank"],
}

IRRELEVANT = {
    "Yemek": ["pizza", "food"],
    "Kedi": ["cat"],
    "Çiçek": ["flower"],
    "Bina": ["building"],
    "Manzara": ["mountain", "landscape"],
    "İnsan": ["portrait", "people"],
    "Laptop": ["laptop"],
    "Kitap": ["book"],
}


def run(group_name, groups, expected):
    print(f"\n{'='*70}\n{group_name}  (beklenen: {expected})\n{'='*70}")
    correct, total = 0, 0
    for label, keywords in groups.items():
        for kw in keywords:
            for lock in LOCKS:
                url = f"https://loremflickr.com/500/400/{kw}?lock={lock}"
                total += 1
                try:
                    r = requests.post(BASE, json={"imageUrl": url}, timeout=90).json()
                    if "decision" not in r:
                        print(f"  {label:11}{kw:14} -> HATA: {r}")
                        continue
                    dec = r["decision"]
                    rel = r["relevanceScore"]
                    nsfw = r["nsfwScore"]
                    top = ", ".join(l["label"] for l in r.get("topLabels", [])[:2])
                    hit = "OK " if dec == expected else "XX "
                    if dec == expected:
                        correct += 1
                    print(
                        f"  {hit}{label:11}{kw:13} -> {dec:7} | rel={rel:<6} nsfw={nsfw:<7} | {top}"
                    )
                except Exception as e:  # noqa: BLE001
                    print(f"  {label:11}{kw:14} -> BAGLANTI HATASI: {e}")
    print(f"\n  >>> {group_name}: {correct}/{total} dogru ({round(100*correct/total) if total else 0}%)")
    return correct, total


def main():
    try:
        h = requests.get("http://localhost:8000/health", timeout=5)
        if h.status_code != 200:
            print("AI servisi (8000) yanit vermiyor. Once uvicorn'u baslat.")
            sys.exit(1)
    except Exception:
        print("AI servisi (8000) kapali. Once: venv\\Scripts\\python.exe -m uvicorn app:app --port 8000")
        sys.exit(1)

    vc, vt = run("ARACLAR (kabul edilmeli)", VEHICLES, "pass")
    ic, it = run("ALAKASIZ (admine gitmeli)", IRRELEVANT, "review")

    print(f"\n{'#'*70}")
    print(f"# OZET")
    print(f"#   Araclar dogru 'pass' (oto-onay):    {vc}/{vt}  (%{round(100*vc/vt) if vt else 0})")
    print(f"#   Alakasiz dogru 'review' (admin):    {ic}/{it}  (%{round(100*ic/it) if it else 0})")
    print(f"{'#'*70}")


if __name__ == "__main__":
    main()
