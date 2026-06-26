-- İPTAL (kargo öncesi) vs İADE (kargo sonrası) raporlama ayrımı.
CREATE TYPE "OrderCancellationType" AS ENUM ('iptal', 'iade');
ALTER TABLE "orders" ADD COLUMN "cancellation_type" "OrderCancellationType";
