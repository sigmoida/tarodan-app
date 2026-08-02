/** @format */

"use client";

import { useTranslations } from "next-intl";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { MediaBrowser } from "./_components/MediaBrowser";

/**
 * Medya — bucket klasör düzeninin read-only takibi (Faz 3). Klasör ağacı,
 * dosyalar, her dosyanın hangi kayda bağlı olduğu (sahipsizler ayırt edilir).
 * Veri /admin/media/browse'tan gelir; silme/yükleme bilinçli olarak yok (v2).
 */
export default function MediaPage() {
  const t = useTranslations();
  return (
    <AdminPage>
      <PageHeader
        title={t("admin.system.media.title")}
        description={t("admin.system.media.subtitle")}
      />
      <MediaBrowser />
    </AdminPage>
  );
}
