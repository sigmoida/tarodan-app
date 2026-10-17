import { useTranslations } from "next-intl";
import { Badge } from "@tarodan/ui";

/** AI moderation result pill — shared between the queue and the image tester. */
export function AiBadge({ state }: { state: "flagged" | "review" | "passed" }) {
  const t = useTranslations();
  const CONFIG = {
    flagged: ["danger", t("admin.aiModeration.badge.flagged")],
    review: ["warning", t("admin.aiModeration.badge.review")],
    passed: ["success", t("admin.aiModeration.badge.passed")],
  } as const;
  const [variant, label] = CONFIG[state];
  return (
    <Badge variant={variant} size="sm">
      {label}
    </Badge>
  );
}
