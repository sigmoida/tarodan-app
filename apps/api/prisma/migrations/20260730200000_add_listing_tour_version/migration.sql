-- İlan verme sayfası tanıtım turu, ana sayfa turundan bağımsız ilerler.
ALTER TABLE "users" ADD COLUMN "listing_tour_version" INTEGER NOT NULL DEFAULT 0;
