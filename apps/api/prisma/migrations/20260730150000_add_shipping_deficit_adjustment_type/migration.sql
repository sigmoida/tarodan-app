-- Escrow hold artık TAM kargo bedelini düşer (Sürat faturası platforma gelir).
-- Kargonun yüklendiği satırın hold'u negatife düşerse açık satıcıya borç yazılır.
ALTER TYPE "SellerAdjustmentType" ADD VALUE 'shipping_deficit';
