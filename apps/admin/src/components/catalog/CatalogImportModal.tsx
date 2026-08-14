"use client";

import { useTranslations } from "next-intl";
import {
  Alert,
  Badge,
  Button,
  FileDropzone,
  Modal,
  ModalFooter,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@tarodan/ui";
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import type { CatalogImportResource } from "@/lib/api/catalog-import.types";
import {
  formatFileSize,
  useCatalogBulkImport,
} from "@/hooks/useCatalogBulkImport";
import { importColumnLabel } from "./import-columns";

const XLSX_ACCEPT =
  ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Sonuç ekranında en fazla bu kadar ad listelenir, gerisi sayıyla özetlenir. */
const MAX_LISTED_NAMES = 10;

/**
 * Marka / üretici / araç modeli ekranlarının ortak "Excel ile içe aktar"
 * dialogu. Üç ekran da aynı bileşeni yalnızca `resource` farkıyla kullanır.
 *
 * Kapanma kuralı: yükleme sürerken hiçbir yol (ESC, arka plan, Kapat) çalışmaz;
 * hata durumunda dialog AÇIK kalır ki kullanıcı satır hatalarını görüp dosyayı
 * düzeltebilsin; yalnızca başarı ya da vazgeçme dialogu kapatır.
 */
export function CatalogImportModal({
  resource,
  open,
  onClose,
}: {
  resource: CatalogImportResource;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const {
    schema,
    schemaLoading,
    limits,
    file,
    selectFile,
    rejectFile,
    errors,
    result,
    isProcessing,
    downloading,
    downloadTemplate,
    submit,
    close,
    canSubmit,
  } = useCatalogBulkImport(resource, open, onClose);

  return (
    <Modal
      isOpen={open}
      onClose={close}
      title={t(`admin.catalog.import.title.${resource}`)}
      description={t("admin.catalog.import.description")}
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
            confirmLabel={t("admin.catalog.import.submit")}
            isLoading={isProcessing}
            disabled={!canSubmit}
          />
        )
      }
    >
      <div className="space-y-5">
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium text-heading">
                {t("admin.catalog.import.structureTitle")}
              </p>
              <p className="mt-1 text-sm text-muted">
                {t("admin.catalog.import.structureHelp", {
                  sheet: schema?.sheetName ?? "",
                  rows: limits.maxRows,
                })}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              isLoading={downloading}
              onClick={() => void downloadTemplate()}
            >
              <ArrowDownTrayIcon className="mr-2 h-5 w-5" />
              {t("admin.catalog.import.downloadTemplate")}
            </Button>
          </div>

          {schemaLoading ? (
            <div className="mt-4 flex justify-center py-6">
              <Spinner size="sm" />
            </div>
          ) : schema ? (
            <div className="mt-4 max-h-64 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {t("admin.catalog.import.columnName")}
                    </TableHead>
                    <TableHead>
                      {t("admin.catalog.import.columnRequired")}
                    </TableHead>
                    <TableHead>
                      {t("admin.catalog.import.columnDescription")}
                    </TableHead>
                    <TableHead>
                      {t("admin.catalog.import.columnExample")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schema.columns.map((column) => (
                    <TableRow key={column.key}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {column.key}
                      </TableCell>
                      <TableCell>
                        <Badge variant={column.required ? "danger" : "default"}>
                          {column.required
                            ? t("admin.catalog.import.required")
                            : t("admin.catalog.import.optional")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted">
                        {importColumnLabel(t, resource, column)}
                      </TableCell>
                      <TableCell className="text-sm text-muted">
                        {column.example == null ? "—" : String(column.example)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </section>

        <FileDropzone
          accept={XLSX_ACCEPT}
          maxBytes={limits.maxFileBytes}
          value={file}
          onChange={selectFile}
          onReject={rejectFile}
          disabled={!!result}
          busy={isProcessing}
          labels={{
            idle: t("admin.catalog.import.dropzoneIdle"),
            active: t("common.fileDropzone.active"),
            select: t("common.fileDropzone.select"),
            replace: t("common.fileDropzone.replace"),
            remove: t("common.fileDropzone.remove"),
            busy: t("admin.catalog.import.processing"),
            hint: t("admin.catalog.import.dropzoneHint", {
              size: formatFileSize(limits.maxFileBytes),
            }),
          }}
        />

        {errors.length > 0 && (
          <Alert variant="danger">
            <p className="flex items-center gap-2 font-medium">
              <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
              {t("admin.catalog.import.validationTitle")}
            </p>
            <p className="mt-1 text-sm">
              {t("admin.catalog.import.validationHelp")}
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
            <p className="flex items-center gap-2 font-medium">
              <CheckCircleIcon className="h-5 w-5 shrink-0" />
              {t("admin.catalog.import.successTitle")}
            </p>
            <p className="mt-1 text-sm">
              {t(`admin.catalog.import.created.${resource}`, {
                count: result.createdCount,
              })}
            </p>
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
              {result.names.slice(0, MAX_LISTED_NAMES).map((name) => (
                <li key={name}>· {name}</li>
              ))}
            </ul>
            {result.names.length > MAX_LISTED_NAMES && (
              <p className="mt-2 text-sm">
                {t("admin.catalog.import.andMore", {
                  count: result.names.length - MAX_LISTED_NAMES,
                })}
              </p>
            )}
          </Alert>
        )}
      </div>
    </Modal>
  );
}
