/** @format */

import { Badge } from '@tarodan/ui';

/**
 * Public/private pill shown over a collection cover. Public → success solid,
 * private → neutral-dark solid. Shared by the collections grid and the detail
 * header so the visibility chip reads from one source (was duplicated `<span>`s).
 */
export default function CollectionVisibilityBadge({
	isPublic,
	label,
}: {
	isPublic: boolean;
	label: string;
}) {
	return (
		<Badge
			variant={isPublic ? 'success' : 'default'}
			appearance='solid'
			size='sm'>
			{label}
		</Badge>
	);
}
