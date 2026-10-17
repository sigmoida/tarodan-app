import { BellIcon, LinkIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";

interface NotificationPreviewProps {
  title: string;
  body: string;
  /** Opsiyonel hedef link (site içi yol); dokununca açılacak sayfa ipucu. */
  link?: string;
}

/** Uygulama simgesi — harici görsel yok, token renkleriyle çizilir. */
function AppIcon({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <div
      className={
        size === "sm"
          ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary-500"
          : "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500"
      }
    >
      <BellIcon
        className={
          size === "sm" ? "h-3 w-3 text-inverted" : "h-5 w-5 text-inverted"
        }
      />
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return <span className="font-normal italic text-subtle">{text}</span>;
}

/**
 * Push bildiriminin telefon kilit ekranı görünümlü canlı önizlemesi (açık
 * tema, yalnız token renkleri). Başlık/içerik boşken ipucu metni gösterilir.
 */
export function PushPreview({ title, body, link }: NotificationPreviewProps) {
  const t = useTranslations();
  const trimmedLink = link?.trim();
  return (
    <div
      data-testid="push-preview-phone"
      className="mx-auto w-full max-w-[320px] rounded-[2.5rem] border-[6px] border-heading/80 bg-surface-alt p-3 shadow-elevated"
    >
      {/* Çentik + saat: yalnız telefon hissi için. */}
      <div className="mx-auto mb-6 h-5 w-24 rounded-full bg-heading/80" />
      <p className="text-center text-4xl font-light tracking-tight text-heading">
        09:41
      </p>
      <p className="mb-6 text-center text-xs text-muted">
        {t("admin.marketing.notifications.preview.lockScreen")}
      </p>
      <div
        data-testid="push-preview-card"
        className="rounded-2xl border border-border bg-surface-elevated p-3 shadow-sm"
      >
        <div className="mb-1.5 flex items-center gap-2">
          <AppIcon size="sm" />
          <span className="flex-1 text-xs font-medium uppercase tracking-wide text-muted">
            {t("admin.marketing.notifications.preview.appName")}
          </span>
          <span className="shrink-0 text-xs text-subtle">
            {t("admin.marketing.notifications.now")}
          </span>
        </div>
        <p className="truncate text-sm font-semibold text-heading">
          {title || (
            <Placeholder text={t("admin.marketing.notifications.enterTitle")} />
          )}
        </p>
        <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-body">
          {body || (
            <Placeholder
              text={t("admin.marketing.notifications.enterContent")}
            />
          )}
        </p>
      </div>
      <p className="mt-3 flex items-center justify-center gap-1 px-2 pb-2 text-center text-xs text-muted">
        <LinkIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {trimmedLink
            ? t("admin.marketing.notifications.preview.linkHint", {
                link: trimmedLink,
              })
            : t("admin.marketing.notifications.preview.noLinkHint")}
        </span>
      </p>
    </div>
  );
}

/** Zil (bildirim kutusu) satırı önizlemesi — web/mobil listede görünen satır. */
export function InAppPreview({ title, body }: NotificationPreviewProps) {
  const t = useTranslations();
  return (
    <div
      data-testid="in-app-preview"
      className="overflow-hidden rounded-xl border border-border bg-surface-elevated"
    >
      <p className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
        {t("admin.marketing.notifications.preview.bellTitle")}
      </p>
      <div className="flex items-start gap-3 bg-primary-50 px-4 py-3">
        <AppIcon />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-heading">
            {title || (
              <Placeholder
                text={t("admin.marketing.notifications.enterTitle")}
              />
            )}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs text-body">
            {body || (
              <Placeholder
                text={t("admin.marketing.notifications.enterContent")}
              />
            )}
          </p>
          <p className="mt-1 text-xs text-subtle">
            {t("admin.marketing.notifications.now")}
          </p>
        </div>
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500" />
      </div>
    </div>
  );
}
