-- Satıcı kusurlu iadede alıcıya geri ödenen gidiş kargosu satıcıya borç yazılır
-- (Sürat faturası platforma gelir; taşıma maliyeti platformda kalmamalı).
ALTER TYPE "SellerAdjustmentType" ADD VALUE 'outbound_shipping';
