# Tarodan — Sistem Akış Diyagramları

Tarodan, koleksiyon araçları ve diecast modeller için **escrow korumalı**
e-ticaret + takas (swap) platformudur. Bu dokümanda kritik iş akışları
diyagramlarla anlatılmıştır. Üst seviye sistem mimarisi için
[`ARCHITECTURE.md`](./ARCHITECTURE.md) dosyasına bakın.

---

## 1. Yüksek Seviye Sistem Görünümü

```mermaid
flowchart LR
  subgraph Clients["🖥️  İstemciler"]
    Web["Web (Next.js)<br/>localhost:3000"]
    Admin["Admin Panel"]
  end

  subgraph API["⚙️  Backend API (NestJS 10)"]
    direction TB
    HTTP[REST + Express]
    Modules[44 Modül<br/>~450 endpoint]
    Cron[Schedulers<br/>(payment, shipping, refund)]
    Workers[BullMQ Workers]
  end

  subgraph Storage["💾  Storage"]
    PG[(PostgreSQL 17<br/>Prisma 5.22)]
    Redis[(Redis 7<br/>cache + queue)]
    ES[(Elasticsearch 8<br/>search)]
    S3[(AWS S3<br/>media)]
  end

  subgraph External["🌐  Dış Servisler"]
    PayTR["PayTR<br/>iframe + webhook + transfer"]
    Surat["Sürat Kargo<br/>SOAP + REST"]
    SMTP["SMTP<br/>(transactional email)"]
    Push["Expo Push"]
  end

  Web --> HTTP
  Admin --> HTTP
  HTTP --> Modules
  Modules --> PG
  Modules --> Redis
  Modules --> ES
  Modules --> S3
  Modules --> PayTR
  Modules --> Surat
  Modules --> SMTP
  Workers --> SMTP
  Workers --> Push
  Cron --> Modules
```

---

## 2. Sipariş Yaşam Döngüsü (Order State Machine)

```mermaid
stateDiagram-v2
  [*] --> pending_payment: Buy Now / Offer accept
  pending_payment --> paid: PayTR webhook (success)
  pending_payment --> cancelled: 24h timeout / user cancel
  paid --> preparing: Seller marks preparing
  preparing --> shipped: Sürat picks up
  shipped --> delivered: Sürat delivers
  delivered --> completed: Buyer confirms / 3 gün sonra auto-confirm

  paid --> cancelled: Refund (instant)
  preparing --> cancelled: Refund (instant) / preparing deadline expiry
  shipped --> refund_requested: Buyer initiates return
  delivered --> refund_requested: Buyer initiates return
  refund_requested --> refunded: Return delivered + PayTR refund
  refunded --> [*]
  cancelled --> [*]
  completed --> [*]
```

---

## 3. Escrow ve Para Akışı

```mermaid
sequenceDiagram
  autonumber
  actor B as Alıcı
  participant API as Tarodan API
  participant PayTR
  participant Surat as Sürat Kargo
  participant DB as PostgreSQL
  actor S as Satıcı

  B->>API: POST /payments/initiate (orderId)
  API->>PayTR: Init request
  PayTR-->>API: iframe URL
  API-->>B: iframe URL
  B->>PayTR: Kart ödemesi
  PayTR->>API: callback (HMAC signed)
  API->>DB: Payment.completed + Order.paid + PaymentHold (escrow başlar)
  API->>Surat: Auto-create shipment (referansNo=orderNumber)

  Note over S: Satıcı paketi Sürat şubesine bırakır
  Surat->>API: Tracking webhook (in_transit / delivered)
  API->>DB: Shipment.status update

  Note over B: Alıcı teslim alır
  B->>API: POST /orders/:id/confirm
  API->>DB: Order.completed + holdReleaseAt = now + 24h

  Note over API: 24 saat sonra cron (release-holds-due)
  API->>PayTR: createTransfer (seller IBAN)
  PayTR-->>API: transfer success
  API->>DB: PaymentHold.released + PayoutTransfer.completed
  PayTR->>S: Banka hesabına TL
```

---

## 4. İade (Refund) Akışı — 3 Senaryo

```mermaid
flowchart TD
  Start([Alıcı 'İade Talebi Oluştur']) --> CheckStatus{Order.status<br/>+ 14 gün?}

  CheckStatus -->|paid / preparing<br/>(shipment=pending)| Instant
  CheckStatus -->|shipped / in_transit| Wait
  CheckStatus -->|delivered ≤14 gün| Cooling
  CheckStatus -->|delivered >14 gün| Dispute

  Instant[Anlık İade] --> InstantPayTR[PayTR refund]
  InstantPayTR --> InstantSurat[Sürat cancel]
  InstantSurat --> InstantStock[Stok +1, Order=cancelled]
  InstantStock --> EndR([Para alıcıya geri])

  Wait[wait_for_delivery] --> WaitDeliver{Ürün delivered?}
  WaitDeliver -->|hayır| WaitDeliver
  WaitDeliver -->|evet, cron tetikler| Return

  Cooling[Otomatik onay<br/>14 gün cayma hakkı] --> Return

  Return[Sürat'tan iade kargo<br/>Iademi=true<br/>RFD-YYYY-NNNNNN] --> ReturnDeliver{Sürat'tan delivered?}
  ReturnDeliver -->|hayır| ReturnDeliver
  ReturnDeliver -->|evet| FinalRefund[PayTR refund<br/>+ stok geri]
  FinalRefund --> EndR

  Dispute[pending_review] --> SellerDecide{Satıcı kararı}
  SellerDecide -->|kabul| Return
  SellerDecide -->|48h sessiz| AutoAccept[Auto-accept cron]
  AutoAccept --> Return
  SellerDecide -->|red, sebepli| AdminQ([Admin İncelemesi])
  AdminQ --> EndR
```

**14 gün cayma hakkı**: Türkiye Mesafeli Satış Sözleşmesi gereği, alıcı
ürünü teslim aldıktan sonra **14 gün içinde sebep göstermeden** iade hakkına
sahiptir. Satıcı bu talebi reddedemez (yasal koruma).

---

## 5. Takas (Trade) Akışı — Cash Trade

```mermaid
sequenceDiagram
  autonumber
  actor I as Initiator
  actor R as Receiver
  participant API
  participant Admin
  participant Surat as Sürat Kargo

  I->>API: POST /trades (items + cashAmount)
  API->>R: Notification: yeni takas teklifi
  R->>API: POST /trades/:id/accept

  alt Cash payment varsa
    API->>I: awaiting_payment
    I->>API: PayTR initiate-trade-cash
    API->>I: ödeme tamamlandı (escrow'a alındı)
  end

  par Both ship to warehouse
    I->>API: POST /trades/:id/ship-to-warehouse
    API->>Surat: Auto Sürat shipment (initiator → warehouse)
  and
    R->>API: POST /trades/:id/ship-to-warehouse
    API->>Surat: Auto Sürat shipment (receiver → warehouse)
  end

  Note over API: Warehouse iki paketi de alır
  API->>Admin: at_warehouse → admin_reviewing

  alt Admin onaylar
    Admin->>API: POST /admin/trades/:id/approve-warehouse
    par Ship to recipients
      API->>Surat: Sürat shipment (warehouse → receiver)
    and
      API->>Surat: Sürat shipment (warehouse → initiator)
    end
    Note over I,R: Ürünler değişti, completed
    alt Cash payment varsa
      Note over API: 24h hold release
      API->>R: PayTR transfer
    end
  else Admin reddeder
    Admin->>API: POST /admin/trades/:id/reject-warehouse
    par Return to original owners (Iademi=true)
      API->>Surat: warehouse → initiator
    and
      API->>Surat: warehouse → receiver
    end
    alt Cash payment varsa
      API->>I: PayTR refund
    end
  end
```

---

## 6. Test Mimarisi

```mermaid
graph TB
  subgraph TestLayers["Test Katmanları"]
    direction TB
    Unit["🔹 Unit Tests<br/>~70 test, 12 dosya<br/>(jest)"]
    Integration["🔹 Integration Tests<br/>2 dosya (PayTR + Sürat canlı)"]
    E2E["🔹 E2E Tests<br/>~411 test, 54 dosya<br/>(jest + supertest)"]
    Playwright["🔹 Frontend E2E<br/>~73 test, 6 dosya<br/>(Playwright)"]
  end

  subgraph Mocks["Mock'lar"]
    PayTRMock["MockPayTRService<br/>iframeCalls, refundCalls,<br/>transferCalls"]
    SuratStub["StubSuratSoapClient<br/>shipmentCalls, cancelCalls"]
    StorageStub["In-memory storage"]
  end

  subgraph TestEnv["Test Ortamı"]
    EnvFile[".env.test<br/>NODE_ENV=test<br/>tarodan_test DB"]
    DBSetup["truncateAll +<br/>seedBaseline"]
    Factories["user/product/address/offer<br/>factories"]
  end

  E2E --> PayTRMock
  E2E --> SuratStub
  E2E --> StorageStub
  E2E --> EnvFile
  E2E --> DBSetup
  E2E --> Factories
```

**Test ortamı dış dünyaya hiç ulaşmaz** — PayTR ve Sürat mock'lanır,
S3 yerine in-memory stub, ayrı bir Postgres veritabanı (`tarodan_test`).
CI'da PostgreSQL 16 + Redis 7 + Elasticsearch 8 services olarak ayağa
kaldırılır.

---

## 7. CI / CD Pipeline

```mermaid
flowchart LR
  Dev[git push] --> CI[GitHub Actions]
  CI --> Build[Build]
  CI --> TC[Type Check]
  CI --> Lint[Lint]
  CI --> Unit[Unit Tests]
  CI --> E2E[E2E Tests<br/>(PG + Redis + ES servisleri)]
  CI -.optional.-> Int[Integration Tests<br/>(PayTR + Sürat canlı)]

  Build --> Pass{Hepsi ✓?}
  TC --> Pass
  Lint --> Pass
  Unit --> Pass
  E2E --> Pass
  Pass -->|evet| Green([✅ CI yeşil])
  Pass -->|hayır| Fail([❌ Build kırık])
```

`prisma generate` adımı **3 retry** ile sarılı: ECONNRESET gibi geçici
network hatalarına karşı dirençli. CI'da composite action kullanılıyor.
