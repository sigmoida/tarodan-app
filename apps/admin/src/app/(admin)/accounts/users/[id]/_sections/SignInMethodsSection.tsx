"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@tarodan/ui";
import type { AdminSignInMethodEvent, SignInMethods } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { usePermissions } from "@/context/PermissionsContext";
import { useAdminItem } from "@/hooks/useAdminItem";
import { DataTable } from "@/components/DataTable";
import { ResourceList } from "@/components/list";
import { SectionCard } from "@/components/detail/SectionCard";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { DataList, Field } from "@/components/detail/DataList";
import { SuspenseBoundary } from "@/components/page/SuspenseBoundary";
import {
  linkedProviderColumns,
  signInMethodEventColumns,
} from "../_lib/signInMethodColumns";

/** Query resources of the section (keys through `adminKeys`). */
export const SIGN_IN_METHODS_RESOURCE = "user-sign-in-methods";
export const SIGN_IN_METHOD_EVENTS_RESOURCE = "user-sign-in-method-events";

/**
 * The user's sign-in methods (password yes or no, linked providers) and the
 * history of their sign-in method events. Two queries with their own load and
 * error states, so a failing history still shows the methods.
 *
 * Only with the `users` permission: the API answers 403 to a role that opens
 * the user detail through `seller_performance` alone.
 */
export function SignInMethodsSection({ userId }: { userId: string }) {
  const t = useTranslations();
  const { can } = usePermissions();
  if (!can("users")) return null;

  return (
    <SectionCard
      title={t("admin.users.signInMethods.title")}
      bodyClassName="space-y-6"
    >
      <SuspenseBoundary errorTitle={t("admin.users.signInMethods.loadError")}>
        <SignInMethodsSummary userId={userId} />
      </SuspenseBoundary>
      <div className="space-y-3">
        <SectionTitle as="h3" size="sm">
          {t("admin.users.signInMethods.history")}
        </SectionTitle>
        <SignInMethodHistory userId={userId} />
      </div>
    </SectionCard>
  );
}

function SignInMethodsSummary({ userId }: { userId: string }) {
  const t = useTranslations();
  const columns = useMemo(() => linkedProviderColumns(t), [t]);
  const { item } = useAdminItem<SignInMethods>({
    resource: SIGN_IN_METHODS_RESOURCE,
    id: userId,
    fetcher: (id) => adminApi.getUserSignInMethods(id).then((r) => r.data),
  });

  // 404: the user is gone (deleted since the detail loaded).
  if (!item) {
    return (
      <Alert variant="danger">{t("admin.users.signInMethods.loadError")}</Alert>
    );
  }

  return (
    <div className="space-y-4">
      <DataList columns={1}>
        <Field label={t("admin.users.signInMethods.password")}>
          {item.hasPassword
            ? t("admin.users.signInMethods.passwordSet")
            : t("admin.users.signInMethods.passwordNotSet")}
        </Field>
      </DataList>
      <div className="space-y-3">
        <SectionTitle as="h3" size="sm">
          {t("admin.users.signInMethods.providers")}
        </SectionTitle>
        <DataTable
          columns={columns}
          data={item.providers}
          getRowId={(p) => p.provider}
          emptyText={t("admin.users.signInMethods.noProviders")}
          dense
        />
      </div>
    </div>
  );
}

function SignInMethodHistory({ userId }: { userId: string }) {
  const t = useTranslations();
  const columns = useMemo(() => signInMethodEventColumns(t), [t]);
  return (
    <ResourceList<AdminSignInMethodEvent>
      resource={SIGN_IN_METHOD_EVENTS_RESOURCE}
      scope={{ userId }}
      fetcher={({ page, limit }) =>
        adminApi.getUserSignInMethodEvents(userId, { page, limit })
      }
      getRowId={(e) => e.id}
      errorTitle={t("admin.users.signInMethods.historyLoadError")}
    >
      <ResourceList.Table
        columns={columns}
        emptyText={t("admin.users.signInMethods.historyEmpty")}
        dense
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
