import {
  NoSymbolIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  CheckBadgeIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import type { RowActionItem } from "@/components/table";
import type { User } from "./types";
import { actionsFor, type UserAccountAction } from "./bulkEligibility";
import {
  ACTION_LABEL_KEY,
  isActionBusy,
  type UserActionBusy,
} from "./useUserActions";

type T = ReturnType<typeof useTranslations<never>>;

export interface UserRowActions {
  onAction: (action: UserAccountAction, u: User) => void;
  busy?: UserActionBusy;
}

const ICONS: Record<UserAccountAction, typeof NoSymbolIcon> = {
  resend: EnvelopeIcon,
  verify: CheckBadgeIcon,
  ban: NoSymbolIcon,
  unban: CheckCircleIcon,
  delete: TrashIcon,
};

/**
 * Satır menüsü hesap durumuna (ve silme için giriş geçmişine) göre kurulur;
 * silinmiş hesapta boş kalır.
 */
export function userRowMenu(t: T, { onAction, busy }: UserRowActions) {
  return (u: User): RowActionItem[] =>
    actionsFor(u).map((action) => ({
      label: t(ACTION_LABEL_KEY[action]),
      icon: ICONS[action],
      onClick: () => onAction(action, u),
      destructive: action === "ban" || action === "delete",
      isLoading: isActionBusy(busy, u.id, action),
    }));
}
