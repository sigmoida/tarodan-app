import {
  EyeIcon,
  CheckIcon,
  XMarkIcon,
  ArrowUturnLeftIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import type { RowActionItem } from "@/components/table";
import type { Product } from "./types";

type T = ReturnType<typeof useTranslations<never>>;

export interface ProductRowActions {
  onView: (p: Product) => void;
  onApprove: (p: Product) => void;
  onReject: (p: Product) => void;
  onDelete: (p: Product) => void;
  onRestore: (p: Product) => void;
}

/** ⋮ row-menu items for a product — status-gated; destructive ones grouped last. */
export function productRowMenu(t: T, a: ProductRowActions) {
  return (p: Product): RowActionItem[] => [
    {
      label: t("admin.catalog.products.detail"),
      icon: EyeIcon,
      onClick: () => a.onView(p),
    },
    p.status === "pending" && {
      label: t("admin.catalog.products.approve"),
      icon: CheckIcon,
      onClick: () => a.onApprove(p),
    },
    p.status === "pending" && {
      label: t("admin.catalog.products.reject"),
      icon: XMarkIcon,
      onClick: () => a.onReject(p),
      destructive: true,
    },
    p.status === "deleted" && {
      label: t("admin.catalog.products.restore"),
      icon: ArrowUturnLeftIcon,
      onClick: () => a.onRestore(p),
    },
    p.status !== "deleted" &&
      p.status !== "sold" &&
      p.status !== "reserved" && {
        label: t("common.remove"),
        icon: TrashIcon,
        onClick: () => a.onDelete(p),
        destructive: true,
      },
  ];
}
