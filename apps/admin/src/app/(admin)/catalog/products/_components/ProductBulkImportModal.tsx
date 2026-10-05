"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  Button,
  EmptyState,
  Modal,
  ModalFooter,
  SearchableSelect,
  Spinner,
} from "@tarodan/ui";
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  DocumentArrowUpIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  productImportFileKey,
  useProductBulkImport,
} from "@/hooks/useProductBulkImport";
import { Panel } from "@/components/detail/Panel";
import { ProgressBar } from "@/components/ProgressBar";
import { fmtFileSize } from "@/lib/format";

export function ProductBulkImportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const statusRef = useRef<HTMLDivElement>(null);
  const bulkImport = useProductBulkImport(open, onClose);
  const {
    sellerId,
    setSellerId,
    workbook,
    setWorkbook,
    images,
    addImages,
    removeImage,
    errors,
    result,
    uploadProgress,
    upload,
    isProcessing,
    close,
    submit,
    limits,
  } = bulkImport;
  const sellerOptions = useMemo(
    () =>
      bulkImport.sellers.map((seller) => ({
        value: seller.id,
        label: `${seller.companyName || seller.displayName} · ${seller.email}`,
      })),
    [bulkImport.sellers],
  );

  useEffect(() => {
    if (isProcessing || errors.length > 0 || result) {
      statusRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [errors.length, isProcessing, result]);

  return (
    <Modal
      isOpen={open}
      onClose={close}
      title={t("admin.catalog.products.bulkImportTitle")}
      description={t("admin.catalog.products.bulkImportDescription")}
      size="2xl"
      dismissDisabled={isProcessing}
      footer={
        result ? (
          <div className="flex w-full justify-end">
            <Button type="button" onClick={close}>
              {t("common.close")}
            </Button>
          </div>
        ) : (
          <ModalFooter
            onCancel={close}
            onConfirm={submit}
            cancelLabel={t("common.cancel")}
            confirmLabel={t("admin.catalog.products.bulkImportSubmit")}
            isLoading={isProcessing}
            disabled={bulkImport.disabled}
          />
        )
      }
    >
      <div className="space-y-5">
        <Alert
          variant="warning"
          icon={<ExclamationTriangleIcon className="h-5 w-5" />}
        >
          {t("admin.catalog.products.bulkImportApprovalNotice")}
        </Alert>

        <Panel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-heading">
              {t("admin.catalog.products.bulkImportTemplateTitle")}
            </p>
            <p className="mt-1 text-sm text-muted">
              {t("admin.catalog.products.bulkImportTemplateHelp")}
            </p>
          </div>
          <Button asChild variant="outline">
            <a
              href="/templates/tarodan-toplu-urun-sablonu.xlsx"
              download
              className="shrink-0"
            >
              <ArrowDownTrayIcon className="mr-2 h-5 w-5" />
              {t("admin.catalog.products.bulkImportDownloadTemplate")}
            </a>
          </Button>
        </Panel>

        <SearchableSelect
          value={sellerId}
          onChange={setSellerId}
          options={sellerOptions}
          label={t("admin.catalog.products.bulkImportSeller")}
          placeholder={t("admin.catalog.products.bulkImportSellerPlaceholder")}
          searchPlaceholder={t("admin.catalog.products.bulkImportSellerSearch")}
          emptyText={t("admin.catalog.products.bulkImportNoSeller")}
          disabled={bulkImport.sellersLoading || isProcessing}
          required
        />

        <div className="space-y-4">
          <Panel>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium text-heading">
                  <DocumentArrowUpIcon className="h-5 w-5 shrink-0 text-primary-600" />
                  {t("admin.catalog.products.bulkImportWorkbook")}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {t("admin.catalog.products.bulkImportWorkbookHelp")}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <label className="shrink-0 cursor-pointer">
                  {workbook
                    ? t("admin.catalog.products.bulkImportReplaceWorkbook")
                    : t("admin.catalog.products.bulkImportSelectWorkbook")}
                  <input
                    className="sr-only"
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    disabled={isProcessing}
                    onChange={(event) => {
                      setWorkbook(event.target.files?.[0] ?? null);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </Button>
            </div>

            {workbook ? (
              <Panel padding="sm" className="mt-4 flex items-center gap-3">
                <DocumentArrowUpIcon className="h-5 w-5 shrink-0 text-primary-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-heading">
                    {workbook.name}
                  </p>
                  <p className="text-xs text-muted">
                    {fmtFileSize(workbook.size)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isProcessing}
                  aria-label={t("admin.catalog.products.bulkImportRemoveFile", {
                    name: workbook.name,
                  })}
                  onClick={() => {
                    setWorkbook(null);
                  }}
                >
                  <XMarkIcon className="h-5 w-5" />
                </Button>
              </Panel>
            ) : (
              <EmptyState
                size="compact"
                icon={false}
                className="mt-4"
                title={t("admin.catalog.products.bulkImportNoWorkbook")}
              />
            )}
          </Panel>

          <Panel>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium text-heading">
                  <PhotoIcon className="h-5 w-5 shrink-0 text-primary-600" />
                  {t("admin.catalog.products.bulkImportImages")}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {images.length
                    ? t("admin.catalog.products.bulkImportImageCount", {
                        count: images.length,
                        max: limits.maxImages,
                      })
                    : t("admin.catalog.products.bulkImportImagesHelp")}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <label className="shrink-0 cursor-pointer">
                  {images.length
                    ? t("admin.catalog.products.bulkImportAddImages")
                    : t("admin.catalog.products.bulkImportSelectImages")}
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    data-max-files={limits.maxImages}
                    disabled={isProcessing}
                    onChange={(event) => {
                      addImages(Array.from(event.target.files ?? []));
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </Button>
            </div>

            {images.length ? (
              <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
                {images.map((image) => (
                  <li key={productImportFileKey(image)}>
                    <Panel padding="sm" className="flex items-center gap-3">
                    <PhotoIcon className="h-5 w-5 shrink-0 text-primary-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-heading">
                        {image.name}
                      </p>
                      <p className="text-xs text-muted">
                        {fmtFileSize(image.size)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isProcessing}
                      aria-label={t(
                        "admin.catalog.products.bulkImportRemoveFile",
                        { name: image.name },
                      )}
                      onClick={() => removeImage(image)}
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </Button>
                    </Panel>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                size="compact"
                icon={false}
                className="mt-4"
                title={t("admin.catalog.products.bulkImportNoImages")}
              />
            )}
          </Panel>
        </div>

        {(isProcessing || errors.length > 0 || result) && (
          <div ref={statusRef} aria-live="polite">
            <Panel>
            <p className="font-medium text-heading">
              {t("admin.catalog.products.bulkImportProgressTitle")}
            </p>
            <div className="mt-3 flex items-start gap-3">
              {isProcessing ? (
                <Spinner size="sm" className="mt-0.5 shrink-0" />
              ) : result ? (
                <CheckCircleIcon className="h-5 w-5 shrink-0 text-success-600" />
              ) : (
                <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-danger-600" />
              )}
              <div>
                <p className="text-sm font-medium text-heading">
                  {isProcessing
                    ? uploadProgress < 100
                      ? t("admin.catalog.products.bulkImportUploading", {
                          progress: uploadProgress,
                        })
                      : t("admin.catalog.products.bulkImportProcessing")
                    : result
                      ? t("admin.catalog.products.bulkImportProcessCompleted")
                      : t("admin.catalog.products.bulkImportProcessFailed")}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {isProcessing
                    ? uploadProgress < 100
                      ? t("admin.catalog.products.bulkImportUploadingHelp")
                      : t("admin.catalog.products.bulkImportProcessingHelp")
                    : result
                      ? t("admin.catalog.products.bulkImportCompletedHelp")
                      : t("admin.catalog.products.bulkImportFailedHelp")}
                </p>
              </div>
            </div>
            {isProcessing && uploadProgress < 100 && (
              <ProgressBar value={uploadProgress} className="mt-3" />
            )}
            </Panel>
          </div>
        )}

        {errors.length > 0 && (
          <Alert variant="danger">
            <p className="font-medium">
              {t("admin.catalog.products.bulkImportValidationTitle")}
            </p>
            <p className="mt-1 text-sm">
              {t("admin.catalog.products.bulkImportValidationHelp")}
            </p>
            <ul className="mt-3 max-h-56 list-disc space-y-1.5 overflow-y-auto pl-5 pr-1 text-sm">
              {errors.map((error, index) => (
                <li key={`${index}-${error}`}>{error}</li>
              ))}
            </ul>
          </Alert>
        )}

        {result && (
          <Alert variant="success">
            <p className="font-medium">
              {t("admin.catalog.products.bulkImportCreated", {
                count: result.createdCount,
              })}
            </p>
            <p className="mt-1 text-sm">
              {result.seller.companyName || result.seller.displayName}
            </p>
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
              {result.products.map((product) => (
                <li key={product.id}>
                  {product.productCode} · {product.reference} · {product.title}
                </li>
              ))}
            </ul>
          </Alert>
        )}
      </div>
    </Modal>
  );
}
