/** @format */

"use client";

import { useState } from "react";
import { ClipboardDocumentIcon, CheckIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { useTranslations } from "next-intl";

interface CopyButtonProps {
  /** Text written to the clipboard. */
  value: string;
  className?: string;
}

/**
 * Small icon button that copies `value` to the clipboard and briefly flips to a
 * check to confirm. Built on the shared `Button` (ghost). Reusable anywhere a
 * value should be copyable (tracking numbers, codes, IBANs…).
 */
export function CopyButton({ value, className }: CopyButtonProps) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — nothing to do */
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`h-7 w-7 p-0 ${className ?? ""}`.trim()}
      onClick={onCopy}
      aria-label={t("common.copy")}
      title={t("common.copy")}
    >
      {copied ? (
        <CheckIcon className="h-4 w-4 text-success-600" />
      ) : (
        <ClipboardDocumentIcon className="h-4 w-4 text-muted" />
      )}
    </Button>
  );
}
