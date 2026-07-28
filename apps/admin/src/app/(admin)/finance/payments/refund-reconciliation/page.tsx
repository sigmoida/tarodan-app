"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Input,
  Modal,
  ModalFooter,
  Select,
  Textarea,
} from "@tarodan/ui";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { extractList } from "@/lib/extract";
import { fmtTry } from "@/lib/format";
import { useSession } from "@/context/SessionContext";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { SectionCard } from "@/components/detail/SectionCard";

type Resolution = "provider_succeeded" | "provider_not_processed";

interface RefundAttempt {
  id: string;
  amount: string | number;
  provider: string;
  providerReference: string | null;
  providerRefundId: string | null;
  failureReason: string | null;
  requestStartedAt: string | null;
  updatedAt: string;
  order: { id: string; orderNumber: string } | null;
  trade: { id: string; tradeNumber: string } | null;
}

export default function RefundReconciliationPage() {
  const t = useTranslations();
  const { user } = useSession();
  const [selected, setSelected] = useState<RefundAttempt | null>(null);
  const canResolve = user.role === "super_admin" || user.role === "admin";

  const query = useQuery({
    queryKey: adminKeys.list("refund-attempts", "manual_review"),
    queryFn: async () =>
      extractList<RefundAttempt>(
        (await adminApi.getRefundAttempts("manual_review")).data,
      ),
  });

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.finance.payments.refundReconciliation.title")}
        description={t(
          "admin.finance.payments.refundReconciliation.description",
        )}
        backHref="/finance/payments"
      >
        <Button
          variant="secondary"
          leftIcon={<ArrowPathIcon className="h-5 w-5" />}
          onClick={() => query.refetch()}
          isLoading={query.isFetching}
        >
          {t("common.tryAgain")}
        </Button>
      </PageHeader>

      <SectionCard bodyClassName="overflow-x-auto">
        {query.isLoading ? (
          <p className="py-8 text-center text-muted">{t("common.loading")}</p>
        ) : (query.data?.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-muted">
            {t("admin.finance.payments.refundReconciliation.empty")}
          </p>
        ) : (
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="px-3 py-3 font-medium">
                  {t("admin.finance.payments.refundReconciliation.target")}
                </th>
                <th className="px-3 py-3 font-medium">
                  {t("admin.finance.payments.provider")}
                </th>
                <th className="px-3 py-3 font-medium">
                  {t("admin.finance.payments.totalAmount")}
                </th>
                <th className="px-3 py-3 font-medium">
                  {t(
                    "admin.finance.payments.refundReconciliation.providerReference",
                  )}
                </th>
                <th className="px-3 py-3 font-medium">
                  {t("admin.finance.payments.failureReason")}
                </th>
                <th className="px-3 py-3 font-medium">
                  {t("admin.finance.payments.paymentDate")}
                </th>
                <th className="px-3 py-3 text-right font-medium">
                  {t("common.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {query.data?.map((attempt) => {
                const target = attempt.order ?? attempt.trade;
                const href = attempt.order
                  ? `/operations/orders/${attempt.order.id}`
                  : attempt.trade
                    ? `/operations/trades/${attempt.trade.id}`
                    : null;
                const label =
                  attempt.order?.orderNumber ??
                  attempt.trade?.tradeNumber ??
                  attempt.id;
                return (
                  <tr
                    key={attempt.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-3 font-medium text-heading">
                      {href && target ? (
                        <Link
                          className="text-primary-600 hover:underline"
                          href={href}
                        >
                          {label}
                        </Link>
                      ) : (
                        label
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="default" size="sm">
                        {attempt.provider}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      {fmtTry(Number(attempt.amount))}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {attempt.providerReference ?? "-"}
                    </td>
                    <td className="max-w-64 px-3 py-3 text-danger-700">
                      {attempt.failureReason ?? "-"}
                    </td>
                    <td className="px-3 py-3">
                      {new Date(attempt.updatedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {canResolve && (
                        <Button size="sm" onClick={() => setSelected(attempt)}>
                          {t(
                            "admin.finance.payments.refundReconciliation.resolve",
                          )}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </SectionCard>

      {selected && (
        <ResolveRefundAttemptModal
          attempt={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </AdminPage>
  );
}

function ResolveRefundAttemptModal({
  attempt,
  onClose,
}: {
  attempt: RefundAttempt;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [resolution, setResolution] =
    useState<Resolution>("provider_succeeded");
  const [providerRefundId, setProviderRefundId] = useState(
    attempt.providerRefundId ?? "",
  );
  const [note, setNote] = useState("");

  const resolve = useAdminMutation(
    () =>
      adminApi.resolveRefundAttempt(attempt.id, {
        resolution,
        providerRefundId: providerRefundId.trim() || undefined,
        note: note.trim(),
      }),
    {
      invalidates: ["refund-attempts"],
      successMessage: t("admin.finance.payments.refundReconciliation.resolved"),
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("admin.finance.payments.refundReconciliation.resolveTitle")}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <Select
          label={t(
            "admin.finance.payments.refundReconciliation.resolutionLabel",
          )}
          value={resolution}
          onChange={(event) => setResolution(event.target.value as Resolution)}
          disabled={resolve.isPending}
        >
          <option value="provider_succeeded">
            {t("admin.finance.payments.refundReconciliation.providerSucceeded")}
          </option>
          <option value="provider_not_processed">
            {t(
              "admin.finance.payments.refundReconciliation.providerNotProcessed",
            )}
          </option>
        </Select>
        {resolution === "provider_succeeded" && (
          <Input
            label={t(
              "admin.finance.payments.refundReconciliation.providerRefundId",
            )}
            value={providerRefundId}
            onChange={(event) => setProviderRefundId(event.target.value)}
            maxLength={200}
            disabled={resolve.isPending}
          />
        )}
        <Textarea
          label={t("admin.finance.payments.refundReconciliation.note")}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
          rows={4}
          disabled={resolve.isPending}
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => resolve.mutate()}
          confirmLabel={t(
            "admin.finance.payments.refundReconciliation.confirm",
          )}
          disabled={!note.trim()}
          isLoading={resolve.isPending}
        />
      </div>
    </Modal>
  );
}
