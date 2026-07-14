"use client";

import {
  LockClosedIcon,
  CheckIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

/** Static legend explaining the matrix cell states. */
export function PermissionMatrixLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success-500/15">
          <LockClosedIcon className="h-3 w-3 text-success-600" />
        </span>
        Süper Admin — her zaman tam yetkili
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-500/10">
          <CheckIcon className="h-3 w-3 text-primary-600" />
        </span>
        İzin mevcut
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-flex h-5 w-5 items-center justify-center">
          <span className="block h-2 w-2 rounded-full bg-border" />
        </span>
        İzin yok
      </span>
      <span className="flex items-center gap-1.5">
        <InformationCircleIcon className="h-4 w-4 text-muted" />
        İzin adının solundaki ikona tıklayarak açıklama görebilirsiniz
      </span>
    </div>
  );
}
