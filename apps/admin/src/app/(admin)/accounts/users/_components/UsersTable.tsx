"use client";

import { useTranslations } from "next-intl";
import { ResourceList } from "@/components/list";
import { userColumns } from "../_lib/columns";
import { userRowMenu } from "../_lib/rowActions";
import { useUserActions } from "../_lib/useUserActions";

/**
 * The users table — rows come from the ResourceList context (already mapped to
 * `User` by the page fetcher); row actions go through the shared hook.
 */
export function UsersTable() {
  const t = useTranslations();
  const { runOne, busy } = useUserActions();

  const columns = userColumns(
    t,
    userRowMenu(t, { onAction: (action, u) => runOne(action, u.id), busy }),
  );

  return (
    <ResourceList.Table columns={columns} emptyText={t("admin.users.empty")} />
  );
}
