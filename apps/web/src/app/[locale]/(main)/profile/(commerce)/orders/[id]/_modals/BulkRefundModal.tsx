/** @format */

"use client";

import { useEffect, useState } from "react";
import { Modal, Select, Textarea } from "@/components/ui";
import { Checkbox, ModalFooter } from "@tarodan/ui";
import { useMutation } from "@tanstack/react-query";
import { mediaApi, refundsApi, type RefundReason } from "@/lib/api";
import { apiErrorMessage } from "@/hooks/useWebMutation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import EvidencePhotoPicker from "../_components/EvidencePhotoPicker";
import { buyerRefundReasonOptions } from "../_lib/refund-reasons";
import { getProductInfo, type OrderDetail } from "../_lib/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** İade edilebilir (isOrderReturnable) sipariş kalemleri. */
  orders: OrderDetail[];
  onSuccess: () => void;
}

interface LineOutcome {
  orderId: string;
  orderNumber: string;
  title: string;
  ok: boolean;
  message?: string;
}

const lineQuantityOf = (order: OrderDetail): number =>
  order.items?.[0]?.quantity ?? 1;

/**
 * Toplu iade: alıcı iade edilebilir kalemleri işaretler, TEK form (neden +
 * açıklama + kanıt) doldurur; seçilen her kalem için mevcut uç üzerinden SIRAYLA
 * ayrı iade talebi açılır. Bir kalem başarısız olsa da devam edilir; sonuç
 * kalem kalem raporlanır. Doğrulama kuralları tekil modalla aynıdır
 * (vazgeçme dışındaki nedenlerde ≥20 karakter açıklama + kanıt fotoğrafı).
 */
export default function BulkRefundModal({
  isOpen,
  onClose,
  orders,
  onSuccess,
}: Props) {
  const t = useTranslations();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<RefundReason>("changed_mind");
  const [description, setDescription] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [outcomes, setOutcomes] = useState<LineOutcome[] | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Açılışta her iade edilebilir kalem seçili gelir; adetler tam iade varsayar.
    setSelectedIds(new Set(orders.map((o) => o.id)));
    setQuantities({});
    setReason("changed_mind");
    setDescription("");
    setEvidenceFiles([]);
    setOutcomes(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const toggleLine = (orderId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const evidenceRequired = reason !== "changed_mind";
  const descriptionRequired = evidenceRequired;
  const reasonOptions = buyerRefundReasonOptions(t);

  const submitMutation = useMutation({
    mutationFn: async (): Promise<LineOutcome[]> => {
      const selectedOrders = orders.filter((o) => selectedIds.has(o.id));

      // Kanıt fotoğrafları BİR kez yüklenir, her kalemin talebine eklenir.
      let evidencePhotoUrls: string[] | undefined;
      if (evidenceFiles.length > 0) {
        const results = await Promise.all(
          evidenceFiles.map((file) => mediaApi.uploadReviewImage(file)),
        );
        const urls = results
          .map((r) => r.data?.url)
          .filter(Boolean) as string[];
        evidencePhotoUrls = urls.length > 0 ? urls : undefined;
      }

      const results: LineOutcome[] = [];
      for (const order of selectedOrders) {
        const quantity = lineQuantityOf(order);
        const chosen = quantities[order.id] ?? quantity;
        const base = {
          orderId: order.id,
          orderNumber: order.orderNumber,
          title: getProductInfo(order)?.title ?? order.orderNumber,
        };
        try {
          await refundsApi.create(order.id, {
            reason,
            description: description.trim() || undefined,
            evidencePhotoUrls,
            // Adet bazlı kısmi iade: tüm adet iade ediliyorsa alanı gönderme.
            refundQuantity:
              quantity > 1 && chosen < quantity ? chosen : undefined,
          });
          results.push({ ...base, ok: true });
        } catch (err) {
          // Bir kalem reddedilse de kalanlar denenir; sonuç kalem kalem gösterilir.
          results.push({ ...base, ok: false, message: apiErrorMessage(err) });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const failed = results.filter((r) => !r.ok);
      // Kısmi başarıda da başarılı kalemler oluştu — listeler tazelenmeli.
      if (failed.length < results.length) onSuccess();
      if (failed.length === 0) {
        toast.success(
          t("order.bulkRefundAllSuccess", { count: results.length }),
        );
        onClose();
        return;
      }
      setOutcomes(results);
      toast.error(
        t("order.bulkRefundPartialFail", {
          succeeded: results.length - failed.length,
          failed: failed.length,
        }),
      );
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err) ?? t("order.refundRequestFailed")),
  });

  const handleSubmit = () => {
    if (selectedIds.size === 0) {
      toast.error(t("order.bulkRefundSelectAtLeastOne"));
      return;
    }
    if (descriptionRequired && description.trim().length < 20) {
      toast.error(t("order.descriptionMin20"));
      return;
    }
    if (evidenceRequired && evidenceFiles.length === 0) {
      toast.error(t("order.photoEvidenceRequired"));
      return;
    }
    submitMutation.mutate();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("order.bulkRefundTitle")}
      size="lg"
      closeLabel={t("common.close")}
      dismissDisabled={submitMutation.isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSubmit}
          cancelLabel={t("trade.dispute.cancelCta")}
          confirmLabel={t("order.submitRefund")}
          isLoading={submitMutation.isPending}
        />
      }
    >
      <div className="space-y-4">
        {/* Kısmi başarı raporu: hangi kalem oluştu, hangisi neden reddedildi. */}
        {outcomes && (
          <div className="rounded-lg border border-border bg-surface-alt p-3 space-y-1">
            {outcomes.map((o) => (
              <p
                key={o.orderId}
                className={`text-sm ${o.ok ? "text-success-600" : "text-danger-600"}`}
              >
                <span className="font-mono">#{o.orderNumber}</span> — {o.title}:{" "}
                {o.ok
                  ? t("order.bulkRefundLineCreated")
                  : (o.message ?? t("order.bulkRefundLineFailed"))}
              </p>
            ))}
          </div>
        )}

        <div>
          <p className="block text-sm font-medium text-body mb-2">
            {t("order.bulkRefundSelectLabel")}
          </p>
          <div className="space-y-2">
            {orders.map((order) => {
              const quantity = lineQuantityOf(order);
              const selected = selectedIds.has(order.id);
              return (
                <div
                  key={order.id}
                  className="rounded-lg border border-border p-3"
                >
                  <Checkbox
                    id={`bulk-refund-${order.id}`}
                    checked={selected}
                    onChange={() => toggleLine(order.id)}
                    disabled={submitMutation.isPending}
                    label={
                      <span className="text-sm text-body">
                        {getProductInfo(order)?.title ?? order.orderNumber}{" "}
                        <span className="font-mono text-xs text-muted">
                          #{order.orderNumber}
                        </span>
                      </span>
                    }
                  />
                  {/* Adet bazlı kısmi iade — yalnız çok adetli kalemde. */}
                  {selected && quantity > 1 && (
                    <div className="mt-2 pl-6">
                      <label className="block text-xs font-medium text-body mb-1">
                        {t("order.quantityToRefund")}
                      </label>
                      <Select
                        value={String(quantities[order.id] ?? quantity)}
                        onChange={(e) =>
                          setQuantities((prev) => ({
                            ...prev,
                            [order.id]: Number(e.target.value),
                          }))
                        }
                        className="rounded-xl"
                      >
                        {Array.from({ length: quantity }, (_, i) => i + 1).map(
                          (q) => (
                            <option key={q} value={q}>
                              {q} / {quantity}
                            </option>
                          ),
                        )}
                      </Select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-2">
            {t("common.reason")}
          </label>
          <Select
            value={reason}
            onChange={(e) => setReason(e.target.value as RefundReason)}
            className="rounded-xl"
          >
            {reasonOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-2">
            {t("common.description")}
            {descriptionRequired && (
              <span className="text-danger-500 ml-1">*</span>
            )}
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder={
              descriptionRequired
                ? t("order.describeIssuePlaceholder")
                : t("common.optional")
            }
          />
        </div>

        {evidenceRequired && (
          <EvidencePhotoPicker
            files={evidenceFiles}
            onFilesChange={setEvidenceFiles}
            required
            disabled={submitMutation.isPending}
          />
        )}
      </div>
    </Modal>
  );
}
