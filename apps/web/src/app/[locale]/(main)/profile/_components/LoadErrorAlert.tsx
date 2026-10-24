"use client";

import { useTranslations } from "next-intl";
import { Alert, Button } from "@tarodan/ui";

/** A section whose data did not load, with the one action that fixes it. */
export default function LoadErrorAlert({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations();
  return (
    <Alert
      variant="danger"
      action={
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {t("common.tryAgain")}
        </Button>
      }
    >
      {t("error.somethingWrongDesc")}
    </Alert>
  );
}
