"use client";

import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { useRolesPage } from "./_lib/useRolesPage";
import { PermissionMatrixTab } from "./_components/PermissionMatrixTab";
import { StaffAssignmentsTab } from "./_components/StaffAssignmentsTab";

export default function RolesPage() {
  const { t, tab, setTab, tabs, showMatrix } = useRolesPage();

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.roles.title")}
        description={t("admin.roles.description")}
      />
      <AdminTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "users" ? (
        <StaffAssignmentsTab onShowMatrix={showMatrix} />
      ) : (
        <PermissionMatrixTab />
      )}
    </AdminPage>
  );
}
