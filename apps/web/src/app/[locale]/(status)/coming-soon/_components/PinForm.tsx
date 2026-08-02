"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@tarodan/ui";
import { useTranslations } from "next-intl";

/**
 * Small PIN island (#398). POSTs the code to `/api/unlock`; the server
 * verifies it (admin-managed invite codes via the API, or the emergency env
 * fallback) and sets the signed httpOnly `site_unlock` cookie on success.
 * This is a normal form POST so `/api/unlock` owns the redirect response;
 * the browser follows it with the freshly set cookie.
 */
export default function PinForm() {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unlockStatus = new URLSearchParams(window.location.search).get(
      "unlock",
    );
    setError(
      unlockStatus === "invalid"
        ? t("utility.comingSoon.pin.invalid")
        : unlockStatus === "error"
          ? t("utility.comingSoon.pin.error")
          : unlockStatus === "rate-limited"
            ? t("utility.comingSoon.pin.rateLimited")
            : null,
    );
  }, [t]);

  return (
    <form
      action="/api/unlock"
      method="post"
      className="mb-6 flex flex-col gap-2 text-left"
      aria-label={t("utility.comingSoon.pin.label")}
    >
      <label className="text-sm text-muted" htmlFor="site-unlock-pin">
        {t("utility.comingSoon.pin.label")}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="site-unlock-pin"
          name="pin"
          type="password"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={128}
          placeholder={t("utility.comingSoon.pin.placeholder")}
          className="flex-1"
          required
        />
        <Button variant="primary" type="submit">
          {t("utility.comingSoon.pin.submit")}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-danger-600" role="alert" aria-live="polite">
          {error}
        </p>
      )}
    </form>
  );
}
