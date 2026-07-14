"use client";

import {
  PencilIcon,
  ArrowUturnLeftIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
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
  const matrix = usePermissionMatrix();
  const {
    isSuperAdmin,
    matrixLoading,
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
      <div className="bg-surface-elevated rounded-lg border border-border p-6 shadow-sm flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-heading">İzin Matrisi</h3>
          <p className="mt-0.5 text-sm text-muted">
            {isSuperAdmin
              ? "Düzenle moduna geçerek her rolün izinlerini tıklayarak değiştirebilirsiniz."
              : "İzin matrisini yalnızca Süper Admin düzenleyebilir."}
          </p>
        </div>
        {isSuperAdmin && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {editMode ? (
              <>
                <Button
                  variant="secondary"
                  onClick={resetToDefaults}
                  disabled={matrixSaving}
                  leftIcon={<ArrowUturnLeftIcon className="h-4 w-4" />}
                >
                  Varsayılana Sıfırla
                </Button>
                <Button
                  variant="secondary"
                  onClick={cancelEdit}
                  disabled={matrixSaving}
                >
                  İptal
                </Button>
                <Button
                  onClick={saveMatrix}
                  disabled={!matrixDirty || matrixSaving}
                  isLoading={matrixSaving}
                >
                  Kaydet
                </Button>
              </>
            ) : (
              <Button
                onClick={enterEdit}
                leftIcon={<PencilIcon className="h-4 w-4" />}
              >
                Düzenle
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Unsaved changes warning */}
      {editMode && matrixDirty && (
        <div className="flex items-center gap-2 rounded-lg border border-warning-200 bg-warning-50 px-4 py-2.5 text-sm text-warning-800">
          <InformationCircleIcon className="h-4 w-4 shrink-0" />
          Kaydedilmemiş değişiklikler var.
        </div>
      )}

      {matrixLoading ? (
        <div className="bg-surface-elevated rounded-lg border border-border p-6 shadow-sm flex h-40 items-center justify-center text-sm text-muted">
          Yükleniyor…
        </div>
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
