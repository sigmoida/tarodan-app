# Takas (Trade) Bölümü – İnceleme ve Yol Haritası

## Mevcut Durum Özeti

### Sayfa ve Tasarım
- **Takaslarım** (`/trades`) sayfası var; başlık, filtreler (Tümü, Beklemede, Kargoda, Tamamlandı, İptal, Reddedildi) ve liste/detay akışı mevcut.
- Tasarım: Turuncu-beyaz tema, ikonlar, kart yapısı — profesyonel ve uygulama bütünüyle uyumlu.
- Boş durum: Giriş yapmış kullanıcıda artık “giriş yapmanız gerekiyor” yerine “İlanlara göz atıp takas teklifi gönderebilirsiniz.” gösteriliyor (düzeltildi).

### Şu An Olanlar
| Bileşen | Durum |
|--------|--------|
| `/trades` liste sayfası | Var – filtreler, kart listesi, boş durum |
| `/trades/[id]` detay sayfası | Var – teklif/kabul/red, karşı teklif, kargo bilgisi alanları |
| `/trades/new` teklif gönderme | Var – hedef ilan + kendi ilanların seçimi, nakit farkı |
| API: trades CRUD, status, counter | Var (backend) |
| İlan detayında “Takas” butonu | Var – teklif akışına giriş |

---

## Eksik / Güçlendirilecekler (Görev 7)

Planlanan iyileştirmeler:

### 1. Teklif göndermeden önce
- **Adres seçimi**: Takas kabul edildiğinde kargoya verilecek adresin (initiator/receiver) teklif aşamasında veya kabul sonrası seçilmesi.
- **Güvenli takas seçeneği**: İsteğe bağlı “güvenli takas” (escrow / iki taraflı onay) akışı veya açıklaması.

### 2. Takas tamamlandıktan sonra
- **Detaylı takas özeti sayfası**: Tamamlanan takas için;
  - Gönderilen/alınan ürünler, nakit farkı
  - Kargo bilgileri (takip no, tarih)
  - Karşı taraf bilgisi (isim, iletişim)
  - Mümkünse “Tekrar takas yap” veya ilanlara dönüş CTA

### 3. Entegrasyon noktaları
- **Backend**: `Trade` modelinde adres alanları, `completedAt` ve tamamlanma sonrası özet için ek alanlar (gerekirse).
- **Web**:  
  - `/trades/new` – adres seçimi (ve güvenli takas checkbox’ı)  
  - `/trades/[id]` – kabul sonrası adres formu, kargo girişi  
  - `/trades/[id]/completed` veya `/trades/[id]` içinde “completed” state’e özel detaylı özet bloğu
- **E-posta**: Takas kabul/red/tamamlandı bildirimleri (varsa güncelleme).

---

## Önerilen Sıra

1. **Tamamlanan takas detayı** – Tamamlanan takaslar için mevcut detay sayfasında özet kartı veya ayrı “Tamamlandı” görünümü.
2. **Adres seçimi** – Teklif veya kabul aşamasında “Kargo adresim” seçimi (mevcut adreslerden).
3. **Güvenli takas** – UI’da bilgi + (opsiyonel) basit “güvenli takas” işaretlemesi ve kuralların net yazılması.

Bu doküman, takas bölümünün mevcut durumu ve Görev 7 kapsamındaki hedefler için referans olarak kullanılabilir.
