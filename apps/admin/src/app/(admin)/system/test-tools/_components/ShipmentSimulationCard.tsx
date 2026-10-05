"use client";

import { useState } from "react";
import { Alert, Button, Input } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataTable } from "@/components/DataTable";
import { useConfirm } from "@/provider/ConfirmProvider";
import type {
  SimulatableParcel,
  SimulatedCarrierStep,
} from "@/lib/api/system.types";
import { shipmentSimulationColumns } from "../_lib/columns";
import { simulationRowId, simulationStepKey } from "../_lib/simulation";
import { useShipmentSimulation } from "../_lib/useShipmentSimulation";

/**
 * UAT kargo simülasyonu: taşıyıcıya hiç gitmeyen koliyi (staging sahte kargo,
 * test şeridi) taşıyıcı haber vermiş gibi ilerletir. Okuma gerçek kargo takip
 * hattından geçer; kart yalnız API'nin sunduğu adımları gösterir.
 */
export function ShipmentSimulationCard({ isProd }: { isProd: boolean }) {
  const t = useTranslations();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const { parcels, isSearching, hasSearched, search, simulate } =
    useShipmentSimulation();

  const pendingRowId =
    simulate.isPending && simulate.variables
      ? simulationRowId(simulate.variables)
      : null;

  const askSimulate = (parcel: SimulatableParcel, step: SimulatedCarrierStep) =>
    confirm({
      title: t("admin.system.testTools.simulation.confirmTitle"),
      confirmLabel: t("admin.system.testTools.simulation.apply"),
      description: (
        <div className="space-y-2 text-sm">
          <p className="text-muted">
            {t("admin.system.testTools.simulation.confirmDescription", {
              reference: parcel.reference,
              step: t(simulationStepKey(parcel.kind, step)),
            })}
          </p>
          {isProd && (
            <p className="text-xs text-danger-700">
              {t("admin.system.testTools.prodDataWarning")}
            </p>
          )}
        </div>
      ),
      onConfirm: () =>
        simulate.mutateAsync({ kind: parcel.kind, id: parcel.id, step }),
    });

  const columns = shipmentSimulationColumns(
    { onStep: askSimulate, pendingRowId },
    t,
  );

  return (
    <SectionCard
      title={t("admin.system.testTools.simulation.title")}
      bodyClassName="space-y-4"
    >
      <p className="-mt-2 text-sm text-muted">
        {t("admin.system.testTools.simulation.description")}
      </p>
      {isProd && (
        <Alert variant="warning">
          {t("admin.system.testTools.simulation.liveNotice")}
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Input
          label={t("admin.system.testTools.simulation.searchLabel")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search(q)}
          className="min-w-[220px] flex-1"
        />
        <Button onClick={() => search(q)} isLoading={isSearching}>
          {t("common.search")}
        </Button>
      </div>

      {/* Non-list DataTable (#383): ad-hoc search-tool results, not a
          paginated resource list — no sort/search wiring by design. */}
      {parcels.length > 0 ? (
        <DataTable
          columns={columns}
          data={parcels}
          getRowId={simulationRowId}
        />
      ) : (
        hasSearched &&
        !isSearching && (
          <p className="text-sm text-muted">
            {t("admin.system.testTools.noResults")}
          </p>
        )
      )}
    </SectionCard>
  );
}
