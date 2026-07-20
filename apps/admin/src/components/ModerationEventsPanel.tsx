/** @format */

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, type StatusConfig } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { ResourceList, useResourceList } from '@/components/list';
import { col, Empty } from '@/components/table';
import { type ColumnDef } from '@/components/DataTable';
import { type AdminTab } from '@/components/AdminTabs';

// ─── Type ────────────────────────────────────────────────────────────────────

export interface ModerationEvent {
	id: string;
	entityType: string;
	entityId: string | null;
	userId: string | null;
	user?: { id: string; displayName: string; email: string } | null;
	kind: string; // image | text
	field: string | null;
	decision: string; // pass | review | flag | blocked
	relevanceScore: number | null;
	nsfwScore: number | null;
	labels?: Array<{ label: string; score: number }> | null;
	reason: string | null;
	createdAt: string;
}

// ─── Label dictionaries ──────────────────────────────────────────────────────

const ENTITY_LABELS: Record<string, string> = {
	product: 'Ürün',
	user: 'Kullanıcı',
	collection: 'Koleksiyon',
	upload: 'Yükleme',
	message: 'Mesaj',
};

const FIELD_LABELS: Record<string, string> = {
	avatar: 'Avatar',
	bio: 'Biyografi',
	display_name: 'Görünen ad',
	cover: 'Kapak görseli',
	item: 'Koleksiyon öğesi',
	product_image: 'Ürün görseli',
	message_image: 'Mesaj görseli',
	upload: 'Yükleme',
	name: 'Ad',
	description: 'Açıklama',
	title: 'Başlık',
	comment: 'Yorum',
};

const DECISION_OPTIONS = [
	{ value: '', label: 'Tüm sonuçlar' },
	{ value: 'blocked', label: 'Engellenen' },
	{ value: 'flag', label: 'Uygunsuz' },
	{ value: 'review', label: 'İnceleme' },
	{ value: 'pass', label: 'Temiz' },
];

/** AI moderation decision → badge. Anything outside the known values counts as "pass". */
const decisionConfig: Record<string, StatusConfig> = {
	blocked: { label: 'Engellendi', variant: 'danger' },
	flag: { label: 'Uygunsuz', variant: 'danger' },
	review: { label: 'İnceleme', variant: 'warning' },
	pass: { label: 'Temiz', variant: 'success' },
};

const decisionKey = (d: string) =>
	d === 'blocked' || d === 'flag' || d === 'review' ? d : 'pass';

/** Admin detail route from entity type + id (null if none). */
function entityHref(e: ModerationEvent): string | null {
	if (!e.entityId) return null;
	if (e.entityType === 'product') return `/catalog/products/${e.entityId}`;
	if (e.entityType === 'user') return `/accounts/users/${e.entityId}`;
	return null;
}

function moderationColumns(
	withEntityCol: boolean,
): ColumnDef<ModerationEvent, unknown>[] {
	const cols: ColumnDef<ModerationEvent, unknown>[] = [];
	if (withEntityCol) {
		cols.push(
			col.custom<ModerationEvent>(
				'Varlık',
				(e) => {
					const label = ENTITY_LABELS[e.entityType] ?? e.entityType;
					const href = entityHref(e);
					return href ? (
						<Link
							href={href}
							className='text-primary-600 hover:underline'>
							{label}
						</Link>
					) : (
						<span className='text-body'>{label}</span>
					);
				},
				{ minWidth: 110 },
			),
		);
	}
	cols.push(
		col.text<ModerationEvent>(
			'Tür',
			(e) =>
				`${e.kind === 'text' ? 'Metin' : 'Görsel'}${
					e.field ? ` · ${FIELD_LABELS[e.field] ?? e.field}` : ''
				}`,
			{ minWidth: 140 },
		),
		col.badge<ModerationEvent>('Sonuç', (e) => (
			<Badge status={decisionKey(e.decision)} config={decisionConfig} />
		)),
		col.custom<ModerationEvent>(
			'İlgililik',
			(e) =>
				e.relevanceScore != null ? (
					<span className='whitespace-nowrap tabular-nums text-body'>
						%{Math.round(e.relevanceScore * 100)}
					</span>
				) : (
					<Empty />
				),
			{ align: 'right', minWidth: 100 },
		),
		col.custom<ModerationEvent>(
			'Uygunsuzluk',
			(e) =>
				e.nsfwScore != null ? (
					<span className='whitespace-nowrap tabular-nums text-body'>
						%{(e.nsfwScore * 100).toFixed(2)}
					</span>
				) : (
					<Empty />
				),
			{ align: 'right', minWidth: 110 },
		),
		col.text<ModerationEvent>('Sebep', (e) => e.reason, { grow: 2 }),
		col.user<ModerationEvent>('Kullanıcı', (e) =>
			e.user
				? {
						name: e.user.displayName || e.user.email,
						href: `/accounts/users/${e.user.id}`,
					}
				: null,
		),
		col.date<ModerationEvent>('Tarih', (e) => e.createdAt),
	);
	return cols;
}

function ModerationCount() {
	const { total } = useResourceList<ModerationEvent>();
	return <>{`${total} AI denetim kaydı`}</>;
}

function ExpandedRow({ e }: { e: ModerationEvent }) {
	return (
		<div className='space-y-2 bg-surface-alt px-4 py-3 text-sm'>
			{e.reason && (
				<div>
					<span className='font-medium text-heading'>Sebep: </span>
					<span className='text-muted'>{e.reason}</span>
				</div>
			)}
			{e.relevanceScore != null && (
				<div>
					<span className='font-medium text-heading'>İlgililik: </span>
					<span className='text-muted'>
						%{Math.round(e.relevanceScore * 100)}
					</span>
					<span className='ml-4 font-medium text-heading'>Uygunsuzluk: </span>
					<span className='text-muted'>
						%{((e.nsfwScore ?? 0) * 100).toFixed(2)}
					</span>
				</div>
			)}
			{e.labels && e.labels.length > 0 && (
				<div>
					<span className='font-medium text-heading'>Etiketler: </span>
					<span className='text-muted'>
						{e.labels
							.map((l) => `${l.label} (%${Math.round(l.score * 100)})`)
							.join(' · ')}
					</span>
				</div>
			)}
		</div>
	);
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface ModerationEventsPanelProps {
	/** If set, only events of this type (e.g. "product", "user", "collection"). */
	entityType?: string;
	/** If set, events of a single entity. */
	entityId?: string;
	/** If set, events produced by a single user. */
	userId?: string;
	title?: string;
	description?: string;
	/** Show the entity type column. If unspecified: auto-on when there is no entityType. */
	showEntityColumn?: boolean;
	// Page tabs (optional) — passed so the tab bar stays visible while the AI tab is active.
	tabs?: AdminTab[];
	activeTab?: string;
	onTabChange?: (key: string) => void;
	/**
	 * Whether to render its own header/tab bar (default: true). If the page already
	 * provides a persistent header + AdminTabs, pass `false` → content only
	 * (Suspense covers only the content; header/tabs stay fixed on the page).
	 */
	chrome?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * The SINGLE shared view of the AI moderation event log. Every "AI Audit" tab
 * (Products/Users/Collections) and the System page uses it; only entityType/
 * entityId change. SAME stack as the list pages: ResourceList + col.* +
 * ResourceList.Header — so the structure/table stays consistent across tabs.
 */
export function ModerationEventsPanel({
	entityType,
	entityId,
	userId,
	title = 'AI Denetim',
	description,
	showEntityColumn,
	tabs,
	activeTab,
	onTabChange,
	chrome = true,
}: ModerationEventsPanelProps) {
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const withEntityCol = showEntityColumn ?? !entityType;
	const columns = moderationColumns(withEntityCol);

	return (
		<ResourceList<ModerationEvent>
			resource={`moderation-events:${entityType ?? 'all'}:${entityId ?? ''}:${userId ?? ''}`}
			fetcher={(params) => {
				const { limit, ...rest } = params;
				return adminApi.get('/admin/moderation/events', {
					params: { ...rest, pageSize: limit, entityType, entityId, userId },
				});
			}}
			getRowId={(r) => r.id}
			syncUrl
			initialFilters={{ decision: '' }}
			>
			{chrome && (
				<ResourceList.Header
					title={title}
					description={description ?? <ModerationCount />}
					tabs={tabs}
					activeTab={activeTab}
					onTabChange={onTabChange}
				/>
			)}
			<ResourceList.Toolbar>
				<ResourceList.Search />
				<ResourceList.FilterSelect
					name='decision'
					options={DECISION_OPTIONS}
					className='sm:w-56'
				/>
			</ResourceList.Toolbar>
			<ResourceList.Table
				columns={columns}
				emptyText='AI denetim kaydı yok'
				expandedId={expandedId}
				renderExpanded={(r) => <ExpandedRow e={r} />}
				onRowClick={(r) => setExpandedId(expandedId === r.id ? null : r.id)}
			/>
			<ResourceList.Pagination />
		</ResourceList>
	);
}
