/** @format */

"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, Spinner } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui";
import {
  sellerApi,
  type SellerDocumentSlot,
  type SellerDocumentType,
} from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { BankAccountCard } from "./_components/BankAccountCard";

const DOC_TYPES: SellerDocumentType[] = [
  "tax_plate",
  "contract",
  "signature_circular",
  "activity_certificate",
  "identity",
];

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

function DocSlot({
  type,
  slot,
  onUploaded,
}: {
  type: SellerDocumentType;
  slot?: SellerDocumentSlot;
  onUploaded: () => void;
}) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: (file: File) => sellerApi.uploadDocument(type, file),
    onSuccess: () => {
      toast.success(t("seller.documents.uploadSuccess"));
      onUploaded();
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.message || t("seller.documents.uploadFailed"),
      ),
  });

  const statusBadge = slot?.uploaded ? (
    slot.status === "approved" ? (
      <Badge variant="success" size="sm">
        {t("seller.documents.statusApproved")}
      </Badge>
    ) : slot.status === "rejected" ? (
      <Badge variant="danger" size="sm">
        {t("seller.documents.statusRejected")}
      </Badge>
    ) : (
      <Badge variant="warning" size="sm">
        {t("seller.documents.statusPending")}
      </Badge>
    )
  ) : (
    <Badge variant="default" size="sm">
      {t("seller.documents.notUploaded")}
    </Badge>
  );

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-surface-alt text-muted">
          {slot?.uploaded ? (
            <CheckCircleIcon className="h-5 w-5 text-success-600" />
          ) : (
            <DocumentTextIcon className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-heading">
            {t(`seller.documents.types.${type}`)}
          </p>
          <div className="mt-1 flex items-center gap-2">
            {statusBadge}
            {slot?.fileName && (
              <span className="truncate text-xs text-muted">
                {slot.fileName}
              </span>
            )}
          </div>
          {slot?.status === "rejected" && slot.reviewNote && (
            <p className="mt-1 text-xs text-danger-600">{slot.reviewNote}</p>
          )}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {slot?.uploaded && slot.url && (
          <a href={slot.url} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm" type="button">
              <EyeIcon className="h-4 w-4" />
            </Button>
          </a>
        )}
        <Button
          variant="secondary"
          size="sm"
          type="button"
          isLoading={upload.isPending}
          leftIcon={<ArrowUpTrayIcon className="h-4 w-4" />}
          onClick={() => inputRef.current?.click()}
        >
          {slot?.uploaded
            ? t("seller.documents.replace")
            : t("seller.documents.upload")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

export default function SellerDocumentsPage() {
  const t = useTranslations();
  const qc = useQueryClient();
  const [, force] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.sellerDocuments.all(),
    queryFn: async () => (await sellerApi.getDocuments()).data,
    staleTime: 30_000,
  });
  const slots = data?.documents ?? [];
  const byType = new Map(slots.map((s) => [s.documentType, s]));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: queryKeys.sellerDocuments.all() });
    force((n) => n + 1);
  };

  return (
    <PageShell>
      <PageHeader
        title={t("seller.documents.title")}
        description={t("seller.documents.subtitle")}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title={t("seller.documents.documentsTitle")}>
            <p className="mb-4 text-sm text-muted">
              {t("seller.documents.allowedTypes")}
            </p>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : (
              <div className="space-y-3">
                {DOC_TYPES.map((type) => (
                  <DocSlot
                    key={type}
                    type={type}
                    slot={byType.get(type)}
                    onUploaded={refresh}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </div>
        <div className="lg:col-span-1">
          <BankAccountCard />
        </div>
      </div>
    </PageShell>
  );
}
