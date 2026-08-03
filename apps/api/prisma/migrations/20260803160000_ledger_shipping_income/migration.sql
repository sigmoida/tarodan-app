-- Takas v2: kargo bedeli platformda kalır ama KOMİSYON GELİRİ DEĞİLDİR (taşıyıcıya
-- ödenen geçiş kalemi). Kendi hesabına yazılır ki gelir raporu kargoyu gelir sanmasın.
ALTER TYPE "LedgerAccount" ADD VALUE 'shipping_income';
