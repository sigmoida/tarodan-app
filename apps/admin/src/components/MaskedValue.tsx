"use client";

import { useState } from "react";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { IconButton } from "@tarodan/ui";
import { cn } from "@/lib/utils";

/**
 * Sensitive personal data (IBAN, TC Kimlik No) hidden by default; a toggle
 * reveals the raw value on demand instead of rendering it in the clear on
 * every visit to a high-traffic detail page (screen-share / shoulder-surfing
 * exposure). The masked form doesn't reveal the value's length.
 */
export function MaskedValue({
  value,
  tailLength = 4,
  className,
}: {
  value: string;
  tailLength?: number;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const tail = value.slice(-tailLength);

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="font-mono text-heading">
        {revealed ? value : `•••• •••• ${tail}`}
      </span>
      <IconButton
        variant="ghost"
        size="xs"
        aria-label={revealed ? "Hide value" : "Show value"}
        onClick={() => setRevealed((r) => !r)}
      >
        {revealed ? (
          <EyeSlashIcon className="h-3.5 w-3.5" />
        ) : (
          <EyeIcon className="h-3.5 w-3.5" />
        )}
      </IconButton>
    </span>
  );
}
