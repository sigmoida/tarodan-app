"use client";

import { useState } from "react";
import { Button, Input } from "@tarodan/ui";
import { useTranslations } from "next-intl";

/**
 * Small PIN island (#398). POSTs the code to `/api/unlock`; the server
 * verifies it against `SITE_UNLOCK_PIN` and sets the httpOnly `site_unlock`
 * cookie on success. On 200 we hard-navigate to `/` so the next request goes
 * through the middleware — cookie now matches → gate opens.
 */
export default function PinForm() {
  const t = useTranslations();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pin.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (response.ok) {
        window.location.assign("/");
        return;
      }
      setError(
        response.status === 401
          ? t("utility.comingSoon.pin.invalid")
          : t("utility.comingSoon.pin.error"),
      );
    } catch {
      setError(t("utility.comingSoon.pin.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 flex flex-col gap-2 text-left"
      aria-label={t("utility.comingSoon.pin.label")}
    >
      <label className="text-sm text-muted" htmlFor="site-unlock-pin">
        {t("utility.comingSoon.pin.label")}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="site-unlock-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder={t("utility.comingSoon.pin.placeholder")}
          className="flex-1"
          disabled={submitting}
        />
        <Button
          variant="primary"
          type="submit"
          disabled={submitting || !pin.trim()}
        >
          {t("utility.comingSoon.pin.submit")}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-danger-600" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
