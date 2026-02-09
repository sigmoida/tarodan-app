-- CreateTable
CREATE TABLE "static_pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "meta_keywords" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "static_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "variables_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "static_pages_slug_key" ON "static_pages"("slug");

-- CreateIndex
CREATE INDEX "static_pages_slug_idx" ON "static_pages"("slug");

-- CreateIndex
CREATE INDEX "static_pages_is_published_idx" ON "static_pages"("is_published");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_key_key" ON "email_templates"("key");
