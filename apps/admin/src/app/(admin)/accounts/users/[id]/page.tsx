"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { StarIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { Alert, Badge, Button, accountStatusConfig } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { statusConfig } from "@/lib/statusLabels";
import { DetailPage } from "@/components/detail/DetailPage";
import { type UserDetail } from "./types";
import { UserStats } from "./_sections/UserStats";
import { UserInfoSection } from "./_sections/UserInfoSection";
import { MembershipSection } from "./_sections/MembershipSection";
import { UserActivityTabs } from "./_sections/UserActivityTabs";
import { UserSidebar } from "./_sections/UserSidebar";
import { actionsFor, type UserAccountAction } from "../_lib/bulkEligibility";
import {
  ACTION_LABEL_KEY,
  isActionBusy,
  useUserActions,
} from "../_lib/useUserActions";

const ACTION_VARIANT: Record<
  UserAccountAction,
  "outline" | "success" | "danger"
> = {
  resend: "outline",
  verify: "outline",
  ban: "danger",
  unban: "success",
  delete: "danger",
};

export default function UserDetailPage() {
  const t = useTranslations();
  const { id } = useParams<{ id: string }>();
  const { runOne, busy } = useUserActions();
  const accountStatus = statusConfig(accountStatusConfig, t);

  return (
    <DetailPage<UserDetail>
      resource="users"
      id={id}
      fetcher={(uid) => adminApi.getUser(uid).then((r) => r.data)}
      backHref="/accounts/users"
      emptyTitle={t("admin.users.empty")}
      title={(u) => u.displayName}
      subtitle={(u) => (
        <span className="flex flex-wrap items-center gap-2">
          {u.email}
          {u.averageRating != null && (
            <span className="inline-flex items-center gap-1 text-warning-500">
              <StarIcon className="h-4 w-4 fill-warning-500" />
              {u.averageRating}
              <span className="text-muted">
                {t("admin.users.detail.ratingsCount", {
                  count: u.stats?.receivedRatingsCount || 0,
                })}
              </span>
            </span>
          )}
        </span>
      )}
      // Liste ile aynı türetim: rozet ve aksiyonlar hesap durumundan gelir.
      badge={(u) => <Badge status={u.accountStatus} config={accountStatus} />}
      // Personel hesabında kullanıcı aksiyonları yok (Personel ekranı yönetir).
      actions={(u) =>
        u.staff ? undefined : (
          <div className="flex flex-wrap items-center gap-2">
            {actionsFor(u).map((action) => (
              <Button
                key={action}
                variant={ACTION_VARIANT[action]}
                onClick={() => runOne(action, u.id)}
                isLoading={isActionBusy(busy, u.id, action)}
              >
                {t(ACTION_LABEL_KEY[action])}
              </Button>
            ))}
          </div>
        )
      }
    >
      {(u) => (
        <>
          {u.staff && (
            <Alert variant="warning" className="mb-4">
              {t("admin.users.staffAccountNotice", { role: u.staff.role })}{" "}
              <Link href="/accounts/roles" className="font-medium underline">
                {t("admin.users.staffAccountLink")}
              </Link>
            </Alert>
          )}
          {u.stats && <UserStats stats={u.stats} />}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <UserInfoSection user={u} />
              <MembershipSection userId={u.id} membership={u.membership} />
              <UserActivityTabs userId={u.id} user={u} />
            </div>
            <div className="space-y-6">
              <UserSidebar user={u} />
            </div>
          </div>
        </>
      )}
    </DetailPage>
  );
}
