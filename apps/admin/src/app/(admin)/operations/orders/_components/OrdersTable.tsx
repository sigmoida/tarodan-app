"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { AdminOrderListRow } from "@tarodan/types";
import { DataTable } from "@/components/DataTable";
import { useResourceList } from "@/components/list";
import { useSession } from "@/context/SessionContext";
import { orderColumns } from "../_lib/columns";
import { orderRowMenu, type OrderRowModal } from "../_lib/rowActions";
import { StatusUpdateModal } from "../[id]/_modals/StatusUpdateModal";
import { AddTrackingModal } from "../[id]/_modals/AddTrackingModal";

/**
 * Sipariş tablosu: satır = sepet (API zaten sepet satırı döner, sayfada
 * eşleme yok). Satır menüsünün modalları sipariş dosyasındakilerin aynısıdır;
 * sayfa yalnız hangisinin açık olduğunu tutar.
 */
export function OrdersTable() {
  const t = useTranslations();
  const router = useRouter();
  const { user } = useSession();
  const canManage = user.role === "super_admin" || user.role === "admin";
  const { rows, isLoading, search, filters, sort, setSort } =
    useResourceList<AdminOrderListRow>();
  const [modal, setModal] = useState<OrderRowModal | null>(null);

  const columns = useMemo(
    () =>
      orderColumns({
        t,
        rowMenu: orderRowMenu(
          { open: (href) => router.push(href), openModal: setModal, canManage },
          t,
        ),
      }),
    [t, router, canManage],
  );

  const filtered =
    !!search ||
    Object.values(filters).some((value) => value && value !== "all");

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        emptyText={
          filtered
            ? t("admin.operations.orders.emptyFiltered")
            : t("admin.operations.orders.empty")
        }
        getRowId={(row) => `${row.kind}:${row.id}`}
        sort={sort}
        onSort={setSort}
      />
      <StatusUpdateModal
        open={modal?.type === "status"}
        onClose={() => setModal(null)}
        orderId={modal?.orderId ?? ""}
        currentStatus={modal?.type === "status" ? modal.status : ""}
      />
      <AddTrackingModal
        key={modal?.type === "tracking" ? modal.orderId : "tracking"}
        open={modal?.type === "tracking"}
        onClose={() => setModal(null)}
        orderId={modal?.orderId ?? ""}
      />
    </>
  );
}
