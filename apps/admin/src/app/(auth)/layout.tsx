/** @format */

import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server/session';

/**
 * Layout for unauthenticated pages (login, forgot-password). Server Component:
 * if a valid session already exists, bounce to the app before rendering.
 * No admin chrome — just a centered card frame with the brand.
 */
export default async function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await getSession();
	if (session) redirect('/dashboard');

	return (
		<div className='flex min-h-screen items-center justify-center bg-gradient-to-br from-surface via-surface-elevated to-surface-alt px-4'>
			<div className='w-full max-w-md'>
				<div className='mb-8 text-center'>
					<Image
						src='/tarodan-logo.jpg'
						alt='Tarodan'
						width={200}
						height={65}
						priority
						className='mx-auto object-contain'
						style={{
							width: 'auto',
							height: 'auto',
							maxWidth: '100%',
							maxHeight: '65px',
						}}
					/>
				</div>

				{children}

				<p className='mt-6 text-center text-sm text-muted'>
					© 2026 Tarodan Marketplace. Tüm hakları saklıdır.
				</p>
			</div>
		</div>
	);
}
