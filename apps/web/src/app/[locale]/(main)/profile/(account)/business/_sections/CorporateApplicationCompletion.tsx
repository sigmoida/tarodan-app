"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentArrowUpIcon,
  ExclamationTriangleIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, Input, Tabs, TabsList, TabsTrigger } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import {
  corporateApplicationApi,
  type CorporateApplication,
  type CorporateDocumentStatus,
} from "@/lib/api";

const DOCUMENTS = [
  ["tax_plate", "documents.taxPlate"],
  ["residence_or_invoice", "documents.residenceOrInvoice"],
  ["signature_circular", "documents.signatureCircular"],
  ["trade_registry_gazette", "documents.tradeRegistryGazette"],
  ["activity_certificate", "documents.activityCertificate"],
  ["bank_account_info", "documents.bankAccountInfo"],
  ["contract", "documents.contract"],
] as const;

export default function CorporateApplicationCompletion({
  application,
}: {
  application: CorporateApplication;
}) {
  const t = useTranslations("profile.corporateCompletion");
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("details");
  const [details, setDetails] = useState({
    companyType: application.companyType || "",
    taxId: application.taxId || "",
    taxOffice: application.taxOffice || "",
    companyCity: application.companyCity || "",
    companyDistrict: application.companyDistrict || "",
    bankAccountHolder: application.bankAccountHolder || "",
    iban: application.iban || "",
  });
  const [stakeholder, setStakeholder] = useState({
    fullName: "",
    identityType: "tckn" as "tckn" | "passport",
    identityNumber: "",
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["corporate-application"] });
  const mutationError = (error: any, fallback: string) =>
    toast.error(error.response?.data?.message || fallback);
  const statusLabel = (status: CorporateDocumentStatus) =>
    t(`documentStatus.${status}` as Parameters<typeof t>[0]);
  const save = useMutation({
    mutationFn: () => corporateApplicationApi.update(details),
    onSuccess: async () => {
      toast.success(t("detailsSaved"));
      await refresh();
    },
    onError: (error) => mutationError(error, t("saveFailed")),
  });
  const addStakeholder = useMutation({
    mutationFn: () =>
      corporateApplicationApi.addStakeholder({
        ...stakeholder,
        identityNumber: stakeholder.identityNumber || undefined,
      }),
    onSuccess: async () => {
      setStakeholder({
        fullName: "",
        identityType: "tckn",
        identityNumber: "",
      });
      toast.success(t("stakeholderAdded"));
      await refresh();
    },
    onError: (error) => mutationError(error, t("stakeholderAddFailed")),
  });
  const upload = useMutation({
    mutationFn: ({
      documentType,
      file,
      stakeholderId,
    }: {
      documentType: string;
      file: File;
      stakeholderId?: string;
    }) =>
      corporateApplicationApi.uploadDocument(documentType, file, stakeholderId),
    onSuccess: async () => {
      toast.success(t("documentUploaded"));
      await refresh();
    },
    onError: (error) => mutationError(error, t("uploadFailed")),
  });
  const submit = useMutation({
    mutationFn: corporateApplicationApi.submit,
    onSuccess: async () => {
      toast.success(t("applicationSubmitted"));
      await refresh();
    },
    onError: (error: any) => mutationError(error, t("submitFailed")),
  });
  const appeal = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      corporateApplicationApi.appealDocument(id, note),
    onSuccess: async () => {
      toast.success(t("appealSubmitted"));
      await refresh();
    },
    onError: (error) => mutationError(error, t("appealFailed")),
  });

  const currentByType = useMemo(
    () =>
      new Map(
        application.documents
          .filter((document) => !document.stakeholderId)
          .map((document) => [document.documentType, document]),
      ),
    [application.documents],
  );
  const locked = application.status === "under_review";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-border-subtle pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-heading">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{application.companyTitle}</p>
        </div>
        <Badge variant={locked ? "warning" : "primary"}>
          {locked ? t("statusReview") : t("statusCompletion")}
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="details">{t("tabs.details")}</TabsTrigger>
          <TabsTrigger value="stakeholders">
            {t("tabs.stakeholders")}
          </TabsTrigger>
          <TabsTrigger value="documents">{t("tabs.documents")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "details" && (
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          {(
            [
              ["companyType", "fields.companyType"],
              ["taxId", "fields.taxId"],
              ["taxOffice", "fields.taxOffice"],
              ["companyCity", "fields.companyCity"],
              ["companyDistrict", "fields.companyDistrict"],
              ["bankAccountHolder", "fields.bankAccountHolder"],
              ["iban", "fields.iban"],
            ] as const
          ).map(([key, label]) => (
            <Input
              key={key}
              label={t(label)}
              value={details[key]}
              onChange={(event) =>
                setDetails((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
              disabled={locked}
              required
            />
          ))}
          <div className="sm:col-span-2">
            <Button type="submit" isLoading={save.isPending} disabled={locked}>
              {t("saveDetails")}
            </Button>
          </div>
        </form>
      )}

      {tab === "stakeholders" && (
        <div className="space-y-5">
          {application.stakeholders.map((item) => (
            <div
              key={item.id}
              className="space-y-3 border-b border-border-subtle py-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-heading">{item.fullName}</p>
                  <p className="text-xs text-muted">
                    {item.identityType === "tckn"
                      ? t("identity.nationalId")
                      : t("identity.passport")}{" "}
                    {item.identityNumber || ""}
                  </p>
                </div>
                <CheckCircleIcon className="h-5 w-5 text-success-600" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["front", "back"] as const).map((side) => {
                  const type = `${item.identityType === "tckn" ? "identity" : "passport"}_${side}`;
                  const document = item.documents?.find(
                    (candidate) => candidate.documentType === type,
                  );
                  const needsAction = [
                    "rejected",
                    "revision_requested",
                  ].includes(document?.status || "");
                  return (
                    <div
                      key={side}
                      className="flex items-center justify-between gap-2 border border-border-subtle p-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-heading">
                          {side === "front"
                            ? t("identity.front")
                            : t("identity.back")}
                        </p>
                        <p className="text-xs text-muted">
                          {document
                            ? statusLabel(document.status)
                            : t("documentStatus.missing")}
                        </p>
                        {document?.reviewNote && (
                          <p className="mt-1 text-xs text-danger-700">
                            {document.reviewNote}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {needsAction && document && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              const note = window.prompt(t("appealPrompt"));
                              if (note?.trim()) {
                                appeal.mutate({ id: document.id, note });
                              }
                            }}
                          >
                            <ArrowPathIcon className="h-4 w-4" />
                            {t("appeal")}
                          </Button>
                        )}
                        <label className="inline-flex h-9 cursor-pointer items-center border border-border px-3 text-sm font-medium text-heading hover:bg-surface-hover">
                          <DocumentArrowUpIcon className="mr-2 h-4 w-4" />
                          {document ? t("replace") : t("upload")}
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,image/jpeg,image/png,image/webp"
                            disabled={locked && !needsAction}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = "";
                              if (file) {
                                upload.mutate({
                                  documentType: type,
                                  stakeholderId: item.id,
                                  file,
                                });
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              addStakeholder.mutate();
            }}
          >
            <Input
              label={t("fields.fullName")}
              value={stakeholder.fullName}
              onChange={(event) =>
                setStakeholder((current) => ({
                  ...current,
                  fullName: event.target.value,
                }))
              }
              disabled={locked}
              required
            />
            <label className="text-sm font-medium text-heading">
              {t("fields.identityType")}
              <select
                className="mt-1 h-10 w-full border border-border bg-surface px-3"
                value={stakeholder.identityType}
                onChange={(event) =>
                  setStakeholder((current) => ({
                    ...current,
                    identityType: event.target.value as "tckn" | "passport",
                  }))
                }
                disabled={locked}
              >
                <option value="tckn">{t("identity.nationalId")}</option>
                <option value="passport">{t("identity.passport")}</option>
              </select>
            </label>
            <Input
              label={t("fields.identityNumber")}
              value={stakeholder.identityNumber}
              onChange={(event) =>
                setStakeholder((current) => ({
                  ...current,
                  identityNumber: event.target.value,
                }))
              }
              disabled={locked}
            />
            <div className="sm:col-span-3">
              <Button
                type="submit"
                isLoading={addStakeholder.isPending}
                disabled={locked}
              >
                <UserPlusIcon className="mr-2 h-4 w-4" />
                {t("addStakeholder")}
              </Button>
            </div>
          </form>
        </div>
      )}

      {tab === "documents" && (
        <div className="divide-y divide-border-subtle border-y border-border-subtle">
          {DOCUMENTS.map(([type, labelKey]) => {
            const document = currentByType.get(type);
            const needsAction = ["rejected", "revision_requested"].includes(
              document?.status || "",
            );
            return (
              <div
                key={type}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-heading">{t(labelKey)}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    {document?.status === "approved" ? (
                      <CheckCircleIcon className="h-4 w-4 text-success-600" />
                    ) : needsAction ? (
                      <ExclamationTriangleIcon className="h-4 w-4 text-danger-600" />
                    ) : (
                      <ClockIcon className="h-4 w-4" />
                    )}
                    <span>
                      {document
                        ? statusLabel(document.status)
                        : t("documentStatus.missing")}
                    </span>
                    {document?.version ? (
                      <span>v{document.version}</span>
                    ) : null}
                  </div>
                  {document?.reviewNote && (
                    <p className="mt-1 text-xs text-danger-700">
                      {document.reviewNote}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {needsAction && document && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const note = window.prompt(t("appealPrompt"));
                        if (note?.trim())
                          appeal.mutate({ id: document.id, note });
                      }}
                    >
                      <ArrowPathIcon className="mr-1 h-4 w-4" />
                      {t("appeal")}
                    </Button>
                  )}
                  <label className="inline-flex h-9 cursor-pointer items-center border border-border px-3 text-sm font-medium text-heading hover:bg-surface-hover">
                    <DocumentArrowUpIcon className="mr-2 h-4 w-4" />
                    {document ? t("replace") : t("upload")}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,image/jpeg,image/png,image/webp"
                      disabled={locked && !needsAction}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) upload.mutate({ documentType: type, file });
                      }}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!locked && (
        <div className="flex justify-end border-t border-border-subtle pt-5">
          <Button
            type="button"
            onClick={() => submit.mutate()}
            isLoading={submit.isPending}
          >
            {t("submit")}
          </Button>
        </div>
      )}
    </div>
  );
}
