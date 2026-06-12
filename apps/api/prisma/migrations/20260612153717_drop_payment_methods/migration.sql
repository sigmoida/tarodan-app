-- DropForeignKey
ALTER TABLE "payment_methods" DROP CONSTRAINT "payment_methods_user_id_fkey";

-- AlterTable
ALTER TABLE "user_memberships" DROP COLUMN "payment_method_id";

-- DropTable
DROP TABLE "payment_methods";
