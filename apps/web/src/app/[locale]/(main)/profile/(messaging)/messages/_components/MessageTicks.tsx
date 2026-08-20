/** @format */

"use client";

import { useTranslations } from "next-intl";

/**
 * Read-receipt indicator. read=false → single tick (delivered); read=true →
 * blue double tick (read). Lucide-style stroke icons.
 */
export default function MessageTicks({ read }: { read: boolean }) {
  const t = useTranslations();
  return (
    <span
      className={`inline-flex shrink-0 ${read ? "text-primary-400" : "text-inverted/60"}`}
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
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        xmlns="http://www.w3.org/2000/svg"
      >
        {read ? (
          <>
            <path d="M18 6 7 17l-5-5" />
            <path d="m22 10-7.5 7.5L13 16" />
          </>
        ) : (
          <path d="M20 6 9 17l-5-5" />
        )}
      </svg>
    </span>
  );
}
