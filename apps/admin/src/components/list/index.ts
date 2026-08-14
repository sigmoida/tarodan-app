import { ResourceListRoot } from "./ResourceList";
import { ResourceListHeader } from "./ResourceListHeader";
import { ResourceListToolbar } from "./ResourceListToolbar";
import { ResourceListSearch } from "./ResourceListSearch";
import { ResourceListTable } from "./ResourceListTable";
import { ResourceListPagination } from "./ResourceListPagination";
import { ResourceListBulkBar } from "./ResourceListBulkBar";
import { ResourceListTotal } from "./ResourceListTotal";

/**
 * Compound list component. Usage:
 *
 *   <ResourceList resource="orders" fetcher={p => adminApi.getOrders(p)}
 *     getRowId={o => o.id} syncUrl filters={orderFilterFields(t)}>
 *     <ResourceList.Header title="Siparişler" description={…} actions={…} />
 *     <ResourceList.Toolbar />
 *     <ResourceList.Table columns={columns} onRowClick={…} />
 *     <ResourceList.Pagination />
 *   </ResourceList>
 *
 * Filters are declared as a schema on the root (`filters`), not as toolbar
 * children — the toolbar renders them as a dialog behind its funnel button and
 * derives `initialFilters` from the same schema. See `filters/types.ts`.
 *
 * `Search` is exported for the rare list that shows a search box outside a
 * toolbar (catalog/attributes' master-detail panel); ordinary lists get it from
 * `Toolbar`.
 */
export const ResourceList = Object.assign(ResourceListRoot, {
  Header: ResourceListHeader,
  Toolbar: ResourceListToolbar,
  Search: ResourceListSearch,
  Table: ResourceListTable,
  Pagination: ResourceListPagination,
  BulkBar: ResourceListBulkBar,
  Total: ResourceListTotal,
});

export { useResourceList } from "@/context/ResourceListContext";
export type { ResourceListProps } from "./ResourceList";
