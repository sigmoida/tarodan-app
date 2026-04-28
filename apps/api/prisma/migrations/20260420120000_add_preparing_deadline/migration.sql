-- AlterTable
ALTER TABLE "orders" ADD COLUMN "preparing_deadline" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "preparing_warning_sent_at" TIMESTAMP(3);
