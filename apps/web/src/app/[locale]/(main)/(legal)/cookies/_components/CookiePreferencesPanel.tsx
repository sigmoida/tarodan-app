"use client";

import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { Button, Toggle } from "@tarodan/ui";
import { useCookieConsent } from "@/hooks/useCookieConsent";
import { cookieCategories } from "@/lib/cookieConsent";

export default function CookiePreferencesPanel({
  saveLabel,
  acceptAllLabel,
}: {
  saveLabel: string;
  acceptAllLabel: string;
}) {
  const t = useTranslations();
  const { preferences, toggle, savePreferences, acceptAll } =
    useCookieConsent();

  const withToast = (action: () => void) => () => {
    action();
    toast.success(t("common.success"));
  };

  return (
    <>
      <div className="space-y-4">
        {cookieCategories(t).map((category) => (
          <div
            key={category.id}
            className="overflow-hidden rounded-xl border border-border"
          >
            <div className="flex items-start justify-between gap-4 bg-surface p-4">
              <div>
                <h3 className="font-semibold text-heading">{category.name}</h3>
                <p className="text-sm text-muted">{category.description}</p>
              </div>
              <Toggle
                label={category.name}
                checked={preferences[category.id]}
                disabled={category.required}
                onChange={() => toggle(category.id)}
                className="mt-1"
              />
            </div>
            <div className="overflow-x-auto p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="pb-2 font-medium">
                      {t("legal.cookieName")}
                    </th>
                    <th className="pb-2 font-medium">{t("legal.purpose")}</th>
                    <th className="pb-2 font-medium">{t("legal.duration")}</th>
                  </tr>
                </thead>
                <tbody className="text-body">
                  {category.cookies.map((cookie) => (
                    <tr
                      key={cookie.name}
                      className="border-t border-border-subtle"
                    >
                      <td className="py-2 font-mono text-xs">
                        {cookie.name}
                        {!cookie.active && (
                          <span className="ml-2 font-sans text-[10px] uppercase text-subtle">
                            {t("legal.cookies.inactiveTag")}
                          </span>
                        )}
                      </td>
                      <td className="py-2">{cookie.purpose}</td>
                      <td className="py-2">{cookie.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted">
        {t("legal.cookies.inactiveNote")}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={withToast(savePreferences)}>{saveLabel}</Button>
        <Button variant="secondary" onClick={withToast(acceptAll)}>
          {acceptAllLabel}
        </Button>
      </div>
    </>
  );
}
