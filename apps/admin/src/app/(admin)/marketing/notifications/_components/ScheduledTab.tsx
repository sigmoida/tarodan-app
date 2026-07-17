"use client";

import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { scheduledColumns } from "../_lib/columns";
import { type ScheduledNotification } from "../_lib/types";

export function ScheduledTab() {
  const confirm = useConfirm();
  const cancel = useAdminMutation(
    (id: string) => adminApi.cancelScheduledNotification(id),
    {
      invalidates: ["scheduled-notifications"],
      successMessage: "Bildirim iptal edildi",
    },
  );

  const onCancel = async (id: string) => {
    if (
      await confirm({
        description: "Bu zamanlanmış bildirimi iptal etmek istiyor musunuz?",
        destructive: true,
      })
    )
      cancel.mutate(id);
  };

  return (
    <ResourceList<ScheduledNotification>
      resource="scheduled-notifications"
      fetcher={(params) =>
        adminApi.getScheduledNotifications({ ...params, status: "pending" })
      }
      getRowId={(n) => n.id}
      errorMessage="Zamanlanmış bildirimler yüklenemedi"
    >
      <ResourceList.Table
        columns={scheduledColumns(onCancel)}
        emptyText="Zamanlanmış bildirim yok"
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
