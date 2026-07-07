/** @format */

import Link from 'next/link';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';

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
		<div className='rounded-lg border border-border bg-surface-elevated p-8 text-center'>
			<ExclamationTriangleIcon className='mx-auto h-10 w-10 text-warning-500' />
			<p className='mt-4 text-lg text-heading'>{error}</p>
			<div className='mt-6'>
				{companyNameHint ? (
					<Button asChild>
						<Link href='/profile'>Şirket Adı Ekle</Link>
					</Button>
				) : (
					<Button asChild>
						<Link href='/pricing'>Üyeliğimi Yükselt</Link>
					</Button>
				)}
			</div>
		</div>
	);
}
