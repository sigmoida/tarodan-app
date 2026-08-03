-- Takas v2: hizmet bedeli KDV DAHİL sabit tutardır (v1 komisyonu KDV HARİÇ matrahtı).
-- Aynı fatura türünü paylaşamazlar; KDV yönü türe bağlıdır (invoice-amounts.ts).
ALTER TYPE "ElogoInvoiceType" ADD VALUE 'trade_service_fee';
