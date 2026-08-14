/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BuildingOfficeIcon,
  CalendarIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  EyeIcon,
  HashtagIcon,
  PhoneIcon,
  UserGroupIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, Spinner } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { MaskedValue } from "@/components/MaskedValue";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useConfirm } from "@/provider/ConfirmProvider";
import { usePrompt } from "@/provider/PromptProvider";
import {
  type Application,
  type ApplicationStatus,
  applicationStatusConfig,
} from "../_lib/types";

type T = ReturnType<typeof useTranslations<never>>;

const COMPANY_DOCUMENT_TYPES = [
  "tax_plate",
  "residence_or_invoice",
  "signature_circular",
  "trade_registry_gazette",
  "activity_certificate",
  "bank_account_info",
  "contract",
] as const;

type CompanyDocumentType = (typeof COMPANY_DOCUMENT_TYPES)[number];
type DocumentType =
  | CompanyDocumentType
  | "identity"
  | "identity_front"
  | "identity_back"
  | "passport_front"
  | "passport_back";
type DocumentStatus =
  "pending" | "approved" | "rejected" | "revision_requested" | "appealed";

interface DocumentSlot {
  id: string;
  documentType: DocumentType;
  stakeholderId: string | null;
  fileName: string;
  mimeType: string;
  status: DocumentStatus;
  reviewNote: string | null;
  appealNote: string | null;
  version: number;
  reviewedAt: string | null;
  uploadedAt: string;
  url: string;
}

interface Stakeholder {
  id: string;
  fullName: string;
  identityType: "tckn" | "passport";
  identityNumber: string | null;
}

interface ApplicationDetailData {
  id: string;
  status: ApplicationStatus;
  authorizedFullName: string;
  companyLegalName: string;
  companyTitle: string;
  companyAddress: string;
  companyEmail: string;
  kepAddress: string | null;
  phone: string;
  contactPhone: string | null;
  taxId: string | null;
  companyType: string | null;
  taxOffice: string | null;
  companyCity: string | null;
  companyDistrict: string | null;
  bankAccountHolder: string | null;
  iban: string | null;
  reviewNote: string | null;
  createdAt: string;
  user: {
    id: string;
    adminCode: string | null;
    username: string | null;
    isSeller: boolean;
  } | null;
  stakeholders: Stakeholder[];
  documents: DocumentSlot[];
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <span className="block text-xs text-muted">{label}</span>
      <span className="break-words font-medium text-heading">{value}</span>
    </div>
  );
}

function DocumentStatusBadge({ status, t }: { status: DocumentStatus; t: T }) {
  const config = {
    pending: {
      label: t("seller.documents.statusPending"),
      variant: "warning" as const,
    },
    approved: {
      label: t("seller.documents.statusApproved"),
      variant: "success" as const,
    },
    rejected: {
      label: t("seller.documents.statusRejected"),
      variant: "danger" as const,
    },
    revision_requested: {
      label: t("admin.accounts.sellerApplications.documentStatus.revision"),
      variant: "warning" as const,
    },
    appealed: {
      label: t("admin.accounts.sellerApplications.documentStatus.appealed"),
      variant: "info" as const,
    },
  }[status];

  return (
    <Badge variant={config.variant} size="sm">
      {config.label}
    </Badge>
  );
}

/** Corporate application review with per-document decisions and final approval. */
export function ApplicationDetail({ app }: { app: Application }) {
  const t = useTranslations();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const { data, isLoading, isError } = useQuery({
    queryKey: adminKeys.detail("seller-applications", app.id),
    queryFn: async () =>
      (await adminApi.getSellerApplication(app.id))
        .data as ApplicationDetailData,
    staleTime: 30_000,
  });

  const review = useAdminMutation(
    (input: {
      documentId: string;
      status: "approved" | "rejected" | "revision_requested";
      note?: string;
    }) =>
      adminApi.reviewSellerDocument(
        app.id,
        input.documentId,
        input.status,
        input.note,
      ),
    {
      invalidates: ["seller-applications"],
      successMessage: t(
        "admin.accounts.sellerApplications.documentReviewSuccess",
      ),
      errorMessage: t("admin.accounts.sellerApplications.documentReviewError"),
    },
  );

  const finalApprove = useAdminMutation(
    () => adminApi.finalApproveSellerApplication(app.id),
    {
      invalidates: ["seller-applications"],
      successMessage: t(
        "admin.accounts.sellerApplications.finalApproveSuccess",
      ),
      errorMessage: t("admin.accounts.sellerApplications.finalApproveError"),
    },
  );

  const requestDocumentDecision = async (
    document: DocumentSlot,
    status: "rejected" | "revision_requested",
  ) => {
    const note = await prompt({
      title:
        status === "rejected"
          ? t("admin.accounts.sellerApplications.rejectDocument")
          : t("admin.accounts.sellerApplications.requestRevision"),
      description: t(
        "admin.accounts.sellerApplications.documentDecisionPrompt",
      ),
      placeholder: t(
        "admin.accounts.sellerApplications.documentDecisionPlaceholder",
      ),
      destructive: status === "rejected",
    });
    if (note === null) return;
    review.mutate({ documentId: document.id, status, note });
  };

  const approveFinal = async () => {
    await confirm({
      description: t("admin.accounts.sellerApplications.finalApproveConfirm", {
        company: data?.companyTitle ?? app.companyTitle,
      }),
      confirmLabel: t("admin.accounts.sellerApplications.finalApprove"),
      onConfirm: () => finalApprove.mutateAsync(),
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center border-t border-border bg-surface-alt/40 py-10">
        <Spinner />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p className="border-t border-border bg-surface-alt/40 p-6 text-sm text-danger-600">
        {t("admin.accounts.sellerApplications.loadError")}
      </p>
    );
  }

  const documentRows = [
    ...COMPANY_DOCUMENT_TYPES.map((type) => ({
      key: type,
      type,
      stakeholderName: null,
      document: data.documents.find(
        (candidate) =>
          candidate.documentType === type && !candidate.stakeholderId,
      ),
    })),
    ...data.stakeholders.flatMap((stakeholder) => {
      const prefix =
        stakeholder.identityType === "tckn" ? "identity" : "passport";
      return (["front", "back"] as const).map((side) => {
        const type = `${prefix}_${side}` as DocumentType;
        return {
          key: `${stakeholder.id}-${type}`,
          type,
          stakeholderName: stakeholder.fullName,
          document: data.documents.find(
            (candidate) =>
              candidate.documentType === type &&
              candidate.stakeholderId === stakeholder.id,
          ),
        };
      });
    }),
  ];
  const allUploadedDocumentsApproved =
    documentRows.length > COMPANY_DOCUMENT_TYPES.length &&
    documentRows.every((row) => row.document?.status === "approved");

  return (
    <div className="space-y-6 border-t border-border bg-surface-alt/40 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge status={data.status} config={applicationStatusConfig(t)} />
          {data.user?.adminCode && (
            <Badge variant="secondary">{data.user.adminCode}</Badge>
          )}
          {data.user?.username && (
            <span className="text-sm text-muted">@{data.user.username}</span>
          )}
        </div>
        {data.status === "under_review" && (
          <Button
            onClick={approveFinal}
            disabled={!allUploadedDocumentsApproved}
            isLoading={finalApprove.isPending}
          >
            <CheckCircleIcon className="h-4 w-4" />
            {t("admin.accounts.sellerApplications.finalApprove")}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section>
          <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted">
            <BuildingOfficeIcon className="h-4 w-4" />
            {t("admin.accounts.sellerApplications.companyInformation")}
          </h4>
          <div className="space-y-2 text-sm">
            <Field
              label={t("admin.accounts.sellerApplications.companyFullName")}
              value={data.companyLegalName}
            />
            <Field
              label={t("admin.accounts.sellerApplications.companyTitle")}
              value={data.companyTitle}
            />
            <Field
              label={t("admin.accounts.sellerApplications.companyAddress")}
              value={data.companyAddress}
            />
            <Field
              label={t("admin.accounts.sellerApplications.companyType")}
              value={data.companyType}
            />
            <Field
              label={t("admin.accounts.sellerApplications.taxOffice")}
              value={data.taxOffice}
            />
            {data.taxId && (
              <div>
                <span className="flex items-center gap-1 text-xs text-muted">
                  <HashtagIcon className="h-3 w-3" />
                  {t("admin.accounts.sellerApplications.taxNumber")}
                </span>
                <span className="font-medium text-heading">{data.taxId}</span>
              </div>
            )}
            <Field
              label={t("admin.accounts.sellerApplications.city")}
              value={data.companyCity}
            />
            <Field
              label={t("admin.accounts.sellerApplications.district")}
              value={data.companyDistrict}
            />
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-xs font-semibold text-muted">
            {t("admin.accounts.sellerApplications.communication")}
          </h4>
          <div className="space-y-2 text-sm">
            <Field
              label={t("admin.accounts.sellerApplications.authorizedPerson")}
              value={data.authorizedFullName}
            />
            <Field label={t("common.email")} value={data.companyEmail} />
            <Field
              label={t("admin.accounts.sellerApplications.kepAddress")}
              value={data.kepAddress}
            />
            <div>
              <span className="flex items-center gap-1 text-xs text-muted">
                <PhoneIcon className="h-3 w-3" />
                {t("common.phone")}
              </span>
              <span className="text-heading">{data.phone}</span>
            </div>
            <Field
              label={t("admin.accounts.sellerApplications.contactPhone")}
              value={data.contactPhone}
            />
            <div>
              <span className="flex items-center gap-1 text-xs text-muted">
                <CalendarIcon className="h-3 w-3" />
                {t("admin.accounts.sellerApplications.applicationDate")}
              </span>
              <span className="text-heading">
                {new Date(data.createdAt).toLocaleString(
                  t("common.dateLocale"),
                )}
              </span>
            </div>
          </div>
        </section>

        <section>
          <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted">
            <UserGroupIcon className="h-4 w-4" />
            {t("admin.accounts.sellerApplications.stakeholders")}
          </h4>
          <div className="space-y-3 text-sm">
            {data.stakeholders.length === 0 ? (
              <span className="text-muted">
                {t("admin.accounts.sellerApplications.noStakeholders")}
              </span>
            ) : (
              data.stakeholders.map((stakeholder) => (
                <div
                  key={stakeholder.id}
                  className="border-b border-border pb-2 last:border-0"
                >
                  <p className="font-medium text-heading">
                    {stakeholder.fullName}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-muted">
                    {stakeholder.identityType.toUpperCase()}
                    {stakeholder.identityNumber && (
                      <>
                        {" · "}
                        <MaskedValue
                          value={stakeholder.identityNumber}
                          className="text-xs"
                        />
                      </>
                    )}
                  </p>
                </div>
              ))
            )}
            <Field
              label={t("admin.accounts.sellerApplications.accountHolder")}
              value={data.bankAccountHolder}
            />
            {data.iban && (
              <div>
                <span className="block text-xs text-muted">
                  {t("admin.accounts.sellerApplications.iban")}
                </span>
                <MaskedValue value={data.iban} className="font-medium" />
              </div>
            )}
          </div>
        </section>
      </div>

      <section>
        <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted">
          <DocumentTextIcon className="h-4 w-4" />
          {t("admin.accounts.sellerApplications.documents")}
        </h4>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {documentRows.map(({ key, type, stakeholderName, document }) => {
            return (
              <div
                key={key}
                className="space-y-3 rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-heading">
                      {t(`seller.documents.types.${type}`)}
                    </p>
                    {stakeholderName && (
                      <p className="mt-0.5 text-xs text-muted">
                        {stakeholderName}
                      </p>
                    )}
                    {document ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <DocumentStatusBadge status={document.status} t={t} />
                        <span className="text-xs text-muted">
                          v{document.version}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">
                        {t("admin.accounts.sellerApplications.notUploaded")}
                      </span>
                    )}
                  </div>
                  {document?.url && (
                    <a
                      href={document.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
                    >
                      <EyeIcon className="h-4 w-4" />
                      {t("admin.accounts.sellerApplications.view")}
                    </a>
                  )}
                </div>

                {document?.reviewNote && (
                  <p className="rounded-md bg-surface-alt p-2 text-xs text-body">
                    {document.reviewNote}
                  </p>
                )}
                {document?.appealNote && (
                  <p className="rounded-md bg-surface-alt p-2 text-xs text-body">
                    {t("admin.accounts.sellerApplications.appeal")}:{" "}
                    {document.appealNote}
                  </p>
                )}

                {document && document.status !== "approved" && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        review.mutate({
                          documentId: document.id,
                          status: "approved",
                        })
                      }
                      isLoading={
                        review.isPending &&
                        review.variables?.documentId === document.id
                      }
                    >
                      <CheckCircleIcon className="h-4 w-4" />
                      {t("common.confirm")}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        requestDocumentDecision(document, "revision_requested")
                      }
                    >
                      {t("admin.accounts.sellerApplications.requestRevision")}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        requestDocumentDecision(document, "rejected")
                      }
                    >
                      <XCircleIcon className="h-4 w-4" />
                      {t("admin.accounts.sellerApplications.reject")}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
