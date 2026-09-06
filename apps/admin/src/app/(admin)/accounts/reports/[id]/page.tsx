"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowTopRightOnSquareIcon,
  NoSymbolIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, productStatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { statusLabel } from "@/lib/statusLabels";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { usePrompt } from "@/provider/PromptProvider";
import { DetailPage } from "@/components/detail/DetailPage";
import { SectionCard } from "@/components/detail/SectionCard";
import { PartyCard } from "@/components/detail/PartyCard";
import { Timeline } from "@/components/detail/Timeline";
import { DataList, Field } from "@/components/detail/DataList";
import {
  reportReasonLabels,
  reportStatusConfig,
  reportTypeLabels,
} from "../_lib/types";
import { targetHref, type ReportDetail } from "../_lib/detail";
import { ReportStatusModal } from "./_modals/ReportStatusModal";

export default function ReportDetailPage() {
  const t = useTranslations();
  const prompt = usePrompt();
  const { id } = useParams<{ id: string }>();
  const [statusOpen, setStatusOpen] = useState(false);

  const typeLabels = reportTypeLabels(t);
  const reasonLabels = reportReasonLabels(t);

  // Şikayeti kapatmadan hedefe müdahale: admin başka ekrana gitmek zorunda
  // kalmasın. Gerekçe ilgili tarafa (satıcıya / kullanıcıya) iletilir.
  const removeListing = useAdminMutation(
    (input: { productId: string; reason: string }) =>
      adminApi.rejectProduct(input.productId, input.reason),
    {
      invalidates: ["reports", "products"],
      successMessage: t("admin.reports.actions.listingRemoved"),
    },
  );

  const banUser = useAdminMutation(
    (input: { userId: string; reason: string }) =>
      adminApi.banUser(input.userId, input.reason),
    {
      invalidates: ["reports", "users"],
      successMessage: t("admin.reports.actions.userBanned"),
    },
  );

  const askAndRun = async (
    title: string,
    run: (reason: string) => void,
  ): Promise<void> => {
    const reason = await prompt({ title, label: title, maxLength: 500 });
    if (reason) run(reason);
  };

  return (
    <DetailPage<ReportDetail>
      resource="reports"
      id={id}
      fetcher={(reportId) =>
        adminApi.getUserReportById(reportId).then((r) => r.data as ReportDetail)
      }
      backHref="/accounts/reports"
      emptyTitle={t("admin.reports.detail.notFound")}
      title={(report) =>
        `${typeLabels[report.type] ?? report.type} — ${
          reasonLabels[report.reason] ?? report.reason
        }`
      }
      subtitle={(report) => report.reporter?.displayName}
      badge={(report) => (
        <Badge status={report.status} config={reportStatusConfig(t)} />
      )}
      actions={() => (
        <Button
          variant="primary"
          leftIcon={<PencilSquareIcon className="h-5 w-5" />}
          onClick={() => setStatusOpen(true)}
        >
          {t("admin.reports.actions.updateStatus")}
        </Button>
      )}
    >
      {(report) => {
        const href = targetHref(report);
        const target = report.target;
        return (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <SectionCard title={t("admin.reports.detail.reportInfo")}>
                  <DataList columns={2}>
                    <Field label={t("admin.reports.columns.type")}>
                      {typeLabels[report.type] ?? report.type}
                    </Field>
                    <Field label={t("admin.reports.columns.reason")}>
                      {reasonLabels[report.reason] ?? report.reason}
                    </Field>
                  </DataList>
                  <p className="mt-4 text-sm font-medium text-muted">
                    {t("admin.reports.detail.userDescription")}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-body">
                    {report.description || (
                      <span className="text-subtle">
                        {t("admin.reports.detail.noDescription")}
                      </span>
                    )}
                  </p>
                </SectionCard>

                <SectionCard
                  title={t("admin.reports.detail.targetTitle")}
                  actions={
                    href ? (
                      <Link
                        href={href}
                        className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline"
                      >
                        {t("admin.reports.detail.openTarget")}
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                      </Link>
                    ) : undefined
                  }
                >
                  {!target || target.deleted ? (
                    <p className="text-sm text-subtle">
                      {t("admin.reports.detail.targetDeleted")}
                    </p>
                  ) : (
                    <>
                      <DataList columns={2}>
                        {report.type === "product" && (
                          <>
                            <Field label={t("common.title")}>
                              {target.title}
                            </Field>
                            <Field
                              label={t("admin.reports.detail.listingStatus")}
                            >
                              {statusLabel(
                                productStatusConfig,
                                target.status,
                                t,
                              )}
                            </Field>
                            <Field
                              label={t("admin.reports.detail.sellerLabel")}
                            >
                              {target.seller && (
                                <Link
                                  href={`/accounts/users/${target.seller.id}`}
                                  className="text-primary-600 hover:underline"
                                >
                                  {target.seller.displayName}
                                </Link>
                              )}
                            </Field>
                          </>
                        )}
                        {report.type === "user" && (
                          <>
                            <Field label={t("common.name")}>
                              {target.displayName}
                            </Field>
                            <Field label={t("common.email")}>
                              {target.email}
                            </Field>
                            <Field
                              label={t("admin.reports.detail.accountStatus")}
                            >
                              {target.isBanned
                                ? t("admin.reports.detail.banned")
                                : t("admin.reports.detail.active")}
                            </Field>
                          </>
                        )}
                        {report.type === "collection" && (
                          <>
                            <Field label={t("common.name")}>
                              {target.name}
                            </Field>
                            <Field label={t("admin.reports.detail.ownerLabel")}>
                              {target.user && (
                                <Link
                                  href={`/accounts/users/${target.user.id}`}
                                  className="text-primary-600 hover:underline"
                                >
                                  {target.user.displayName}
                                </Link>
                              )}
                            </Field>
                          </>
                        )}
                        {report.type === "message" && (
                          <Field label={t("admin.reports.detail.senderLabel")}>
                            {target.sender && (
                              <Link
                                href={`/accounts/users/${target.sender.id}`}
                                className="text-primary-600 hover:underline"
                              >
                                {target.sender.displayName}
                              </Link>
                            )}
                          </Field>
                        )}
                      </DataList>

                      {report.type === "message" && target.content && (
                        <>
                          <p className="mt-4 text-sm font-medium text-muted">
                            {t("admin.reports.detail.messageContent")}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap rounded-lg bg-surface-alt p-3 text-body">
                            {target.content}
                          </p>
                        </>
                      )}

                      {(report.type === "product" ||
                        report.type === "user") && (
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                          {report.type === "product" && (
                            <Button
                              variant="danger"
                              size="sm"
                              leftIcon={<TrashIcon className="h-4 w-4" />}
                              isLoading={removeListing.isPending}
                              onClick={() =>
                                askAndRun(
                                  t(
                                    "admin.reports.actions.removeListingReason",
                                  ),
                                  (reason) =>
                                    removeListing.mutate({
                                      productId: report.targetId,
                                      reason,
                                    }),
                                )
                              }
                            >
                              {t("admin.reports.actions.removeListing")}
                            </Button>
                          )}
                          {report.type === "user" && !target.isBanned && (
                            <Button
                              variant="danger"
                              size="sm"
                              leftIcon={<NoSymbolIcon className="h-4 w-4" />}
                              isLoading={banUser.isPending}
                              onClick={() =>
                                askAndRun(
                                  t("admin.reports.actions.banUserReason"),
                                  (reason) =>
                                    banUser.mutate({
                                      userId: report.targetId,
                                      reason,
                                    }),
                                )
                              }
                            >
                              {t("admin.reports.actions.banUser")}
                            </Button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </SectionCard>
              </div>

              <div className="space-y-6">
                {report.reporter && (
                  <PartyCard
                    title={t("admin.reports.detail.reporterTitle")}
                    name={report.reporter.displayName}
                    email={report.reporter.email}
                    userHref={`/accounts/users/${report.reporter.id}`}
                  />
                )}

                <SectionCard title={t("admin.reports.detail.adminNote")}>
                  <p className="whitespace-pre-wrap text-body">
                    {report.adminNote || (
                      <span className="text-subtle">
                        {t("admin.reports.detail.noAdminNote")}
                      </span>
                    )}
                  </p>
                </SectionCard>

                <Timeline
                  items={[
                    {
                      label: t("admin.reports.detail.reportedAt"),
                      at: report.createdAt,
                    },
                    {
                      label: t("admin.reports.detail.resolvedAt"),
                      at: report.resolvedAt,
                    },
                  ]}
                />
              </div>
            </div>

            {statusOpen && (
              <ReportStatusModal
                reportId={report.id}
                currentStatus={report.status}
                currentNote={report.adminNote}
                onClose={() => setStatusOpen(false)}
              />
            )}
          </>
        );
      }}
    </DetailPage>
  );
}
