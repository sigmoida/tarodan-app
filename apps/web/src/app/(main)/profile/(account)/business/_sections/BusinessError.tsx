/** @format */

import Link from 'next/link';
import { Button } from '@tarodan/ui';
import { EmptyStateCard } from '../../../_components/EmptyStateCard';

/** Backend hints that the company name is missing → send the user to /profile;
 * otherwise the account simply isn't a business tier → send them to /pricing. */
function needsCompanyName(error: string): boolean {
	return (
		error.includes('şirket adı') ||
		error.includes('companyName') ||
		error.includes('Şirket adı')
	);
}

export default function BusinessError({ error }: { error: string }) {
	const companyNameHint = needsCompanyName(error);

	return (
		<EmptyStateCard
			title={error}
			action={
				companyNameHint ? (
					<Button asChild>
						<Link href='/profile'>Şirket Adı Ekle</Link>
					</Button>
				) : (
					<Button asChild>
						<Link href='/pricing'>Üyeliğimi Yükselt</Link>
					</Button>
				)
			}
		/>
	);
}
