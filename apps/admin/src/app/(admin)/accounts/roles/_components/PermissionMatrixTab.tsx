"use client";

import {
  PencilIcon,
  ArrowUturnLeftIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { Alert, Button } from "@tarodan/ui";
import { SectionCard } from "@/components/detail/SectionCard";
import { usePermissionMatrix } from "../_lib/usePermissionMatrix";
import { RoleSummaryCards } from "./RoleSummaryCards";
import { PermissionMatrixGrid } from "./PermissionMatrixGrid";
import { PermissionMatrixLegend } from "./PermissionMatrixLegend";

/**
 * "İzin Matrisi" tab: role × page permission grid. Thin composition — all state
 * and behaviour live in `usePermissionMatrix`; the toolbar, role cards, grid and
 * legend are presentational. Super Admin toggles into edit mode and saves via
 * `useAdminMutation`, after which the page reloads to refresh the sidebar filter.
 */
export function PermissionMatrixTab() {
  const t = useTranslations();
  const matrix = usePermissionMatrix();
  const {
    isSuperAdmin,
    matrixLoading,
    matrixError,
    permissions,
    editMode,
    matrixDirty,
    matrixSaving,
    enterEdit,
    saveMatrix,
    cancelEdit,
    resetToDefaults,
  } = matrix;

  return (
    <div className="space-y-4">
      {/* Top control bar */}
      <SectionCard bodyClassName="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-heading">
            {t("admin.roles.matrix.title")}
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            {isSuperAdmin
              ? t("admin.roles.matrix.editHint")
              : t("admin.roles.matrix.viewOnlyHint")}
          </p>
        </div>
        {isSuperAdmin && !matrixError && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {editMode ? (
              <>
                <Button
                  variant="secondary"
                  onClick={resetToDefaults}
                  disabled={matrixSaving}
                  leftIcon={<ArrowUturnLeftIcon className="h-4 w-4" />}
                >
                  {t("admin.roles.matrix.resetToDefaults")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={cancelEdit}
                  disabled={matrixSaving}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={saveMatrix}
                  disabled={!matrixDirty || matrixSaving}
                  isLoading={matrixSaving}
                >
                  {t("common.save")}
                </Button>
              </>
            ) : (
              <Button
                onClick={enterEdit}
                leftIcon={<PencilIcon className="h-4 w-4" />}
              >
                {t("common.edit")}
              </Button>
            )}
          </div>
        )}
      </SectionCard>

      {/* Unsaved changes warning */}
      {editMode && matrixDirty && (
        <Alert
          variant="warning"
          icon={<InformationCircleIcon className="h-4 w-4" />}
        >
          {t("admin.roles.matrix.unsavedWarning")}
        </Alert>
      )}

      {matrixError ? (
        // Matris okunamadı: eksik bir kopya GÖSTERİLMEZ (kaydedilirse tüm
        // rollerin izinleri silinirdi) — düzenleme de kapalı kalır.
        <Alert variant="danger">{t("admin.roles.matrixLoadError")}</Alert>
      ) : matrixLoading ? (
        <SectionCard bodyClassName="flex h-40 items-center justify-center text-sm text-muted">
          {t("admin.roles.matrix.loading")}
        </SectionCard>
      ) : (
        <>
          <RoleSummaryCards permissions={permissions} />
          <PermissionMatrixGrid matrix={matrix} />
          <PermissionMatrixLegend />
        </>
      )}
    </div>
  );
}
