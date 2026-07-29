import { CheckCircleIcon } from "@heroicons/react/24/outline";
import type { RowActionItem } from "@/components/table";
import type { SecurityLog } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** Row menu for a security log — only unresolved events expose the resolve action. */
export function securityRowMenu(
  onResolve: (id: string) => void,
  t: T,
  resolvingId?: string,
) {
  return (r: SecurityLog): RowActionItem[] => [
    !r.resolved && {
      label: t("admin.system.logs.resolve"),
      icon: CheckCircleIcon,
      onClick: () => onResolve(r.id),
      isLoading: resolvingId === r.id,
    },
  ];
}
