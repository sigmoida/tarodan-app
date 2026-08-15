/** @format */
import { getTranslations } from "next-intl/server";

/**
 * Read-receipt indicator. read=false → single tick (delivered); read=true →
 * blue double tick (read). Lucide-style stroke icons.
 */
export default async function MessageTicks({ read }: { read: boolean }) {
  const t = await getTranslations();
  return (
    <span
      className={`inline-flex shrink-0 ${read ? "text-primary-400" : t("page.messages.messageticks.textInverted60")}`}
      title={
        read
          ? t("page.messages.messageticks.okundu")
          : t("page.messages.messageticks.iletildi")
      }
      aria-label={
        read
          ? t("page.messages.messageticks.okundu")
          : t("page.messages.messageticks.iletildi")
      }
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke={t("page.messages.messageticks.currentcolor")}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        xmlns="http://www.w3.org/2000/svg"
      >
        {read ? (
          <>
            <path d={t("page.messages.messageticks.m186717l55")} />
            <path d={t("page.messages.messageticks.m22107575L13")} />
          </>
        ) : (
          <path d={t("page.messages.messageticks.m206917l55")} />
        )}
      </svg>
    </span>
  );
}
