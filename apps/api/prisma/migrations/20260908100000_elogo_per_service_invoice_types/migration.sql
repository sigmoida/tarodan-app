-- Her hizmet kalemi kendi e-belgesini alır: paket başına taraf başına üç belge
-- (komisyon, hizmet bedeli, kargo payı). Eski birleşik türler (commission /
-- service_fee) kesilmiş kayıtlar ve kesinti kırılımı olmayan ledger'lar için kalır.
ALTER TYPE "ElogoInvoiceType" ADD VALUE IF NOT EXISTS 'buyer_commission';
ALTER TYPE "ElogoInvoiceType" ADD VALUE IF NOT EXISTS 'buyer_service_fee';
ALTER TYPE "ElogoInvoiceType" ADD VALUE IF NOT EXISTS 'buyer_shipping';
ALTER TYPE "ElogoInvoiceType" ADD VALUE IF NOT EXISTS 'seller_commission';
ALTER TYPE "ElogoInvoiceType" ADD VALUE IF NOT EXISTS 'seller_platform_fee';
ALTER TYPE "ElogoInvoiceType" ADD VALUE IF NOT EXISTS 'seller_shipping';
