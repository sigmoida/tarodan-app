-- CreateTable
CREATE TABLE "phone_verification_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phone_verification_tokens_user_id_idx" ON "phone_verification_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "phone_verification_tokens" ADD CONSTRAINT "phone_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
