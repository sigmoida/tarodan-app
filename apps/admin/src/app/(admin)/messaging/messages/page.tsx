/** @format */

'use client';

import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { ResourceList } from '@/components/list';
import {
	type Message,
	mapMessage,
	mapFilterToApiStatus,
	messageFilterOptions,
} from './_lib/types';
import { MessagesSummary } from './_components/MessagesSummary';
import { MessagesTable } from './_components/MessagesTable';

export default function MessagesPage() {
	return (
		<AdminPage>
			<PageHeader
				title='Mesaj Moderasyonu'
				description={<MessagesSummary />}
			/>
			<ResourceList<Message>
				resource='messages'
				fetcher={(params) => {
					const { status, ...rest } = params;
					return adminApi
						.getMessages({ ...rest, status: mapFilterToApiStatus(status) })
						.then((res) => {
							const root = res.data ?? {};
							const raw = root.data ?? root.messages ?? root.items ?? [];
							const total = root.meta?.total ?? root.total ?? raw.length;
							return {
								...res,
								data: { data: raw.map(mapMessage), meta: { total } },
							};
						});
				}}
				getRowId={(m) => m.id}
				syncUrl
				initialFilters={{ status: 'pending' }}
				>
				<ResourceList.Toolbar>
					<ResourceList.Search />
					<ResourceList.FilterSelect
						name='status'
						options={messageFilterOptions}
						className='sm:w-48'
					/>
				</ResourceList.Toolbar>
				<MessagesTable />
				<ResourceList.Pagination />
			</ResourceList>
		</AdminPage>
	);
}
