import {
  EyeIcon,
  CheckIcon,
  XMarkIcon,
  ArrowUturnLeftIcon,
  NoSymbolIcon,
} from "@heroicons/react/24/outline";
import type { RowActionItem } from "@/components/table";
import type { Message } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface MessageRowActions {
  onView: (m: Message) => void;
  onApprove: (m: Message) => void;
  onReject: (m: Message) => void;
  onRevert: (m: Message) => void;
  onBan: (m: Message) => void;
  busyId?: string;
}

export function messageRowMenu(a: MessageRowActions, t: T) {
  return (m: Message): RowActionItem[] => [
    { label: t("common.details"), icon: EyeIcon, onClick: () => a.onView(m) },
    (m.status === "pending" || m.status === "rejected") && {
      label: t("common.confirm"),
      icon: CheckIcon,
      onClick: () => a.onApprove(m),
      isLoading: a.busyId === m.id,
    },
    m.status === "rejected"
      ? {
          label: t("admin.messaging.messages.revert"),
          icon: ArrowUturnLeftIcon,
          onClick: () => a.onRevert(m),
          isLoading: a.busyId === m.id,
        }
      : {
          label: t("admin.messaging.messages.reject"),
          icon: XMarkIcon,
          onClick: () => a.onReject(m),
          destructive: true,
          isLoading: a.busyId === m.id,
        },
    m.senderId && {
      label: t("admin.messaging.messages.banSender"),
      icon: NoSymbolIcon,
      onClick: () => a.onBan(m),
      destructive: true,
      isLoading: a.busyId === m.id,
    },
  ];
}
