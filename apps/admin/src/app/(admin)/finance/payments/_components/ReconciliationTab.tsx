/** @format */

"use client";

import { useMemo, useState } from "react";
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
import { useSession } from "@/context/SessionContext";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { DataTable } from "@/components/DataTable";
import { TextLink } from "@/components/TextLink";
import { col } from "@/components/table/columns";

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
  payment?: {
    id: string;
    amount: number;
    checkoutGroup?: { groupNumber: string } | null;
  } | null;
}

export function ReconciliationTab() {
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

  const columns = useMemo(
    () => [
      col.custom(
        t("admin.finance.payments.refundReconciliation.target"),
        (attempt: RefundAttempt) => {
          const href = attempt.order
            ? `/operations/orders/${attempt.order.id}`
            : attempt.trade
              ? `/operations/trades/${attempt.trade.id}`
              : null;
          const label =
            attempt.order?.orderNumber ??
            attempt.trade?.tradeNumber ??
            attempt.id;
          // Paylaşılan grup ödemesinin kısmi iadesi: satır hangi sepete
          // ait olduğunu ve ödemeyi söylemek zorunda (R3).
          const groupNumber =
            attempt.payment?.checkoutGroup?.groupNumber ?? null;
          return (
            <>
              <span className="font-medium text-heading">
                {href ? <TextLink href={href}>{label}</TextLink> : label}
              </span>
              {groupNumber && attempt.payment && (
                <TextLink
                  href={`/finance/payments/${attempt.payment.id}`}
                  className="block text-xs"
                >
                  #{groupNumber}
                </TextLink>
              )}
            </>
          );
        },
      ),
      col.badge(
        t("admin.finance.payments.provider"),
        (attempt: RefundAttempt) => (
          <Badge variant="outline" size="sm">
            {attempt.provider}
          </Badge>
        ),
      ),
      col.money(
        t("admin.finance.payments.totalAmount"),
        (attempt: RefundAttempt) => Number(attempt.amount),
      ),
      col.code(
        t("admin.finance.payments.refundReconciliation.providerReference"),
        (attempt: RefundAttempt) => attempt.providerReference,
      ),
      col.custom(
        t("admin.finance.payments.failureReason"),
        (attempt: RefundAttempt) => (
          <span className="text-danger-700">
            {attempt.failureReason ?? "-"}
          </span>
        ),
      ),
      col.date(
        t("admin.finance.payments.paymentDate"),
        (attempt: RefundAttempt) => attempt.updatedAt,
        {
          withTime: true,
        },
      ),
      col.actions(
        (attempt: RefundAttempt) =>
          canResolve ? (
            <Button size="sm" onClick={() => setSelected(attempt)}>
              {t("admin.finance.payments.refundReconciliation.resolve")}
            </Button>
          ) : null,
        { header: t("common.actions"), minWidth: 160 },
      ),
    ],
    [t, canResolve],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {t("admin.finance.payments.refundReconciliation.description")}
        </p>
        <Button
          variant="secondary"
          leftIcon={<ArrowPathIcon className="h-5 w-5" />}
          onClick={() => query.refetch()}
          isLoading={query.isFetching}
        >
          {t("common.tryAgain")}
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={query.data ?? []}
        loading={query.isLoading}
        emptyText={t("admin.finance.payments.refundReconciliation.empty")}
        getRowId={(attempt) => attempt.id}
      />

      {selected && (
        <ResolveRefundAttemptModal
          attempt={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
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
      size="lg"
      closeButtonDisabled={resolve.isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => resolve.mutate()}
          confirmLabel={t(
            "admin.finance.payments.refundReconciliation.confirm",
          )}
          disabled={!note.trim()}
          isLoading={resolve.isPending}
        />
      }
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
            placeholder={t(
              "admin.finance.payments.refundReconciliation.providerRefundIdPlaceholder",
            )}
            onChange={(event) => setProviderRefundId(event.target.value)}
            maxLength={200}
            disabled={resolve.isPending}
          />
        )}
        <Textarea
          label={t("admin.finance.payments.refundReconciliation.note")}
          value={note}
          placeholder={t(
            "admin.finance.payments.refundReconciliation.notePlaceholder",
          )}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
          rows={4}
          disabled={resolve.isPending}
        />
      </div>
    </Modal>
  );
}
