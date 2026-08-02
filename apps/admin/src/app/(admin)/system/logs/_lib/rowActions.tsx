import { CheckCircleIcon, NoSymbolIcon } from "@heroicons/react/24/outline";
import type { RowActionItem } from "@/components/table";
import type { SecurityLog } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Row menu for a security log.
 *  - Çözme yalnız çözülmemiş olaylarda; artık opsiyonel NOT alır (API zaten
 *    kabul ediyordu, UI hiç göndermiyordu — gerekçe kaydedilemiyordu).
 *  - "IP Engelle" yalnız super_admin'e (uç @Roles(super_admin)) ve IP'si olan,
 *    kendisi zaten bir engel kaydı olmayan satırlarda görünür. Engel gerçek:
 *    BlockedIpGuard çözülmemiş ip_block kayıtlarını uygular; kaldırmak = çözmek.
 */
export function securityRowMenu(
  onResolve: (row: SecurityLog) => void,
  t: T,
  resolvingId?: string,
  opts?: { canBlockIp?: boolean; onBlockIp?: (row: SecurityLog) => void },
) {
  return (r: SecurityLog): RowActionItem[] => [
    !r.resolved && {
      label: t("admin.system.logs.resolve"),
      icon: CheckCircleIcon,
      onClick: () => onResolve(r),
      isLoading: resolvingId === r.id,
    },
    !!opts?.canBlockIp &&
      !!opts.onBlockIp &&
      !!r.ipAddress &&
      r.eventType !== "ip_block" && {
        label: t("admin.system.logs.blockIp"),
        icon: NoSymbolIcon,
        destructive: true,
        onClick: () => opts.onBlockIp!(r),
      },
  ];
}
