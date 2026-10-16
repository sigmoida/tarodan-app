import { BellIcon, DevicePhoneMobileIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";

/**
 * Push bildiriminin telefon bildirimi görünümlü canlı önizlemesi (açık tema).
 * Başlık/içerik boşken ipucu metni gösterilir.
 */
export function PushPreview({ title, body }: { title: string; body: string }) {
  const t = useTranslations();
  return (
    <div>
      <p className="mb-2 flex items-center gap-1 text-xs text-muted">
        <DevicePhoneMobileIcon className="h-3.5 w-3.5" /> Push
        {t("admin.marketing.notifications.notificationSuffix")}
      </p>
      <div
        data-testid="push-preview-card"
        className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500">
            <BellIcon className="h-5 w-5 text-inverted" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-heading">
              {title || (
                <span className="font-normal italic text-subtle">
                  {t("admin.marketing.notifications.enterTitle")}
                </span>
              )}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">
              {body || (
                <span className="italic">
                  {t("admin.marketing.notifications.enterContent")}
                </span>
              )}
            </p>
          </div>
          <span className="shrink-0 text-xs text-subtle">
            {t("admin.marketing.notifications.now")}
          </span>
        </div>
      </div>
    </div>
  );
}
