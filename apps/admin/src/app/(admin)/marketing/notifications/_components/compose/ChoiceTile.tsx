import type { ComponentType } from "react";
import clsx from "clsx";
import { Button } from "@tarodan/ui";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

/**
 * Seçilebilir kutucuk (kanal, tür, hedef, zaman). `aria-pressed` ile seçili
 * durumu ekran okuyucuya da söyler; çoklu (kanal) ve tekli seçim aynı görünür.
 */
export function ChoiceTile({
  active,
  icon: Icon,
  label,
  desc,
  onClick,
}: {
  active: boolean;
  icon?: ComponentType<{ className?: string }>;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        "relative h-auto w-full flex-col items-start gap-1 whitespace-normal rounded-xl border-2 p-3 text-left",
        active
          ? "border-primary-500 bg-primary-50 text-primary-700"
          : "border-border bg-surface text-muted hover:border-border-strong hover:text-body",
      )}
    >
      {active && (
        <CheckCircleIcon className="absolute right-2 top-2 h-4 w-4 text-primary-500" />
      )}
      <span className="flex items-center gap-2 pr-5 text-sm font-medium">
        {Icon && (
          <Icon
            className={clsx(
              "h-5 w-5 shrink-0",
              active ? "text-primary-500" : "text-subtle",
            )}
          />
        )}
        {label}
      </span>
      <span
        className={clsx(
          "text-xs font-normal leading-snug",
          active ? "text-primary-600" : "text-muted",
        )}
      >
        {desc}
      </span>
    </Button>
  );
}
