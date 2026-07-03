import { ResourceListRoot } from './ResourceList';
import { ResourceListHeader } from './ResourceListHeader';
import { ResourceListToolbar } from './ResourceListToolbar';
import { ResourceListSearch } from './ResourceListSearch';
import { ResourceListFilterSelect } from './ResourceListFilterSelect';
import { ResourceListTable } from './ResourceListTable';
import { ResourceListPagination } from './ResourceListPagination';
import { ResourceListBulkBar } from './ResourceListBulkBar';
import { ResourceListDateRange } from './ResourceListDateRange';
import { ResourceListTotal } from './ResourceListTotal';

/**
 * Compound list component. Usage:
 *
 *   <ResourceList resource="orders" fetcher={p => adminApi.getOrders(p)}
 *     getRowId={o => o.id} syncUrl initialFilters={{ status: 'all' }}>
 *     <ResourceList.Header title="Siparişler" description={…} actions={…} />
 *     <ResourceList.Toolbar>
 *       <ResourceList.Search placeholder="Sipariş no ara…" />
 *       <ResourceList.FilterSelect name="status" options={statusOptions} />
 *     </ResourceList.Toolbar>
 *     <ResourceList.Table columns={columns} onRowClick={…} />
 *     <ResourceList.Pagination />
 *   </ResourceList>
 */
export const ResourceList = Object.assign(ResourceListRoot, {
  Header: ResourceListHeader,
  Toolbar: ResourceListToolbar,
  Search: ResourceListSearch,
  FilterSelect: ResourceListFilterSelect,
  DateRange: ResourceListDateRange,
  Table: ResourceListTable,
  Pagination: ResourceListPagination,
  BulkBar: ResourceListBulkBar,
  Total: ResourceListTotal,
});

export { useResourceList, useFilter } from './context';
export type { ResourceListProps } from './ResourceList';
