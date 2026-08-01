"use client";

import { useTranslations } from "next-intl";
import { Alert, Button } from "@tarodan/ui";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ModerationEventsPanel } from "@/components/ModerationEventsPanel";
import { AiThresholdsCard } from "./_components/AiThresholdsCard";
import { ImageTestCard } from "./_components/ImageTestCard";
import { useAiModerationConfig } from "./_lib/useAiModerationConfig";

export default function AiModerationPage() {
  const t = useTranslations();
  const { config, isLoading, isError, isRetrying, retry } =
    useAiModerationConfig();

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.aiModeration.page.title")}
        description={t("admin.aiModeration.page.description")}
      />

      {/* "Okunamadı" ile "kapalı" AYRI durumlardır — ikincisi ancak config
          gerçekten okunduysa bilinebilir. */}
      {isError ? (
        <Alert variant="danger">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t("admin.aiModeration.page.configLoadError")}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void retry()}
              isLoading={isRetrying}
            >
              {t("admin.shared.suspense.retry")}
            </Button>
          </div>
        </Alert>
      ) : (
        config?.enabled === false && (
          <Alert variant="warning">
            {t("admin.aiModeration.page.disabledWarning")}
          </Alert>
        )
      )}

      <ImageTestCard />
      <AiThresholdsCard
        config={config}
        isLoading={isLoading}
        isError={isError}
      />

      <ModerationEventsPanel
        showEntityColumn
        title={t("admin.aiModeration.page.logTitle")}
        description={t("admin.aiModeration.page.logDescription")}
      />
    </AdminPage>
  );
}
