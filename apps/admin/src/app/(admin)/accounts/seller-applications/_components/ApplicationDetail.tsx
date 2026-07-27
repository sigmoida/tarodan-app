/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BanknotesIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  EyeIcon,
  HashtagIcon,
  PhoneIcon,
} from "@heroicons/react/24/outline";
import { Badge, Spinner } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { type Application } from "../_lib/types";

const DOC_TYPES = [
  "tax_plate",
  "contract",
  "signature_circular",
  "activity_certificate",
  "identity",
] as const;

type DocStatus = "pending" | "approved" | "rejected";

interface DocumentSlot {
  documentType: (typeof DOC_TYPES)[number];
  fileName: string;
  mimeType: string;
  status: DocStatus;
  uploadedAt: string;
  url: string;
}

interface ApplicationDetailData {
  companyType: string | null;
  taxOffice: string | null;
  companyCity: string | null;
  companyDistrict: string | null;
  bankAccount: {
    accountHolder: string | null;
    iban: string | null;
    tcKimlikNo: string | null;
    taxId: string | null;
    isVerified: boolean;
  } | null;
  documents: DocumentSlot[];
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <span className="block text-xs text-muted">{label}</span>
      <span className="font-medium text-heading">{value}</span>
    </div>
  );
}

/** Lazily-loaded expanded row: company info, IBAN and uploaded documents. */
export function ApplicationDetail({ app }: { app: Application }) {
  const t = useTranslations();
  const { data, isLoading, isError } = useQuery({
    queryKey: adminKeys.detail("seller-applications", app.id),
    queryFn: async () =>
      (await adminApi.getSellerApplication(app.id))
        .data as ApplicationDetailData,
    staleTime: 30_000,
  });

  const docStatusBadge = (status: DocStatus) =>
    status === "approved" ? (
      <Badge variant="success" size="sm">
        {t("seller.documents.statusApproved")}
      </Badge>
    ) : status === "rejected" ? (
      <Badge variant="danger" size="sm">
        {t("seller.documents.statusRejected")}
      </Badge>
    ) : (
      <Badge variant="warning" size="sm">
        {t("seller.documents.statusPending")}
      </Badge>
    );

  const byType = new Map(
    (data?.documents ?? []).map((d) => [d.documentType, d]),
  );

  return (
    <div className="border-t border-border bg-surface-alt/40 p-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Company information */}
        <div>
          <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted">
            <BuildingOfficeIcon className="h-4 w-4" />
            {t("admin.accounts.sellerApplications.companyInformation")}
          </h4>
          <div className="space-y-2 text-sm">
            <Field
              label={t("admin.accounts.sellerApplications.companyName")}
              value={app.companyName}
            />
            {app.taxId && (
              <div>
                <span className="flex items-center gap-1 text-xs text-muted">
                  <HashtagIcon className="h-3 w-3" />
                  {t("admin.accounts.sellerApplications.taxNumber")}
                </span>
                <span className="font-medium text-heading">{app.taxId}</span>
              </div>
            )}
            <Field
              label={t("admin.accounts.sellerApplications.companyType")}
              value={data?.companyType}
            />
            <Field
              label={t("admin.accounts.sellerApplications.taxOffice")}
              value={data?.taxOffice}
            />
            <Field
              label={t("admin.accounts.sellerApplications.city")}
              value={data?.companyCity}
            />
            <Field
              label={t("admin.accounts.sellerApplications.district")}
              value={data?.companyDistrict}
            />
          </div>
        </div>

        {/* Communication */}
        <div>
          <h4 className="mb-3 text-xs font-semibold text-muted">
            {t("admin.accounts.sellerApplications.communication")}
          </h4>
          <div className="space-y-2 text-sm">
            <Field label={t("common.email")} value={app.email} />
            {app.phone && (
              <div>
                <span className="flex items-center gap-1 text-xs text-muted">
                  <PhoneIcon className="h-3 w-3" />
                  {t("common.phone")}
                </span>
                <span className="text-heading">{app.phone}</span>
              </div>
            )}
            <div>
              <span className="flex items-center gap-1 text-xs text-muted">
                <CalendarIcon className="h-3 w-3" />
                {t("admin.accounts.sellerApplications.applicationDate")}
              </span>
              <span className="text-heading">
                {new Date(app.createdAt).toLocaleString(t("common.dateLocale"))}
              </span>
            </div>
          </div>
        </div>

        {/* Bank account */}
        <div>
          <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted">
            <BanknotesIcon className="h-4 w-4" />
            {t("admin.accounts.sellerApplications.bankAccount")}
          </h4>
          <div className="space-y-2 text-sm">
            <Field
              label={t("admin.accounts.sellerApplications.accountHolder")}
              value={data?.bankAccount?.accountHolder}
            />
            <Field
              label={t("admin.accounts.sellerApplications.iban")}
              value={data?.bankAccount?.iban}
            />
            <Field
              label={t("admin.accounts.sellerApplications.tcKimlikNo")}
              value={data?.bankAccount?.tcKimlikNo}
            />
            {data?.bankAccount && (
              <Badge
                variant={data.bankAccount.isVerified ? "success" : "warning"}
                size="sm"
              >
                {data.bankAccount.isVerified
                  ? t("admin.accounts.sellerApplications.verified")
                  : t("admin.accounts.sellerApplications.unverified")}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Documents */}
      <div className="mt-6">
        <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted">
          <DocumentTextIcon className="h-4 w-4" />
          {t("admin.accounts.sellerApplications.documents")}
        </h4>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : isError ? (
          <p className="text-sm text-danger-600">
            {t("admin.accounts.sellerApplications.loadError")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {DOC_TYPES.map((type) => {
              const doc = byType.get(type);
              return (
                <div
                  key={type}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {doc ? (
                      <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-success-600" />
                    ) : (
                      <DocumentTextIcon className="h-5 w-5 flex-shrink-0 text-muted" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-heading">
                        {t(`seller.documents.types.${type}`)}
                      </p>
                      {doc ? (
                        <div className="mt-0.5">
                          {docStatusBadge(doc.status)}
                        </div>
                      ) : (
                        <span className="text-xs text-muted">
                          {t("admin.accounts.sellerApplications.notUploaded")}
                        </span>
                      )}
                    </div>
                  </div>
                  {doc?.url && (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
                    >
                      <EyeIcon className="h-4 w-4" />
                      {t("admin.accounts.sellerApplications.view")}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
