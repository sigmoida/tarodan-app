import {
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import type { RowActionItem } from "@/components/table";
import { type Application } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface ApplicationRowActions {
  expandedId: string | null;
  onToggleExpand: (a: Application) => void;
  onApprove: (a: Application) => void;
  onReject: (a: Application) => void;
  busyId?: string;
}

export function applicationRowMenu(
  {
    expandedId,
    onToggleExpand,
    onApprove,
    onReject,
    busyId,
  }: ApplicationRowActions,
  t: T,
) {
  return (a: Application): RowActionItem[] => [
    {
      label:
        expandedId === a.id
          ? t("admin.accounts.sellerApplications.hideDetails")
          : t("admin.accounts.sellerApplications.showDetails"),
      icon: EyeIcon,
      onClick: () => onToggleExpand(a),
    },
    a.businessStatus === "pending" && {
      label: t("common.confirm"),
      icon: CheckCircleIcon,
      onClick: () => onApprove(a),
      isLoading: busyId === a.id,
    },
    a.businessStatus === "pending" && {
      label: t("admin.accounts.sellerApplications.reject"),
      icon: XCircleIcon,
      onClick: () => onReject(a),
      destructive: true,
      isLoading: busyId === a.id,
    },
  ];
}
