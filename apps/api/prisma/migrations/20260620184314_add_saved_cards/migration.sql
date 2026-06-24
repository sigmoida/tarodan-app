-- CreateEnum
CREATE TYPE "SavedCardStatus" AS ENUM ('active', 'expired', 'revoked');

-- CreateTable
CREATE TABLE "saved_cards" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'paytr',
    "u_token" TEXT NOT NULL,
    "c_token" TEXT NOT NULL,
    "last_4" TEXT NOT NULL,
    "brand" TEXT,
    "exp_month" TEXT,
    "exp_year" TEXT,
    "require_cvv" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" "SavedCardStatus" NOT NULL DEFAULT 'active',
    "mandate_accepted_at" TIMESTAMP(3),
    "mandate_ip" TEXT,
    "mandate_terms_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saved_cards_c_token_key" ON "saved_cards"("c_token");

-- CreateIndex
CREATE INDEX "saved_cards_user_id_idx" ON "saved_cards"("user_id");

-- CreateIndex
CREATE INDEX "saved_cards_user_id_status_idx" ON "saved_cards"("user_id", "status");

-- AddForeignKey
ALTER TABLE "saved_cards" ADD CONSTRAINT "saved_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
